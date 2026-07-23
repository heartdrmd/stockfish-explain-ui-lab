// src/server/auth.js — simple username/password auth.
//
// Design choices (deliberately small):
//   * Random opaque session tokens stored in Postgres, 30-day expiry
//   * bcryptjs password hashing (pure JS so no native build deps)
//   * Session cookie set HttpOnly + SameSite=Lax
//   * No email recovery, no OAuth — friend group only
//
// Endpoints wired into server.js:
//   POST /api/auth/signup  { username, password } → sets session
//   POST /api/auth/login   { username, password } → sets session
//   POST /api/auth/logout                          → clears session
//   GET  /api/auth/me                              → { user } or 401

import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { query, withTransaction } from './db.js';

const SESSION_COOKIE = 'sfe_sid';
const SESSION_TTL_DAYS = 30;
const SESSION_TTL_MS = SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;

function newToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function validateUsername(u) {
  if (typeof u !== 'string') return 'username must be a string';
  const s = u.trim();
  if (s.length < 2 || s.length > 32) return 'username must be 2–32 characters';
  if (!/^[a-zA-Z0-9_][a-zA-Z0-9_.-]*$/.test(s)) return 'username: letters / digits / _ . -';
  return null;
}
function validatePassword(p) {
  if (typeof p !== 'string') return 'password must be a string';
  if (p.length < 6 || p.length > 128) return 'password must be 6–128 characters';
  return null;
}

async function createSession(userId) {
  const token = newToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await query(
    'INSERT INTO sessions(token, user_id, expires_at) VALUES($1, $2, $3)',
    [token, userId, expiresAt],
  );
  return { token, expiresAt };
}

function setSessionCookie(res, token, expiresAt, req) {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: !!req.secure || req.get('x-forwarded-proto') === 'https',
    expires: expiresAt,
    path: '/',
  });
}

async function readSession(req) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) return null;
  const { rows } = await query(
    `SELECT s.user_id, u.username, s.expires_at
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token = $1 AND s.expires_at > NOW()`,
    [token],
  );
  if (!rows.length) return null;
  // Touch last_seen
  await query('UPDATE users SET last_seen_at = NOW() WHERE id = $1', [rows[0].user_id]);
  return { id: rows[0].user_id, username: rows[0].username };
}

export function requireAuth(req, res, next) {
  readSession(req).then(session => {
    if (!session) return res.status(401).json({ error: 'not authenticated' });
    req.user = session;
    next();
  }).catch(err => {
    console.error('[auth] session lookup failed', err);
    res.status(500).json({ error: 'session lookup failed' });
  });
}

// Guest-id validator: ~UUIDv4 shape but we also accept any 16-64 char
// token of [a-zA-Z0-9_-]. Keeps the server from trusting whatever the
// client posts (rate-limiting / abuse belongs in a separate layer).
//
// NOTE (audit S3): we deliberately read the guest id ONLY from the
// X-Guest-Id header, never from the query string. A query-param guest
// id leaks into server/proxy logs, browser history, and Referer headers
// — and since the id is the sole access token for a guest's data, that
// leak = full read/delete of their archive. The one flow that can't send
// a header (a browser download navigation) uses a signed short-lived
// export token instead (see mintGuestExportToken below).
const GUEST_ID_RE = /^[A-Za-z0-9_-]{16,64}$/;
function readGuestId(req) {
  const raw = req.get('X-Guest-Id') || '';
  return GUEST_ID_RE.test(raw) ? raw : null;
}

// ── Signed guest export token (audit S3) ──────────────────────────
// HMAC-signed, 2-minute-lived token that carries a guest id through a
// download URL without exposing the raw id. Secret from env; falls back
// to a per-boot random (a restart just invalidates outstanding tokens —
// negligible, they live 2 min).
const EXPORT_SECRET = process.env.EXPORT_TOKEN_SECRET ||
  crypto.randomBytes(32).toString('hex');
const EXPORT_TOKEN_TTL_MS = 2 * 60 * 1000;

