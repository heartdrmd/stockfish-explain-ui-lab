// server.js — tiny Express server that serves the static app + gates AI access.
//
// Why this exists:
//   GitHub Pages is static-only and cannot hide secrets. If we baked the
//   Anthropic API key into browser JS, anyone could steal it via view-source.
//   This server holds ANTHROPIC_API_KEY in process memory (from Render env),
//   proxies chat requests to Anthropic, and gates usage behind rotating
//   daily passwords so only invited friends can use the AI features.
//
// Password scheme (rotates daily, Central Time "tomorrow"):
//   SITE:    <SITE_PW_PREFIX>    + tomorrow's 2-digit day
//   PREMIUM: <PREMIUM_PW_PREFIX> + tomorrow's 2-digit day
//   PAID AI: <AI_SPEND_PW_PREFIX> + the 2-digit CT day five days ahead
//   The PREFIXES are SECRETS supplied via env vars (SITE_PW_PREFIX /
//   PREMIUM_PW_PREFIX) and are NOT in source. Only invited friends know
//   them. This repo is public, so a hard-coded prefix would let anyone
//   compute the daily password and burn the API key. Set them in Render.
//
// Two HTTP endpoints:
//   POST /api/gate    { password }        -> sets httpOnly cookie with tier
//   POST /api/ai-spend-lock/unlock        -> explicitly permits paid requests
//   POST /api/ai      { model, ... }      -> proxies to Anthropic if allowed
//
// Everything else is served statically (HTML, JS, CSS, WASM, SVG).

import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { runMigrations, dbEnabled } from './src/server/db.js';
import { wireAuth } from './src/server/auth.js';
import { wireGames } from './src/server/games.js';
import { wireVariations } from './src/server/variations.js';
import { wireLibrary } from './src/server/library.js';
import { wireBoardSettings } from './src/server/board-settings.js';
import { wireSync } from './src/server/sync.js';
import { installAssetCache } from './src/server/asset-cache.js';
import {
  AI_SPEND_COOKIE,
  aiSpendStampCT,
  expectedAISpendPassword,
  hasCurrentAISpendCookie,
} from './src/server/ai-spend-lock.js';

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
const AI_SPEND_PW_PREFIX= process.env.AI_SPEND_PW_PREFIX || '';
const PW_PREFIXES_SET   = !!(SITE_PW_PREFIX && PREMIUM_PW_PREFIX);

if (!API_KEY) {
  console.warn('⚠  ANTHROPIC_API_KEY is not set — AI endpoints will return 503');
}
if (!PW_PREFIXES_SET) {
  console.warn('⚠  SITE_PW_PREFIX / PREMIUM_PW_PREFIX not set — using INSECURE dev fallbacks. ' +
               'Set both in Render before exposing this server, or the gate is bypassable.');
}
if (!AI_SPEND_PW_PREFIX) {
  console.warn('⚠  AI_SPEND_PW_PREFIX is not set. The paid-AI master lock will fail safe and cannot be unlocked in production.');
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

// Dev fallbacks used ONLY when env prefixes are unset AND we're not in
// production (i.e. localhost). In PRODUCTION with unset prefixes we fail
// SAFE: return an unguessable random each call so NO password passes the
// gate (better a temporarily-locked AI coach than a public dev password
// that anyone reading this repo could use to burn the API key).
const IS_PROD = process.env.NODE_ENV === 'production';
const DEV_SITE_PREFIX    = 'devsite';
const DEV_PREMIUM_PREFIX = 'devprem';
const DEV_AI_SPEND_PREFIX= 'devspend';

function unguessable() { return crypto.randomBytes(24).toString('hex'); }

function expectedSitePassword() {
  if (SITE_PW_PREFIX) return SITE_PW_PREFIX + tomorrowDayCT();
  if (IS_PROD) return unguessable();            // fail safe
  return DEV_SITE_PREFIX + tomorrowDayCT();     // localhost only
}
function expectedPremiumPassword() {
  if (PREMIUM_PW_PREFIX) return PREMIUM_PW_PREFIX + tomorrowDayCT();
  if (IS_PROD) return unguessable();            // fail safe
  return DEV_PREMIUM_PREFIX + tomorrowDayCT();  // localhost only
}
function expectedPaidAIUnlockPassword() {
  if (AI_SPEND_PW_PREFIX) return expectedAISpendPassword(AI_SPEND_PW_PREFIX);
  if (IS_PROD) return unguessable();            // fail safe
  return expectedAISpendPassword(DEV_AI_SPEND_PREFIX); // localhost only
}

// Constant-time compare that does NOT leak length (audit S6). Hash both
// sides to fixed-width SHA-256 digests first, then timingSafeEqual — so
// neither the length nor the matching-prefix length is observable via
// timing or early return.
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
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

function isPaidAIUnlocked(req) {
  return hasCurrentAISpendCookie(req.cookies?.[AI_SPEND_COOKIE]);
}

function secureCookieOptions(req) {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: !!req.secure,
    maxAge: COOKIE_TTL,
    path: '/',
  };
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

// ───────────────────────────────────────────────────────────────────────
//   Rate limiting (audit S4) — hand-rolled, in-memory.
//   Render runs a single web instance, so a per-process Map is sufficient
//   (no Redis needed). Fixed-window per key; sweeps expired buckets lazily.
// ───────────────────────────────────────────────────────────────────────
function rateLimit({ windowMs, max, keyFn, message }) {
  const hits = new Map();   // key -> { count, resetAt }
  return (req, res, next) => {
    const now = Date.now();
    const key = (keyFn ? keyFn(req) : req.ip) || 'unknown';
    let b = hits.get(key);
    if (!b || b.resetAt <= now) {
      b = { count: 0, resetAt: now + windowMs };
      hits.set(key, b);
    }
    b.count++;
    // Opportunistic cleanup so the Map can't grow unbounded under churn.
    if (hits.size > 5000) {
      for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
    }
    if (b.count > max) {
      const retryS = Math.ceil((b.resetAt - now) / 1000);
      res.setHeader('Retry-After', String(retryS));
      return res.status(429).json({ error: message || 'Too many requests. Slow down.', retryAfter: retryS });
    }
    next();
  };
}
// Brute-force-sensitive (gate + auth): tight per-IP window.
const authLimiter  = rateLimit({ windowMs: 15 * 60_000, max: 30,  message: 'Too many attempts. Wait a few minutes.' });
// Cost-sensitive AI proxy: per-IP hourly cap.
const aiLimiter    = rateLimit({ windowMs: 60 * 60_000, max: 120, message: 'AI request limit reached for this hour.' });
// General write endpoints: generous, just a runaway/DoS backstop.
const writeLimiter = rateLimit({ windowMs: 15 * 60_000, max: 600, message: 'Too many writes. Slow down.' });
// Export so the DB-backed route modules can reuse the same limiters.
app.locals.limiters = { authLimiter, aiLimiter, writeLimiter };

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
  } else if (req.path.startsWith('/src/') || req.path.endsWith('.js') ||
             req.path === '/' || req.path.endsWith('.html') ||
             req.path.endsWith('.css')) {
    // Our own app code (src/*.js, index.html, styles). These change on
    // every deploy at the SAME URL. `max-age=0` alone let Chrome's memory
    // cache serve a STALE copy within a session — a user whose tab was
    // open across a deploy kept running old JS and never got fixes
    // (observed 2026-07-04: browser ran a pre-fix engine.js). `no-cache`
    // forbids using any cached copy without revalidating first (still
    // allows a cheap 304 when unchanged), so a normal reload always
    // picks up the latest deploy.
    res.setHeader('Cache-Control', 'no-cache');
  }
  next();
});

