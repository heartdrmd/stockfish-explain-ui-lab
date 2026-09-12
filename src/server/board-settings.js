// One revisioned document per authenticated account. Explicit view operations
// merge on retry without replacing another device's saved-view list.
import { query, withTransaction } from './db.js';
import { requireAuth } from './auth.js';
import { validateView, savedViewId } from './generated/board-view.mjs';

export function cleanBoardChanges(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid board settings.');
  const changes = {};
  if ('latest' in raw) changes.latest = validateView(raw.latest);
  if ('save' in raw) {
    changes.save = validateView(raw.save);
    savedViewId(changes.save.id);
  }
  if ('remove' in raw) changes.remove = savedViewId(raw.remove);
  if (!Object.keys(changes).length || JSON.stringify(changes).length > 60000)
    throw new Error('Board settings are empty or too large.');
  return changes;
}

export function applyBoardChanges(current, changes) {
  const next = { latest: current.latest || null, views: [...(current.views || [])], deleted: [...(current.deleted || [])] };
  if (changes.latest) next.latest = changes.latest;
  if (changes.save && !next.deleted.includes(changes.save.id) && !next.views.some(view => view.id === changes.save.id)) {
    if (next.views.length >= 100) throw new Error('You have 100 saved views. Delete one before saving another.');
    next.views.unshift(changes.save);
  }
  if (changes.remove) {
    next.views = next.views.filter(view => view.id !== changes.remove);
    if (!next.deleted.includes(changes.remove)) next.deleted.push(changes.remove);
  }
  return next;
}

export function wireBoardSettings(app, { dbQuery = query, transaction = withTransaction, auth = requireAuth } = {}) {
  const limiter = app.locals?.limiters?.writeLimiter || ((req, res, next) => next());
  function account(req, res, next) {
    res.set('Cache-Control', 'no-store');
    // Bind delayed requests to the account that queued them; cookie changes
    // between tabs must not upload old settings into the newly signed-in user.
    if (req.get('X-Board-User') !== String(req.user.id))
      return res.status(409).json({ error: 'Account changed. Sign in again.', accountChanged: true });
    if (req.method !== 'GET' && req.get('origin')) {
      let origin;
      try { origin = new URL(req.get('origin')).host; } catch {}
      if (origin !== req.get('host')) return res.status(403).json({ error: 'Invalid origin.' });
    }
    next();
  }
  app.get('/api/board-settings', auth, account, async (req, res) => {
    try {
      const { rows } = await dbQuery('SELECT document, revision FROM user_board_settings WHERE user_id = $1', [req.user.id]);
      res.json(rows[0] || { document: { latest: null, views: [] }, revision: 0 });
    } catch (err) {
      console.error('[board-settings] read failed', err.message);
      res.status(503).json({ error: 'Account board settings are temporarily unavailable.' });
    }
  });
  app.patch('/api/board-settings', limiter, auth, account, async (req, res) => {
    let changes;
    try {
      changes = cleanBoardChanges(req.body?.changes);
      if (!Number.isSafeInteger(req.body?.revision) || req.body.revision < 0) throw new Error('Invalid revision.');
    } catch (err) { return res.status(400).json({ error: err.message }); }
    try {
      const result = await transaction(async q => {
        await q(`INSERT INTO user_board_settings(user_id) VALUES($1) ON CONFLICT DO NOTHING`, [req.user.id]);
        const { rows: [current] } = await q('SELECT document, revision FROM user_board_settings WHERE user_id = $1 FOR UPDATE', [req.user.id]);
        if (current.revision !== req.body.revision) return { conflict: true, ...current };
        const document = applyBoardChanges(current.document, changes);
        const { rows: [saved] } = await q(`UPDATE user_board_settings SET document=$2::jsonb, revision=revision+1, updated_at=NOW() WHERE user_id=$1 RETURNING document, revision`, [req.user.id, JSON.stringify(document)]);
        return saved;
      });
      res.status(result.conflict ? 409 : 200).json(result);
    } catch (err) {
      console.error('[board-settings] save failed', err.message);
      res.status(503).json({ error: 'Could not sync board settings. Your browser copy is kept.' });
    }
  });
}