export function mintGuestExportToken(guestId) {
  const payload = Buffer.from(JSON.stringify({ g: guestId, e: Date.now() + EXPORT_TOKEN_TTL_MS }))
    .toString('base64url');
  const sig = crypto.createHmac('sha256', EXPORT_SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifyGuestExportToken(token) {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expected = crypto.createHmac('sha256', EXPORT_SECRET).update(payload).digest('base64url');
  // Constant-time compare; guard against length-mismatch throw.
  const a = Buffer.from(sig), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const { g, e } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (typeof g !== 'string' || !GUEST_ID_RE.test(g)) return null;
    if (typeof e !== 'number' || Date.now() > e) return null;   // expired
    return g;
  } catch { return null; }
}

// Attach req.user (logged in) OR req.guest (guest token) and call next.
// Used by endpoints that work for both populations (game archive).
export function requireAuthOrGuest(req, res, next) {
  readSession(req).then(session => {
    if (session) {
      req.user = session;
      return next();
    }
    const gid = readGuestId(req);
    if (!gid) return res.status(401).json({ error: 'not authenticated and no guest id' });
    req.guest = { id: gid };
    next();
  }).catch(err => {
    console.error('[auth] session-or-guest lookup failed', err);
    res.status(500).json({ error: 'session lookup failed' });
  });
}

async function auditGuestClaim(txQuery, {
  userId,
  guestHash,
  tableName,
  removedCollisionKeys = [],
  claimedCount = 0,
}) {
  if (!removedCollisionKeys.length && !claimedCount) return;
  await txQuery(
    `INSERT INTO guest_claim_audit(
       user_id, guest_id_hash, table_name, removed_collision_keys, claimed_count
     ) VALUES($1, $2, $3, $4::jsonb, $5)`,
    [userId, guestHash, tableName, JSON.stringify(removedCollisionKeys), claimedCount],
  );
}

// Claim a guest's data for a freshly authenticated user (audit A6/F3).
// Every table is handled in its own client-bound transaction so one optional
// telemetry table cannot strand the user's games or library. For tables with
// owner-unique keys, the authenticated account's existing row wins: delete
// only the colliding guest copy, then reassign every remaining guest row.
// Repeating the claim is safe — a second run simply finds no guest rows.
//
// `transaction` and `logger` are injectable for regression tests; production
// callers use the real Postgres transaction helper and console.
export async function claimGuestData(
  userId,
  guestId,
  { transaction = withTransaction, logger = console } = {},
) {
  if (!userId || !guestId || !GUEST_ID_RE.test(guestId)) return [];
  const guestHash = crypto.createHash('sha256').update(guestId).digest('hex');

  const claims = [
    {
      tableName: 'games',
      run: async txQuery => {
        // client_game_id is the logical game identity. NULL ids are never a
        // collision and must all be preserved. Scope the winning copy to the
        // account being signed in — another user's row is irrelevant.
        const removed = await txQuery(
          `DELETE FROM games g
            WHERE g.guest_id = $2
              AND g.client_game_id IS NOT NULL
              AND EXISTS (
                SELECT 1 FROM games u
                 WHERE u.user_id = $1
                   AND u.client_game_id = g.client_game_id
              )
          RETURNING g.id, g.client_game_id`,
          [userId, guestId],
        );
        const claimed = await txQuery(
          `UPDATE games
              SET user_id = $1, guest_id = NULL
            WHERE guest_id = $2
          RETURNING id`,
          [userId, guestId],
        );
        const removedKeys = removed.rows.map(row => ({
          id: row.id,
          clientGameId: row.client_game_id,
        }));
        await auditGuestClaim(txQuery, {
          userId, guestHash, tableName: 'games', removedCollisionKeys: removedKeys,
          claimedCount: claimed.rowCount,
        });
        return { removed: removed.rowCount, claimed: claimed.rowCount };
      },
    },
    {
      tableName: 'favourites',
      run: async txQuery => {
        const removed = await txQuery(
          `DELETE FROM favourites f
            WHERE f.guest_id = $2
              AND EXISTS (
                SELECT 1 FROM favourites u
                 WHERE u.user_id = $1
                   AND u.opening_key = f.opening_key
              )
          RETURNING f.opening_key`,
          [userId, guestId],
        );
        const claimed = await txQuery(
          `UPDATE favourites
              SET user_id = $1, guest_id = NULL
            WHERE guest_id = $2
          RETURNING opening_key`,
          [userId, guestId],
        );
        await auditGuestClaim(txQuery, {
          userId, guestHash, tableName: 'favourites',
          removedCollisionKeys: removed.rows.map(row => row.opening_key),
          claimedCount: claimed.rowCount,
        });
        return { removed: removed.rowCount, claimed: claimed.rowCount };
      },
    },
    {
      tableName: 'custom_openings',
      run: async txQuery => {
        const removed = await txQuery(
          `DELETE FROM custom_openings c
            WHERE c.guest_id = $2
              AND EXISTS (
                SELECT 1 FROM custom_openings u
                 WHERE u.user_id = $1
                   AND u.group_name = c.group_name
                   AND u.opening_name = c.opening_name
              )
          RETURNING c.id, c.group_name, c.opening_name`,
          [userId, guestId],
        );
        const claimed = await txQuery(
          `UPDATE custom_openings
              SET user_id = $1, guest_id = NULL
            WHERE guest_id = $2
          RETURNING id`,
          [userId, guestId],
        );
        const removedKeys = removed.rows.map(row => ({
          id: row.id,
          group: row.group_name,
          name: row.opening_name,
        }));
        await auditGuestClaim(txQuery, {
          userId, guestHash, tableName: 'custom_openings', removedCollisionKeys: removedKeys,
          claimedCount: claimed.rowCount,
        });
        return { removed: removed.rowCount, claimed: claimed.rowCount };
      },
    },
    ...['engine_crashes', 'diagnostic_logs'].map(tableName => ({
      tableName,
      run: async txQuery => {
        const claimed = await txQuery(
          `UPDATE ${tableName}
              SET user_id = $1, guest_id = NULL
            WHERE guest_id = $2
          RETURNING id`,
          [userId, guestId],
        );
        await auditGuestClaim(txQuery, {
          userId, guestHash, tableName, claimedCount: claimed.rowCount,
        });
        return { removed: 0, claimed: claimed.rowCount };
      },
    })),
  ];

  const results = [];
  for (const claim of claims) {
    try {
      const result = await transaction(claim.run);
      results.push({ table: claim.tableName, ...result });
      if (result.removed || result.claimed) {
        logger.info?.('[auth] guest data claimed', {
          table: claim.tableName,
          removedCollisions: result.removed,
          claimed: result.claimed,
          guestHash: guestHash.slice(0, 12),
        });
      }
    } catch (err) {
      // Keep login available and continue to unrelated tables. The failed
      // table rolled back completely and can be retried on the next login.
      logger.warn?.(`[auth] claim ${claim.tableName} failed`, err.message);
      results.push({ table: claim.tableName, error: err.message });
    }
  }
  return results;
}

export function wireAuth(app) {
  // Brute-force / DoS limiter shared from server.js (audit S4). No-op
  // passthrough if it isn't wired (e.g. a test harness), so these routes
  // never depend on it existing.
  const authLimiter = app.locals?.limiters?.authLimiter || ((req, res, next) => next());

  app.post('/api/auth/signup', authLimiter, async (req, res) => {
    try {
      const username = (req.body?.username || '').trim();
      const password = req.body?.password || '';
      const uErr = validateUsername(username);
      if (uErr) return res.status(400).json({ error: uErr });
      const pErr = validatePassword(password);
      if (pErr) return res.status(400).json({ error: pErr });
      const existing = await query('SELECT id FROM users WHERE lower(username) = lower($1)', [username]);
      if (existing.rows.length) return res.status(409).json({ error: 'username taken' });
      const hash = await bcrypt.hash(password, 10);
      const { rows } = await query(
        'INSERT INTO users(username, pw_hash) VALUES($1, $2) RETURNING id, username',
        [username, hash],
      );
      const { token, expiresAt } = await createSession(rows[0].id);
      setSessionCookie(res, token, expiresAt, req);
      // A6: claim any guest data this browser accumulated before signup.
      await claimGuestData(rows[0].id, readGuestId(req));
      res.json({ user: { id: rows[0].id, username: rows[0].username } });
    } catch (err) {
      console.error('[auth] signup failed', err);
      res.status(500).json({ error: 'signup failed' });
    }
  });

  app.post('/api/auth/login', authLimiter, async (req, res) => {
    try {
      const username = (req.body?.username || '').trim();
      const password = req.body?.password || '';
      if (!username || !password) return res.status(400).json({ error: 'username + password required' });
      const { rows } = await query(
        'SELECT id, username, pw_hash FROM users WHERE lower(username) = lower($1)',
        [username],
      );
      if (!rows.length) return res.status(401).json({ error: 'invalid username or password' });
      const ok = await bcrypt.compare(password, rows[0].pw_hash);
      if (!ok) return res.status(401).json({ error: 'invalid username or password' });
      const { token, expiresAt } = await createSession(rows[0].id);
      setSessionCookie(res, token, expiresAt, req);
      // A6: claim any guest data this browser accumulated before login.
      await claimGuestData(rows[0].id, readGuestId(req));
      res.json({ user: { id: rows[0].id, username: rows[0].username } });
    } catch (err) {
      console.error('[auth] login failed', err);
      res.status(500).json({ error: 'login failed' });
    }
  });

  app.post('/api/auth/logout', async (req, res) => {
    try {
      const token = req.cookies?.[SESSION_COOKIE];
      if (token) await query('DELETE FROM sessions WHERE token = $1', [token]);
      // CRITICAL: clearCookie's options must MATCH the options the
      // cookie was originally set with (see setSessionCookie above).
      // Modern Chrome 80+ requires matching SameSite for the
      // deletion Set-Cookie to actually take effect — without this,
      // the browser ignores the clear, the cookie persists, and the
      // user reports "logout button doesn't actually log out."
      // Symptom seen in prod: sessions table accumulating rows per
      // login because the prior session's cookie was never cleared
      // server-side, even though the row was deleted from the DB.
      res.clearCookie(SESSION_COOKIE, {
        httpOnly: true,
        sameSite: 'lax',
        secure:   !!req.secure || req.get('x-forwarded-proto') === 'https',
        path: '/',
      });
      res.json({ ok: true });
    } catch (err) {
      console.error('[auth] logout failed', err);
      res.status(500).json({ error: 'logout failed' });
    }
  });

  app.get('/api/auth/me', async (req, res) => {
    const session = await readSession(req).catch(() => null);
    if (!session) return res.status(401).json({ error: 'not authenticated' });
    res.json({ user: session });
  });
}
