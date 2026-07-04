// server.js — tiny Express server that serves the static app + gates AI access.
//
// Why this exists:
//   GitHub Pages is static-only and cannot hide secrets. If we baked the
//   Anthropic API key into browser JS, anyone could steal it via view-source.
//   This server holds ANTHROPIC_API_KEY in process memory (from Render env),
//   proxies chat requests to Anthropic, and gates usage behind two rotating
//   daily passwords so only invited friends can use the AI features.
//
// Password scheme (rotates daily, Central Time "tomorrow"):
//   SITE:    <SITE_PW_PREFIX>    + tomorrow's 2-digit day
//   PREMIUM: <PREMIUM_PW_PREFIX> + tomorrow's 2-digit day
//   The PREFIXES are SECRETS supplied via env vars (SITE_PW_PREFIX /
//   PREMIUM_PW_PREFIX) and are NOT in source. Only invited friends know
//   them. This repo is public, so a hard-coded prefix would let anyone
//   compute the daily password and burn the API key. Set them in Render.
//
// Two HTTP endpoints:
//   POST /api/gate    { password }        -> sets httpOnly cookie with tier
//   POST /api/ai      { model, ... }      -> proxies to Anthropic if allowed
//
// Everything else is served statically (HTML, JS, CSS, WASM, SVG).

import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runMigrations, dbEnabled } from './src/server/db.js';
import { wireAuth } from './src/server/auth.js';
import { wireGames } from './src/server/games.js';
import { wireVariations } from './src/server/variations.js';
import { wireLibrary } from './src/server/library.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT       = Number(process.env.PORT || 8000);
const API_KEY    = process.env.ANTHROPIC_API_KEY || '';
const TZ         = 'America/Chicago';            // Central US — user's choice
const COOKIE_TTL = 1000 * 60 * 60 * 12;          // 12h — forces re-auth daily

// Password prefixes are SECRETS from env. Fallbacks exist ONLY so local
// dev (localhost, no env) keeps working; in that mode we warn loudly. In
// production these MUST be set in Render, otherwise the public repo would
// reveal the daily password formula (see file header + REVIEW audit S1).
const SITE_PW_PREFIX    = process.env.SITE_PW_PREFIX    || '';
const PREMIUM_PW_PREFIX = process.env.PREMIUM_PW_PREFIX || '';
const PW_PREFIXES_SET   = !!(SITE_PW_PREFIX && PREMIUM_PW_PREFIX);

if (!API_KEY) {
  console.warn('⚠  ANTHROPIC_API_KEY is not set — AI endpoints will return 503');
}
if (!PW_PREFIXES_SET) {
  console.warn('⚠  SITE_PW_PREFIX / PREMIUM_PW_PREFIX not set — using INSECURE dev fallbacks. ' +
               'Set both in Render before exposing this server, or the gate is bypassable.');
}

// ───────────────────────────────────────────────────────────────────────
//   Password helpers
// ───────────────────────────────────────────────────────────────────────

// Return the 2-digit day of "tomorrow" in Central Time, regardless of
// where the server is physically running (Render boxes default to UTC).
function tomorrowDayCT() {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const parts = fmt.formatToParts(new Date());
  const y = Number(parts.find(p => p.type === 'year').value);
  const m = Number(parts.find(p => p.type === 'month').value);
  const d = Number(parts.find(p => p.type === 'day').value);
  // Build a UTC date from the CT calendar, advance by 1 day, read its
  // day-of-month — it'll wrap month/year correctly.
  const tomorrow = new Date(Date.UTC(y, m - 1, d + 1));
  return String(tomorrow.getUTCDate()).padStart(2, '0');
}

// Dev fallbacks used ONLY when env prefixes are unset (localhost). These
// are intentionally NOT the historical production prefixes — the old ones
// leaked in git history, so they're rotated here too.
const DEV_SITE_PREFIX    = 'devsite';
const DEV_PREMIUM_PREFIX = 'devprem';

