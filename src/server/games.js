// src/server/games.js — game archive + mistakes endpoints.
//
// Accepts either authenticated users (session cookie) or anonymous
// guests (X-Guest-Id header). Each game row is owned by EXACTLY ONE
// of user_id or guest_id (DB-enforced via CHECK constraint). This
// lets a guest use the cloud archive immediately — no signup friction
// — while still scoping every query to the caller.
//
// Wired as a group in server.js: wireGames(app).

import { query } from './db.js';
import { requireAuthOrGuest, mintGuestExportToken, verifyGuestExportToken } from './auth.js';

// Allowed sort keys → SQL ORDER BY expressions. Whitelisted so no
// arbitrary strings from query params ever reach Postgres.
const SORT_MAP = {
  newest:          'played_at DESC',
  oldest:          'played_at ASC',
  most_mistakes:   '(mistakes_count + blunders_count) DESC, played_at DESC',
  fewest_mistakes: '(mistakes_count + blunders_count) ASC, played_at DESC',
  most_moves:      'jsonb_array_length(COALESCE(plies, \'[]\'::jsonb)) DESC, played_at DESC',
};

// Returns { ownerCol, ownerVal } — which column/value identifies this
// caller on the games table. Exactly one of user_id / guest_id.
function ownerOf(req) {
  if (req.user)  return { ownerCol: 'user_id',  ownerVal: req.user.id };
  if (req.guest) return { ownerCol: 'guest_id', ownerVal: req.guest.id };
  // requireAuthOrGuest guarantees one of the two — but belt & braces.
  throw new Error('ownerOf called without auth or guest');
}

function buildFilters(req) {
  const { ownerCol, ownerVal } = ownerOf(req);
  const params = [ownerVal];
  const where  = [`${ownerCol} = $1`];
  const q = req.query || {};
  if (q.from)   { params.push(q.from);   where.push(`played_at >= $${params.length}`); }
  if (q.to)     { params.push(q.to);     where.push(`played_at <  $${params.length}`); }
  if (q.result && ['1-0','0-1','1/2-1/2'].includes(q.result)) {
    params.push(q.result); where.push(`result = $${params.length}`);
  }
  if (q.color && ['white','black'].includes(q.color)) {
    params.push(q.color); where.push(`user_color = $${params.length}`);
  }
  if (q.mode && ['practice','analysis'].includes(q.mode)) {
    params.push(q.mode); where.push(`mode = $${params.length}`);
  }
  if (q.opening) {
    params.push(`%${q.opening.trim()}%`);
    where.push(`(opening_name ILIKE $${params.length} OR opening_eco ILIKE $${params.length})`);
  }
  if (q.cleanliness === 'clean')    where.push(`(mistakes_count + blunders_count) = 0`);
  if (q.cleanliness === 'mistakes') where.push(`mistakes_count > 0`);
  if (q.cleanliness === 'blunders') where.push(`blunders_count > 0`);
  return { params, where };
}

export function sanitizePracticeHints(value) {
  if (value == null) return [];
  if (!Array.isArray(value)) throw new Error('hints must be an array');
  if (value.length > 100) throw new Error('too many hints');
  const clean = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue;
    const fen = typeof raw.fen === 'string' ? raw.fen.slice(0, 200) : '';
    const ply = Number.isFinite(+raw.ply) ? Math.max(0, Math.min(1000, Math.trunc(+raw.ply))) : null;
    if (!fen || ply == null) continue;
    const lines = (Array.isArray(raw.lines) ? raw.lines : []).slice(0, 3).map((line, index) => ({
      rank: Math.max(1, Math.min(3, Math.trunc(+line?.rank || index + 1))),
      uci: typeof line?.uci === 'string' && /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(line.uci)
        ? line.uci : null,
      san: typeof line?.san === 'string' ? line.san.slice(0, 32) : null,
      pvSan: typeof line?.pvSan === 'string' ? line.pvSan.slice(0, 500) : '',
      cpWhite: line?.cpWhite != null && Number.isFinite(+line.cpWhite)
        ? Math.max(-1_000_000, Math.min(1_000_000, +line.cpWhite)) : null,
      mateWhite: line?.mateWhite != null && Number.isFinite(+line.mateWhite)
        ? Math.max(-1000, Math.min(1000, +line.mateWhite)) : null,
      evalText: typeof line?.evalText === 'string' ? line.evalText.slice(0, 24) : '—',
    }));
    clean.push({
      version: 1,
      ply,
      fen,
      side: raw.side === 'black' ? 'black' : 'white',
      thinkMs: Number.isFinite(+raw.thinkMs)
        ? Math.max(500, Math.min(300_000, Math.trunc(+raw.thinkMs))) : 3000,
      engineFlavor: typeof raw.engineFlavor === 'string' ? raw.engineFlavor.slice(0, 80) : null,
      analyzedAt: typeof raw.analyzedAt === 'string' ? raw.analyzedAt.slice(0, 40) : null,
      lines,
    });
  }
  if (JSON.stringify(clean).length > 100_000) throw new Error('hints too large');
  return clean;
}

