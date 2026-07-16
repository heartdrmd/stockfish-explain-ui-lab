// Cross-device synchronization for portable UI preferences and local SRS.
// Hardware sizing, drafts, guest/security tokens, and secrets are
// deliberately excluded.

import { query } from './db.js';
import { requireAuth } from './auth.js';

const PORTABLE_PREF_KEYS = new Set([
  'stockfish-explain.arrow-mode',
  'stockfish-explain.analysis-lines',
  'stockfish-explain.clock-style',
  'stockfish-explain.panel-hidden',
  'stockfish-explain.panels-hidden-toggle',
  'stockfish-explain.practice-queue-set',
  'stockfish-explain.practice-last-settings',
  'stockfish-explain.live-graph-visible',
  'stockfish-explain.coach-on',
  'stockfish-explain.variation-settings',
  'stockfish-explain.learn-settings',
  'stockfish-explain.anthropic-model',
]);

export function cleanPreferences(input) {
  const out = {};
  if (!input || typeof input !== 'object' || Array.isArray(input)) return out;
  for (const [key, value] of Object.entries(input)) {
    if (!PORTABLE_PREF_KEYS.has(key)) continue;
    if (value !== null && typeof value !== 'string') continue;
    if (value != null && value.length > 20_000) continue;
    out[key] = value;
  }
  return out;
}

export function cleanCard(card) {
  if (!card || typeof card !== 'object' || Array.isArray(card)) return null;
  const key = typeof card.key === 'string' ? card.key : '';
  if (!key || key.length > 500) return null;
  const numeric = ['ease', 'intervalDays', 'reps', 'dueAt', 'lastReviewedAt', 'updatedAt'];
  for (const field of numeric) {
    if (card[field] != null && !Number.isFinite(+card[field])) return null;
  }
  const encoded = JSON.stringify(card);
  if (encoded.length > 30_000) return null;
  return { ...card, key, updatedAt: Number(card.updatedAt || card.lastReviewedAt || Date.now()) };
}

export function wireSync(app) {
  const writeLimiter = app.locals?.limiters?.writeLimiter || ((req, res, next) => next());

  app.get('/api/preferences', requireAuth, async (req, res) => {
    try {
      const { rows } = await query(
        'SELECT prefs_json, field_updated_at, updated_at FROM user_prefs WHERE user_id = $1',
        [req.user.id],
      );
      const row = rows[0] || {};
      res.json({ preferences: cleanPreferences(row.prefs_json || {}), field_updated_at: row.field_updated_at || {} });
    } catch (err) {
      console.error('[sync] preferences get failed', err);
      res.status(500).json({ error: 'preferences get failed' });
    }
  });

  app.patch('/api/preferences', writeLimiter, requireAuth, async (req, res) => {
    try {
      const prefs = cleanPreferences(req.body?.preferences);
      if (!Object.keys(prefs).length) return res.json({ updated: 0 });
      const stamps = Object.fromEntries(Object.keys(prefs).map(key => [key, Date.now()]));
      await query(
        `INSERT INTO user_prefs(user_id, prefs_json, field_updated_at, updated_at)
         VALUES($1, $2::jsonb, $3::jsonb, NOW())
         ON CONFLICT(user_id) DO UPDATE SET
           prefs_json = user_prefs.prefs_json || EXCLUDED.prefs_json,
           field_updated_at = user_prefs.field_updated_at || EXCLUDED.field_updated_at,
           updated_at = NOW()`,
        [req.user.id, JSON.stringify(prefs), JSON.stringify(stamps)],
      );
      res.json({ updated: Object.keys(prefs).length });
    } catch (err) {
      console.error('[sync] preferences patch failed', err);
      res.status(500).json({ error: 'preferences update failed' });
    }
  });

  app.get('/api/srs', requireAuth, async (req, res) => {
    try {
      const { rows } = await query(
        'SELECT card_json FROM srs_cards_v2 WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 1000',
        [req.user.id],
      );
      res.json({ cards: rows.map(row => row.card_json) });
    } catch (err) {
      console.error('[sync] srs get failed', err);
      res.status(500).json({ error: 'srs get failed' });
    }
  });

  app.put('/api/srs', writeLimiter, requireAuth, async (req, res) => {
    try {
      const input = Array.isArray(req.body?.cards) ? req.body.cards : [];
      if (input.length > 1000) return res.status(413).json({ error: 'too many cards' });
      const cards = input.map(cleanCard).filter(Boolean);
      if (JSON.stringify(cards).length > 750_000) return res.status(413).json({ error: 'cards too large' });
      let updated = 0;
      for (const card of cards) {
        const when = new Date(card.updatedAt);
        if (!Number.isFinite(when.getTime())) continue;
        const result = await query(
          `INSERT INTO srs_cards_v2(user_id, card_key, card_json, updated_at)
           VALUES($1, $2, $3::jsonb, $4)
           ON CONFLICT(user_id, card_key) DO UPDATE SET
             card_json = EXCLUDED.card_json,
             updated_at = EXCLUDED.updated_at
           WHERE srs_cards_v2.updated_at <= EXCLUDED.updated_at`,
          [req.user.id, card.key, JSON.stringify(card), when],
        );
        updated += result.rowCount || 0;
      }
      res.json({ updated });
    } catch (err) {
      console.error('[sync] srs put failed', err);
      res.status(500).json({ error: 'srs update failed' });
    }
  });

  app.delete('/api/srs', writeLimiter, requireAuth, async (req, res) => {
    try {
      const result = await query('DELETE FROM srs_cards_v2 WHERE user_id = $1', [req.user.id]);
      res.json({ deleted: result.rowCount || 0 });
    } catch (err) {
      console.error('[sync] srs clear failed', err);
      res.status(500).json({ error: 'srs clear failed' });
    }
  });
}