function expectedSitePassword() {
  return (SITE_PW_PREFIX || DEV_SITE_PREFIX) + tomorrowDayCT();
}
function expectedPremiumPassword() {
  return (PREMIUM_PW_PREFIX || DEV_PREMIUM_PREFIX) + tomorrowDayCT();
}

// Constant-time string compare to avoid leaking length via timing.
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Tier helper: a request's tier is the highest cookie it holds.
function readTier(req) {
  const today = tomorrowDayCT();
  const site    = req.cookies?.sf_site    === today;
  const premium = req.cookies?.sf_premium === today;
  if (premium) return 'premium';
  if (site)    return 'basic';
  return 'none';
}

// Decide which model tier something requires.
function modelTier(model) {
  const m = String(model || '').toLowerCase();
  if (m.includes('haiku')) return 'basic';
  return 'premium'; // opus + sonnet + anything else default to premium
}

// ───────────────────────────────────────────────────────────────────────
//   App
// ───────────────────────────────────────────────────────────────────────

const app = express();
app.set('trust proxy', 1);
app.use(cookieParser());
app.use(express.json({ limit: '256kb' }));

// Cross-origin isolation (needed for SharedArrayBuffer → multi-threaded
// Stockfish). WASM files also get CORP so they can load cross-origin.
app.use((req, res, next) => {
  res.setHeader('Cross-Origin-Opener-Policy',   'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  if (req.path.startsWith('/assets/stockfish/') || req.path.endsWith('.wasm')) {
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  }
  if (req.path.endsWith('.wasm')) res.setHeader('Content-Type', 'application/wasm');
  // sw.js MUST never be browser-cached.
  if (req.path === '/sw.js') {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Service-Worker-Allowed', '/');
  }
  // Engine assets that are content-addressed (vendored from npm with
  // explicit versions, NNUE files with hash filenames) genuinely never
  // change at a given URL without a redeploy. `immutable` is correct
  // for them — single biggest win for repeat-visit cold-boot.
  //
  // EXCEPTION: lichess-shim.js is OUR file that we update across
  // deploys but keeps the same URL. `immutable` would lock browsers
  // on stale versions for up to a year. Use must-revalidate instead
  // (browser sends If-Modified-Since on next visit, gets 304 if
  // unchanged — cheap).
  if (req.path === '/assets/stockfish-web/lichess-shim.js') {
    res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
  } else if (req.path.startsWith('/assets/stockfish/') ||
             req.path.startsWith('/assets/stockfish-web/') ||
             req.path.startsWith('/assets/nnue/')) {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  }
  next();
});

// ───── /api/gate ─────
// Accepts a password, validates against today's site + premium passwords,
// sets cookies. No rate limiting yet — it's a friend group; if abuse shows
// up, add express-rate-limit.
app.post('/api/gate', (req, res) => {
  const pw  = String(req.body?.password || '');
  const day = tomorrowDayCT();

  // Only set the Secure flag on HTTPS connections (Render proxies HTTPS →
  // HTTP, so we trust x-forwarded-proto via `app.set('trust proxy')`).
  // Locally on http://localhost:8000 browsers would reject Secure cookies.
  const cookieOpts = {
    httpOnly: true, sameSite: 'lax', secure: !!req.secure,
    maxAge: COOKIE_TTL, path: '/',
  };

  let result = { tier: 'none', ok: false };
  if (safeEqual(pw, expectedSitePassword())) {
    res.cookie('sf_site', day, cookieOpts);
    result = { tier: 'basic', ok: true };
  } else if (safeEqual(pw, expectedPremiumPassword())) {
    // Premium unlock — grant both cookies so premium always implies site access.
    res.cookie('sf_site',    day, cookieOpts);
    res.cookie('sf_premium', day, cookieOpts);
    result = { tier: 'premium', ok: true };
  }
  res.json(result);
});

// ───── /api/whoami ─────
// Lightweight tier check (used by the client on page load to decide whether
// to show the password gate).
app.get('/api/whoami', (req, res) => {
  res.json({ tier: readTier(req) });
});