export function wireGames(app) {
  // Write limiter shared from server.js (audit S4). No-op if unwired.
  const writeLimiter = app.locals?.limiters?.writeLimiter || ((req, res, next) => next());

  // POST /api/games
  // Body: { pgn, result, opening_name, opening_eco, white_name, black_name,
  //         user_color, mode, plies, hints, mistakes_count, blunders_count }
  // Response: { id, played_at }
  app.post('/api/games', writeLimiter, requireAuthOrGuest, async (req, res) => {
    try {
      const b = req.body || {};
      if (!b.pgn || typeof b.pgn !== 'string') {
        return res.status(400).json({ error: 'pgn required' });
      }
      // Sanity cap: ~100 KB per game — eval-per-ply JSON is the bulky
      // part; even a 100-move game with full plies stays under 30 KB.
      if (b.pgn.length > 100_000) return res.status(413).json({ error: 'pgn too large' });
      const clientGameId = typeof b.client_game_id === 'string' &&
        /^[A-Za-z0-9_-]{8,128}$/.test(b.client_game_id)
        ? b.client_game_id : null;
      let hints;
      try { hints = sanitizePracticeHints(b.hints); }
      catch (err) { return res.status(400).json({ error: err.message }); }

      const userId  = req.user  ? req.user.id  : null;
      const guestId = req.guest ? req.guest.id : null;

      const { rows } = await query(`
        INSERT INTO games(
          user_id, guest_id, pgn, result, opening_name, opening_eco,
          white_name, black_name, user_color, mode, plies, hints,
          mistakes_count, blunders_count, client_game_id
        ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
        ON CONFLICT DO NOTHING
        RETURNING id, played_at
      `, [
        userId,
        guestId,
        b.pgn,
        b.result || null,
        b.opening_name || null,
        b.opening_eco || null,
        b.white_name || null,
        b.black_name || null,
        b.user_color || null,
        b.mode || null,
        b.plies ? JSON.stringify(b.plies) : null,
        JSON.stringify(hints),
        Number.isFinite(+b.mistakes_count) ? +b.mistakes_count : 0,
        Number.isFinite(+b.blunders_count) ? +b.blunders_count : 0,
        clientGameId,
      ]);
      if (rows.length) {
        return res.json({ id: rows[0].id, played_at: rows[0].played_at, created: true });
      }
      // A duplicate client_game_id means another tab already won the
      // race. Return that owned row as a successful idempotent save.
      if (clientGameId) {
        const { ownerCol, ownerVal } = ownerOf(req);
        const existing = await query(
          `SELECT id, played_at FROM games
            WHERE ${ownerCol} = $1 AND client_game_id = $2`,
          [ownerVal, clientGameId],
        );
        if (existing.rows.length) {
          return res.json({ id: existing.rows[0].id, played_at: existing.rows[0].played_at, created: false });
        }
      }
      throw new Error('insert conflict without owned client id');
    } catch (err) {
      console.error('[games] insert failed', err);
      res.status(500).json({ error: 'insert failed' });
    }
  });

  // PATCH /api/games/:id/plies — persist a completed local reanalysis so
  // another device can open Learn immediately without sweeping the game
  // again. Ownership is checked exactly like get/delete.
  app.patch('/api/games/:id/plies', writeLimiter, requireAuthOrGuest, async (req, res) => {
    try {
      const id = +req.params.id;
      if (!Number.isFinite(id)) return res.status(400).json({ error: 'bad id' });
      const b = req.body || {};
      if (!Array.isArray(b.plies)) return res.status(400).json({ error: 'plies array required' });
      if (b.plies.length > 1000) return res.status(413).json({ error: 'too many plies' });
      const encoded = JSON.stringify(b.plies);
      if (encoded.length > 200_000) return res.status(413).json({ error: 'plies too large' });
      const { ownerCol, ownerVal } = ownerOf(req);
      const result = await query(
        `UPDATE games
            SET plies = $1::jsonb,
                mistakes_count = $2,
                blunders_count = $3
          WHERE id = $4 AND ${ownerCol} = $5`,
        [
          encoded,
          Number.isFinite(+b.mistakes_count) ? Math.max(0, +b.mistakes_count) : 0,
          Number.isFinite(+b.blunders_count) ? Math.max(0, +b.blunders_count) : 0,
          id,
          ownerVal,
        ],
      );
      if (!result.rowCount) return res.status(404).json({ error: 'not found' });
      res.json({ updated: true, id });
    } catch (err) {
      console.error('[games] update plies failed', err);
      res.status(500).json({ error: 'update failed' });
    }
  });

  // GET /api/games  — list caller's games (user OR guest scope).
  // Query params:
  //   from=YYYY-MM-DD (inclusive)  to=YYYY-MM-DD (exclusive)
  //   result=1-0|0-1|1/2-1/2
  //   color=white|black
  //   mode=practice|analysis
  //   opening=<text>           (ILIKE match on opening_name + eco)
  //   cleanliness=clean|mistakes|blunders
  //   sort=newest|oldest|most_mistakes|fewest_mistakes|most_moves
  //   limit (default 100, max 500)  offset (default 0)
  app.get('/api/games', requireAuthOrGuest, async (req, res) => {
    try {
      const limit  = Math.min(500, Math.max(1, +req.query.limit  || 100));
      const offset = Math.max(0, +req.query.offset || 0);
      const { params, where } = buildFilters(req);
      const orderBy = SORT_MAP[req.query.sort] || SORT_MAP.newest;
      params.push(limit); params.push(offset);
      const { rows } = await query(`
        SELECT id, result, opening_name, opening_eco, white_name, black_name,
               user_color, mode, mistakes_count, blunders_count, played_at,
               jsonb_array_length(COALESCE(plies, '[]'::jsonb)) AS ply_count,
               jsonb_array_length(COALESCE(hints, '[]'::jsonb)) AS hint_count
          FROM games
         WHERE ${where.join(' AND ')}
         ORDER BY ${orderBy}
         LIMIT $${params.length - 1} OFFSET $${params.length}
      `, params);
      // Total count so the client can show "showing 100 of 347".
      const total = await query(`SELECT COUNT(*)::int AS c FROM games WHERE ${where.join(' AND ')}`, params.slice(0, -2));
      res.json({ games: rows, total: total.rows[0].c, limit, offset });
    } catch (err) {
      console.error('[games] list failed', err);
      res.status(500).json({ error: 'list failed' });
    }
  });

  // GET /api/games/stats  — aggregate counts honouring the same filters
  // as /api/games. Powers the My Games header strip.
  app.get('/api/games/stats', requireAuthOrGuest, async (req, res) => {
    try {
      const { params, where } = buildFilters(req);
      const { rows } = await query(`
        SELECT
          COUNT(*)::int                                                   AS total,
          COUNT(*) FILTER (WHERE result = '1-0')::int                      AS white_wins,
          COUNT(*) FILTER (WHERE result = '0-1')::int                      AS black_wins,
          COUNT(*) FILTER (WHERE result = '1/2-1/2')::int                  AS draws,
          COUNT(*) FILTER (WHERE (
            (user_color = 'white' AND result = '1-0') OR
            (user_color = 'black' AND result = '0-1')
          ))::int                                                          AS user_wins,
          COUNT(*) FILTER (WHERE (
            (user_color = 'white' AND result = '0-1') OR
            (user_color = 'black' AND result = '1-0')
          ))::int                                                          AS user_losses,
          COUNT(*) FILTER (WHERE result = '1/2-1/2')::int                  AS user_draws,
          COALESCE(AVG(mistakes_count), 0)::float                          AS avg_mistakes,
          COALESCE(AVG(blunders_count), 0)::float                          AS avg_blunders,
          COALESCE(SUM(mistakes_count), 0)::int                            AS total_mistakes,
          COALESCE(SUM(blunders_count), 0)::int                            AS total_blunders
          FROM games WHERE ${where.join(' AND ')}
      `, params);
      res.json(rows[0] || {});
    } catch (err) {
      console.error('[games] stats failed', err);
      res.status(500).json({ error: 'stats failed' });
    }
  });

  // GET /api/games/:id — fetch full PGN + plies for replay.
  app.get('/api/games/:id', requireAuthOrGuest, async (req, res) => {
    try {
      const id = +req.params.id;
      if (!Number.isFinite(id)) return res.status(400).json({ error: 'bad id' });
      const { ownerCol, ownerVal } = ownerOf(req);
      const { rows } = await query(
        `SELECT * FROM games WHERE id = $1 AND ${ownerCol} = $2`,
        [id, ownerVal],
      );
      if (!rows.length) return res.status(404).json({ error: 'not found' });
      res.json({ game: rows[0] });
    } catch (err) {
      console.error('[games] get failed', err);
      res.status(500).json({ error: 'get failed' });
    }
  });

  // DELETE /api/games/:id — "don't save this game" or user purge.
  app.delete('/api/games/:id', writeLimiter, requireAuthOrGuest, async (req, res) => {
    try {
      const id = +req.params.id;
      if (!Number.isFinite(id)) return res.status(400).json({ error: 'bad id' });
      const { ownerCol, ownerVal } = ownerOf(req);
      const result = await query(
        `DELETE FROM games WHERE id = $1 AND ${ownerCol} = $2`,
        [id, ownerVal],
      );
      res.json({ deleted: result.rowCount });
    } catch (err) {
      console.error('[games] delete failed', err);
      res.status(500).json({ error: 'delete failed' });
    }
  });

  // GET /api/games/export-token — mint a short-lived signed token so a
  // guest can download via a browser navigation without putting the raw
  // guest id in the URL (audit S3). Logged-in users get token:null and
  // rely on their session cookie riding along on the download.
  app.get('/api/games/export-token', requireAuthOrGuest, (req, res) => {
    if (req.user) return res.json({ token: null });        // cookie suffices
    return res.json({ token: mintGuestExportToken(req.guest.id) });
  });

  // GET /api/games/export.pgn  — download games as a single PGN file.
  // Honours the full filter set (same as /api/games).
  //
  // Auth (audit S3): session cookie for users; a signed ?token= for
  // guests (NOT a raw guest id in the URL). We resolve the owner here
  // instead of via requireAuthOrGuest so the token path is accepted.
  app.get('/api/games/export.pgn', async (req, res) => {
    // Resolve owner: prefer the session (requireAuthOrGuest-style), then
    // a valid export token. We inline a tiny resolver because the query
    // string can no longer carry a guest id.
    try {
      const tokenGid = verifyGuestExportToken(req.query.token);
      if (tokenGid) {
        req.guest = { id: tokenGid };
      } else {
        // Fall through to session-cookie auth for logged-in users.
        return requireAuthOrGuest(req, res, () => doExport(req, res));
      }
    } catch (err) {
      console.error('[games] export auth failed', err);
      return res.status(500).json({ error: 'export failed' });
    }
    return doExport(req, res);
  });

  async function doExport(req, res) {
    try {
      const { params, where } = buildFilters(req);
      const { rows } = await query(
        `SELECT pgn, played_at FROM games
          WHERE ${where.join(' AND ')}
          ORDER BY played_at ASC`,
        params,
      );
      const filename = 'stockfish-explain-games' +
        (req.query.from ? `-${req.query.from}` : '') +
        (req.query.to   ? `-to-${req.query.to}` : '') +
        '.pgn';
      res.setHeader('Content-Type', 'application/x-chess-pgn');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      // Each game separated by a blank line — canonical PGN multi-game
      // format readable by ChessBase, lichess, chess.com, etc.
      const body = rows.map(r => r.pgn.trim()).join('\n\n') + '\n';
      res.send(body);
    } catch (err) {
      console.error('[games] export failed', err);
      res.status(500).json({ error: 'export failed' });
    }
  }
}
