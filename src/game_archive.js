// game_archive.js — persistent storage for completed games.
//
// Archives every finished game (practice or analysis review) with
// per-move engine data so downstream features (eval timeline, pawn-
// structure strip, mistake bank, spaced repetition) all read from the
// same source.
//
// Shape of an archived game:
//   {
//     id:        number (Date.now milliseconds)
//     clientGameId: stable browser-generated id used for idempotent sync
//     date:      "YYYY-MM-DD"
//     result:    "1-0" | "0-1" | "1/2-1/2" | "*"
//     ending:    string (human readable — "You resigned", "Checkmate", etc.)
//     mode:      "practice" | "analysis"
//     userColor: "white" | "black" | null   (null for analysis review)
//     opponent:  string (e.g., "Stockfish (skill 12)")
//     opening:   { name, eco } | null       (from openings_book detector)
//     startingFen: string
//     pgn:       string (full PGN with tags)
//     plies: [
//       {
//         ply:     number (1-based)
//         san:     string
//         fen:     string (position AFTER this move)
//         cpWhite: number | null   (centipawn eval in WHITE POV; null if unknown)
//         mate:    number | null   (plies-to-mate if positive = White wins)
//         depth:   number | null
//       }, ...
//     ]
//   }
//
// Storage uses localStorage. A 5MB browser quota holds ~200-300 games
// at ~400 bytes/ply × 40 plies. When near the cap we drop the oldest.
// Individual games larger than ~50KB are trimmed to fit.
//
// Mistake bank derivation is computed on-the-fly from archived games
// — we scan plies[] for eval-swings that exceed the classification
// thresholds and project them as virtual mistake entries.

import { moverWinDrop, classifySeverity } from './evals.js';

const GAMES_KEY   = 'stockfish-explain.archive.games';
const MAX_GAMES   = 300;
const MAX_BYTES   = 4_500_000;  // leave headroom under the 5 MB browser quota

// Classify an eval swing (in centipawns, from side-to-move's POV
// BEFORE the move). Positive "drop" = the side that moved got worse.
// Thresholds follow the Lichess/Chess.com convention (rough).
export const THRESHOLDS = {
  blunder:    200,    // ?? — catastrophic
  mistake:    100,    // ?  — serious
  inaccuracy:  50,    // ?! — meaningful
};

/**
 * Classify an eval swing. `cpBefore` and `cpAfter` are both in the
 * POV of the side that *just moved* (so a drop from +80 to -100 means
 * they threw away ~180 cp).
 * @returns {null | 'blunder' | 'mistake' | 'inaccuracy'}
 */
export function classifySwing(cpBefore, cpAfter) {
  if (cpBefore == null || cpAfter == null) return null;
  const drop = cpBefore - cpAfter;
  if (drop >= THRESHOLDS.blunder)    return 'blunder';
  if (drop >= THRESHOLDS.mistake)    return 'mistake';
  if (drop >= THRESHOLDS.inaccuracy) return 'inaccuracy';
  return null;
}