// ───── /api/gate ─────
// Accepts a password, validates against today's site + premium passwords,
// sets cookies. No rate limiting yet — it's a friend group; if abuse shows
// up, add express-rate-limit.
app.post('/api/gate', authLimiter, (req, res) => {
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
  res.json({ tier: readTier(req), paidAIUnlocked: isPaidAIUnlocked(req) });
});

// ───── paid-AI master lock ─────
// Site/premium access alone NEVER authorizes an Anthropic request. A second,
// explicit unlock sets a separate HttpOnly cookie. /api/ai checks that cookie
// before it constructs or forwards any upstream request.
app.get('/api/ai-spend-lock', (req, res) => {
  res.json({ unlocked: isPaidAIUnlocked(req) });
});

app.post('/api/ai-spend-lock/unlock', authLimiter, (req, res) => {
  if (readTier(req) === 'none') {
    return res.status(401).json({ ok: false, unlocked: false, error: 'Site locked.' });
  }
  const password = String(req.body?.password || '');
  if (!safeEqual(password, expectedPaidAIUnlockPassword())) {
    return res.status(403).json({ ok: false, unlocked: false, error: 'Wrong paid-AI password.' });
  }
  res.cookie(AI_SPEND_COOKIE, aiSpendStampCT(), secureCookieOptions(req));
  res.json({ ok: true, unlocked: true });
});

app.post('/api/ai-spend-lock/lock', (req, res) => {
  res.clearCookie(AI_SPEND_COOKIE, { path: '/' });
  res.json({ ok: true, unlocked: false });
});

// ───── /api/logout ─────
app.post('/api/logout', (req, res) => {
  res.clearCookie('sf_site',    { path: '/' });
  res.clearCookie('sf_premium', { path: '/' });
  res.clearCookie(AI_SPEND_COOKIE, { path: '/' });
  res.json({ ok: true });
});

// ───── /api/ai ─────
// Proxy to Anthropic. Body should match Anthropic's /v1/messages shape:
//   { model, max_tokens, system, messages }
app.post('/api/ai', aiLimiter, async (req, res) => {
  const tier = readTier(req);
  if (tier === 'none') {
    return res.status(401).json({ error: 'Site locked. Enter the site password first.' });
  }
  // Master cost boundary. Nothing below this line — especially the upstream
  // fetch — is reachable unless the user explicitly unlocked paid AI.
  if (!isPaidAIUnlocked(req)) {
    return res.status(423).json({
      error: 'Paid AI is locked. Use the top-right PAID AI OFF button to unlock it.',
      code: 'AI_SPEND_LOCKED',
    });
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
wireSync(app);
wireBoardSettings(app);

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
await installAssetCache(app, __dirname);
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
    console.log(`paid-AI master lock:      ${AI_SPEND_PW_PREFIX ? 'configured' : 'NOT CONFIGURED'}`);
  });
})();