// ───── /api/logout ─────
app.post('/api/logout', (req, res) => {
  res.clearCookie('sf_site',    { path: '/' });
  res.clearCookie('sf_premium', { path: '/' });
  res.json({ ok: true });
});

// ───── /api/ai ─────
// Proxy to Anthropic. Body should match Anthropic's /v1/messages shape:
//   { model, max_tokens, system, messages }
app.post('/api/ai', async (req, res) => {
  const tier = readTier(req);
  if (tier === 'none') {
    return res.status(401).json({ error: 'Site locked. Enter the site password first.' });
  }
  if (!API_KEY) {
    return res.status(503).json({ error: 'Server has no ANTHROPIC_API_KEY configured.' });
  }

  const body = req.body || {};
  const model = String(body.model || 'claude-haiku-4-5');
  const need  = modelTier(model);
  if (need === 'premium' && tier !== 'premium') {
    return res.status(402).json({
      error: `Model "${model}" requires premium unlock (Dooha + tomorrow's day).`,
      need: 'premium',
    });
  }

  // Minimal sanity clamps so a hostile client can't ask for a million tokens.
  const payload = {
    model,
    max_tokens: Math.min(Number(body.max_tokens) || 1200, 4000),
    system:   body.system   || undefined,
    messages: body.messages || [],
  };

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type':      'application/json',
        'x-api-key':         API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(payload),
    });
    const text = await r.text();
    res.status(r.status).type('application/json').send(text);
  } catch (err) {
    res.status(502).json({ error: `Upstream error: ${err.message}` });
  }
});

// Wire DB-backed API endpoints BEFORE the static handler so
// /api/auth/* and /api/games/* hit the JSON endpoints, not static.
wireAuth(app);
wireGames(app);
wireVariations(app);
wireLibrary(app);

// ───── source/secret blocklist (audit S2) ─────
// express.static(__dirname) serves the REPO ROOT, so without this guard
// GET /server.js, /src/server/db.js, /HANDOFF.md, /render.yaml, etc. are
// all downloadable from the live site — leaking server code, schema, and
// (pre-S1) the password scheme. The browser legitimately needs /src/*.js
// CLIENT modules (main.js imports engine.js, board.js, …) but NOT the
// server tree. 404 anything that isn't a real static asset.
//
// dotfiles (.git, .gitignore, .env) are already withheld by express.static's
// default `dotfiles: 'ignore'`, so we don't need to list them.
const BLOCKED_EXACT = new Set(['/server.js', '/package.json', '/package-lock.json']);
function isBlockedPath(p) {
  if (BLOCKED_EXACT.has(p)) return true;
  if (p.startsWith('/src/server/')) return true;   // server-only code
  if (p.startsWith('/scripts/'))    return true;   // build/fetch scripts
  if (p.endsWith('.md'))   return true;            // HANDOFF, REVIEW, CONSULTATION…
  if (p.endsWith('.yaml') || p.endsWith('.yml')) return true;  // render.yaml
  if (p.endsWith('.sh'))   return true;
  if (p.endsWith('.mjs') && p.startsWith('/scripts')) return true;
  return false;
}
app.use((req, res, next) => {
  if (isBlockedPath(req.path)) {
    return res.status(404).type('text/plain').send('Not found');
  }
  next();
});

// ───── static site ─────
// Served after the API routes so /api/* takes precedence.
app.use(express.static(__dirname, {
  index: 'index.html',
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.wasm')) res.setHeader('Content-Type', 'application/wasm');
  },
}));

// Boot: run DB migrations (idempotent) then start listening.
(async () => {
  try {
    if (dbEnabled()) {
      await runMigrations();
      console.log('[db] connected + migrations applied');
    } else {
      console.log('[db] DATABASE_URL not set — running in localStorage-only mode');
    }
  } catch (err) {
    console.error('[db] migration failed — server will still start, DB features will 500', err);
  }
  app.listen(PORT, () => {
    console.log(`stockfish-explain server listening on :${PORT}`);
    console.log(`today's site password:    ${expectedSitePassword()}`);
    console.log(`today's premium password: ${expectedPremiumPassword()}`);
  });
})();