export function loadGames() {
  try {
    const raw = localStorage.getItem(GAMES_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

export function saveGames(arr) {
  try {
    localStorage.setItem(GAMES_KEY, JSON.stringify(arr));
    return true;
  } catch (err) {
    console.warn('[archive] save failed (quota?):', err.message);
    return false;
  }
}

/**
 * Archive a finished game. Trims to the most recent MAX_GAMES before
 * writing, and if the serialised payload is over MAX_BYTES, drops the
 * oldest games until it fits.
 */
export function archiveGame(game) {
  if (!game || !game.plies || !game.plies.length) return false;
  const all = loadGames();
  all.push({ ...game, id: game.id || Date.now() });
  // Keep newest MAX_GAMES
  all.sort((a, b) => b.id - a.id);
  let trimmed = all.slice(0, MAX_GAMES);
  // Byte-size trim: drop oldest until under cap
  while (trimmed.length > 1) {
    const size = JSON.stringify(trimmed).length;
    if (size < MAX_BYTES) break;
    trimmed.pop();
  }
  return saveGames(trimmed);
}

export function deleteGame(id) {
  const all = loadGames().filter(g => g.id !== id);
  return saveGames(all);
}

export function getGame(id) {
  return loadGames().find(g => g.id === id) || null;
}

export function updateGamePlies(id, plies) {
  const all = loadGames();
  const game = all.find(g => g.id === id);
  if (!game || !Array.isArray(plies)) return false;
  game.plies = plies;
  return saveGames(all);
}

/**
 * Derive the mistake bank from all archived games. A "mistake entry" is
 * produced for each ply whose eval-swing (from side-to-move's POV)
 * crosses one of the THRESHOLDS above.
 *
 * Returns array of {
 *   gameId, ply, san, fenBefore, fenAfter, cpBefore, cpAfter,
 *   swing, severity, userColor, date, opening, result
 * } sorted by severity then recency.
 */
export function deriveMistakes() {
  const mistakes = [];
  for (const g of loadGames()) {
    const plies = g.plies || [];
    for (let i = 0; i < plies.length; i++) {
      const p = plies[i];
      const prev = i === 0 ? null : plies[i - 1];
      const fenBefore = prev ? prev.fen : g.startingFen;
      const stmBefore = (fenBefore.split(' ')[1] || 'w') === 'w' ? 1 : -1;
      // Shared win-chance classifier (audit A5): the Mistake Bank now
      // uses the SAME sigmoid + thresholds as the accuracy pills / My
      // Games (was raw-cp 200/100/50, which disagreed with everything
      // and ignored mate entirely — so a blunder INTO a forced mate
      // never entered the bank). moverWinDrop reads the fen to attribute
      // the move and handles mate correctly.
      const before = prev
        ? { cpWhite: prev.cpWhite, mate: prev.mate, fen: fenBefore }
        : { cpWhite: 20, mate: null, fen: fenBefore };
      const after  = { cpWhite: p.cpWhite, mate: p.mate, fen: p.fen };
      const drop = moverWinDrop(before, after);
      const severity = classifySeverity(drop);
      if (!severity) continue;
      // Keep cp fields for display/back-compat (mover POV).
      const cpBefore = (before.cpWhite != null) ? stmBefore * before.cpWhite : null;
      const cpAfter  = (p.cpWhite != null) ? stmBefore * p.cpWhite : null;
      mistakes.push({
        gameId: g.id,
        ply: p.ply,
        san: p.san,
        fenBefore,
        fenAfter: p.fen,
        cpBefore,
        cpAfter,
        winDrop: drop,
        swing: (cpBefore ?? 0) - (cpAfter ?? 0),
        severity,
        userColor: g.userColor,
        byUser: g.userColor ? (stmBefore === 1 ? 'white' : 'black') === g.userColor : null,
        date: g.date,
        opening: g.opening,
        result: g.result,
      });
    }
  }
  // Sort: blunders first, then mistakes, then inaccuracies; within
  // severity, newest first.
  const rank = { blunder: 3, mistake: 2, inaccuracy: 1 };
  mistakes.sort((a, b) => (rank[b.severity] - rank[a.severity]) || (b.gameId - a.gameId));
  return mistakes;
}

export function archiveStats() {
  const games = loadGames();
  const byResult = { '1-0': 0, '0-1': 0, '1/2-1/2': 0, '*': 0 };
  let practiceCount = 0, analysisCount = 0;
  for (const g of games) {
    byResult[g.result] = (byResult[g.result] || 0) + 1;
    if (g.mode === 'practice') practiceCount++; else analysisCount++;
  }
  return {
    total: games.length,
    byResult,
    practiceCount,
    analysisCount,
    oldest: games.length ? games[games.length - 1].date : null,
    newest: games.length ? games[0].date : null,
    bytesUsed: JSON.stringify(games).length,
  };
}

export function clearArchive() {
  try { localStorage.removeItem(GAMES_KEY); return true; }
  catch { return false; }
}

// ─── Spaced-repetition scheduler for the mistake bank (#3) ──────────
// Simple SM-2-inspired scheduler keyed by fenBefore (plus moveSan for
// uniqueness across identical positions reached from different games).
// Each card tracks:
//   ease (2.5 default; capped [1.3, 3.0])
//   intervalDays (how long until next review)
//   dueAt (ms timestamp)
//   reps (consecutive correct answers)
//   history [{ at, grade }]

const SRS_KEY = 'stockfish-explain.srs.cards';
const SRS_GRADES = { again: 0, hard: 1, good: 3, easy: 5 };

const DAY_MS = 24 * 60 * 60 * 1000;

export function loadSrsCards() {
  try {
    const raw = localStorage.getItem(SRS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}
export function saveSrsCards(arr) {
  try { localStorage.setItem(SRS_KEY, JSON.stringify(arr)); return true; }
  catch { return false; }
}

export function srsKey(mistake) {
  return `${mistake.fenBefore}|${mistake.san}`;
}

/**
 * Grade a card. Returns the updated card. Grades map to SM-2-like
 * transitions:
 *   again (0): reset reps, schedule in 1 day, drop ease by 0.2
 *   hard  (1): keep reps, schedule at interval × 1.2, drop ease 0.15
 *   good  (3): +1 rep, interval doubles (min 1 day after first rep)
 *   easy  (5): +1 rep, interval triples, ease +0.1
 */
export function gradeCard(card, grade) {
  const now = Date.now();
  const g = grade in SRS_GRADES ? SRS_GRADES[grade] : grade;
  const next = {
    ...card,
    history: [...(card.history || []), { at: now, grade: g }],
  };
  if (g === 0) {
    next.reps = 0;
    next.ease = Math.max(1.3, (card.ease || 2.5) - 0.2);
    next.intervalDays = 1;
  } else if (g === 1) {
    next.reps = card.reps || 0;
    next.ease = Math.max(1.3, (card.ease || 2.5) - 0.15);
    next.intervalDays = Math.max(1, Math.round((card.intervalDays || 1) * 1.2));
  } else if (g === 3) {
    next.reps = (card.reps || 0) + 1;
    next.ease = card.ease || 2.5;
    next.intervalDays = next.reps === 1 ? 1
                      : next.reps === 2 ? 3
                      : Math.round((card.intervalDays || 3) * (card.ease || 2.5));
  } else {
    next.reps = (card.reps || 0) + 1;
    next.ease = Math.min(3.0, (card.ease || 2.5) + 0.1);
    next.intervalDays = next.reps === 1 ? 3
                      : next.reps === 2 ? 7
                      : Math.round((card.intervalDays || 3) * (card.ease || 2.5) * 1.3);
  }
  next.dueAt = now + next.intervalDays * DAY_MS;
  next.lastReviewedAt = now;
  next.updatedAt = now;
  return next;
}

/**
 * Return cards that are currently due (dueAt <= now) OR brand-new
 * mistakes that haven't been seeded into SRS yet. Limited to a
 * daily review cap (default 15) so the queue is digestible.
 *
 * @param {number} cap — max cards to return
 */
export function dueMistakeCards(cap = 15) {
  const now = Date.now();
  const cards = loadSrsCards();
  const cardByKey = new Map(cards.map(c => [c.key, c]));
  const allMistakes = deriveMistakes();
  // Reviewed cards carry a compact mistake snapshot for cross-device
  // drills. Add any snapshots not derivable from this device's local
  // archive (the full games remain in cloud My Games).
  const mistakeKeys = new Set(allMistakes.map(srsKey));
  for (const card of cards) {
    if (card?._mistake && !mistakeKeys.has(card.key)) {
      allMistakes.push(card._mistake);
      mistakeKeys.add(card.key);
    }
  }
  // Keep user-side blunders + mistakes only; inaccuracies only get in
  // if we're light on more-severe material.
  const prioritised = [
    ...allMistakes.filter(m => m.byUser !== false && m.severity === 'blunder'),
    ...allMistakes.filter(m => m.byUser !== false && m.severity === 'mistake'),
    ...allMistakes.filter(m => m.byUser !== false && m.severity === 'inaccuracy'),
  ];
  const out = [];
  for (const m of prioritised) {
    const k = srsKey(m);
    const existing = cardByKey.get(k);
    if (!existing) {
      // Brand new — seed with default scheduling (due immediately).
      out.push({
        key: k,
        mistake: m,
        card: { key: k, ease: 2.5, intervalDays: 0, reps: 0, dueAt: now, history: [] },
        status: 'new',
      });
    } else if (existing.dueAt <= now) {
      out.push({
        key: k,
        mistake: m,
        card: existing,
        status: existing.reps > 0 ? 'review' : 'learning',
      });
    }
    if (out.length >= cap) break;
  }
  return out;
}

export function srsStats() {
  const cards = loadSrsCards();
  const now = Date.now();
  const due = cards.filter(c => c.dueAt <= now).length;
  const mature = cards.filter(c => (c.intervalDays || 0) >= 21).length;
  const learning = cards.filter(c => (c.reps || 0) < 2).length;
  return { total: cards.length, due, mature, learning };
}

export function upsertCard(updated) {
  const cards = loadSrsCards();
  const idx = cards.findIndex(c => c.key === updated.key);
  if (idx >= 0) cards[idx] = updated; else cards.push(updated);
  return saveSrsCards(cards);
}

export function clearSrs() {
  try { localStorage.removeItem(SRS_KEY); return true; }
  catch { return false; }
}

// ─── Auto-annotation for PGN export (#4) ────────────────────────────
// Given a raw PGN string (as produced by tree.pgn()) and a list of
// per-ply records [{ply, san, cpWhite, mate}], inject standard NAG
// annotations + short brace comments at each meaningful mainline
// eval swing. Variations (parenthesised) are left untouched — we only
// annotate the primary game as played.
//
// NAG codes used (standard PGN NAGs):
//   $1  !   (good move)
//   $2  ?   (mistake)
//   $3  !!  (brilliant)
//   $4  ??  (blunder)
//   $5  !?  (interesting / speculative)
//   $6  ?!  (dubious / inaccuracy)

export function annotatePgn(rawPgn, plies, options = {}) {
  if (!rawPgn || !plies || plies.length < 2) return rawPgn;
  const minSeverity = options.minSeverity || 'inaccuracy'; // show all by default
  const minRank = { inaccuracy: 1, mistake: 2, blunder: 3 }[minSeverity] || 1;

  // Build annotation list indexed by ply number.
  // plies[0] is the starting position; the first move is plies[1].
  const ann = new Map();
  for (let i = 1; i < plies.length; i++) {
    const prev = plies[i - 1], cur = plies[i];
    // Shared win-chance classifier (audit A5) — same as pills / My Games
    // / Mistake Bank. Was raw-cp 200/100/50, which disagreed with the
    // rest of the app (a 150cp drop at +8 was a "mistake" in the PGN but
    // invisible everywhere else).
    const sev = classifySeverity(moverWinDrop(prev, cur));
    if (!sev) continue;
    const nag = sev === 'blunder' ? '$4' : sev === 'mistake' ? '$2' : '$6';
    if (({ inaccuracy: 1, mistake: 2, blunder: 3 }[sev]) < minRank) continue;
    if (prev.cpWhite == null || cur.cpWhite == null) continue;   // need cp for the comment
    const cpBeforeWhite = (prev.cpWhite / 100).toFixed(2);
    const cpAfterWhite  = (cur.cpWhite  / 100).toFixed(2);
    ann.set(i, {
      nag, sev,
      comment: `eval ${cpBeforeWhite >= 0 ? '+' : ''}${cpBeforeWhite} → ${cpAfterWhite >= 0 ? '+' : ''}${cpAfterWhite}`,
    });
  }
  if (!ann.size) return rawPgn;

  // Split PGN into tag block + body.
  const splitIdx = rawPgn.indexOf('\n\n');
  if (splitIdx < 0) return rawPgn;
  const tagBlock = rawPgn.slice(0, splitIdx);
  const body     = rawPgn.slice(splitIdx + 2);

  // Tokenize body while tracking paren depth (variations) so we only
  // annotate mainline moves.
  const tokens = body.match(/\([^)]*\)|\{[^}]*\}|[^\s()]+|\s+/g) || [];
  let depth = 0;
  let plyCount = 0;
  const out = [];
  for (const tok of tokens) {
    if (tok.startsWith('(')) { depth++; out.push(tok); continue; }
    if (tok === ')')         { depth--; out.push(tok); continue; }
    if (depth > 0)           { out.push(tok); continue; }
    // At depth 0 — mainline. Identify SAN move tokens (skip move numbers,
    // comments, tags, results).
    if (
      tok.trim() === '' ||
      /^\d+\.+$/.test(tok) ||
      /^\{/.test(tok) ||
      /^(1-0|0-1|1\/2-1\/2|\*)$/.test(tok)
    ) {
      out.push(tok);
      continue;
    }
    // Looks like a SAN move.
    plyCount++;
    out.push(tok);
    const a = ann.get(plyCount);
    if (a) {
      out.push(' ', a.nag, ' {', a.comment, '}');
    }
  }
  return tagBlock + '\n\n' + out.join('');
}
