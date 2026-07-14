// src/evals.js — the ONE source of truth for evaluation math.
//
// Before this module there were FOUR subtly different implementations of
// "how bad was this move" scattered across the app (audit A5):
//   • game_archive.js  — raw-cp thresholds 200/100/50, ignored mate
//   • main.js          — win-chance sigmoid exp(-0.004·cp), thr 0.06/0.12/0.20
//   • game-stats.js    — win-chance sigmoid exp(-0.00368208·cp), same thr
//   • eval-graph.js    — sigmoid exp(-0.00368208·cp)
// So the same game showed different mistake counts in the Mistake Bank
// vs the accuracy pills vs My Games vs the PGN annotations, and blunders
// into forced mate never entered the bank at all.
//
// Everything now imports from here: one sigmoid, one threshold set, one
// accuracy formula, one mate policy (including mate:0), and explicit
// null handling so unanalysed plies don't read as 0.00.

// Lichess winning-chances constant (lila: ui/ceval/src/winningChances.ts).
export const WIN_MULTIPLIER = -0.00368208;

// Win-probability drop thresholds, mover POV, on the [-1,+1] scale. These are
// lichess nodeFinder defaults: a 0.06 (6-point) win-% drop is an
// inaccuracy, 0.12 a mistake, 0.20 a blunder.
export const THRESHOLDS = { inaccuracy: 0.06, mistake: 0.12, blunder: 0.20 };

// White-POV winning chance in [-1, +1].
//   • cp is white-POV centipawns (as stored in plies as cpWhite).
//   • mate is white-POV signed mate distance (positive = white mating).
//   • mate === 0 is a TERMINAL checkmate whose winner can't be derived
//     from the score alone (the sign is lost) — callers that have the
//     FEN resolve it; here we return null so it's treated as "no clean
//     eval" rather than a bogus -1.
//   • Unevaluated (cp null) returns null — NEVER 0 (audit A3: treating
//     a missing eval as equality created phantom blunders).
export function winChanceWhite(cp, mate) {
  if (mate != null) {
    if (mate > 0) return 1;
    if (mate < 0) return -1;
    return null;                       // mate:0 — ambiguous here
  }
  if (cp == null || !Number.isFinite(cp)) return null;
  return 2 / (1 + Math.exp(WIN_MULTIPLIER * cp)) - 1;
}

// Stockfish reports a search score from the side-to-move's point of view.
// The rest of this app stores and displays evaluations from White's point of
// view, so every engine result must cross this boundary exactly once.
export function engineScoreToWhite(score, fen) {
  if (score == null || !Number.isFinite(score)) return null;
  const sideToMove = (fen && fen.split(' ')[1]) || 'w';
  return sideToMove === 'b' ? -score : score;
}

// Canonical visible evaluation format. Positive always favours White and
// negative always favours Black, including mate scores.
export function formatWhiteEval(cpWhite, mateWhite) {
  if (mateWhite != null && Number.isFinite(mateWhite)) {
    return mateWhite < 0 ? `#-${Math.abs(mateWhite)}` : `#${mateWhite}`;
  }
  if (cpWhite == null || !Number.isFinite(cpWhite)) return '—';
  return `${cpWhite >= 0 ? '+' : ''}${(cpWhite / 100).toFixed(2)}`;
}

// Which colour just moved to reach `after`? The side to move IN `after`
// is the opponent of the mover, so mover = opposite of after's STM.
// Returns 'white' | 'black' (defaults to the side that would have moved
// into a white-to-move position if the FEN is missing).
function moverOf(after) {
  const stm = (after && after.fen && after.fen.split(' ')[1]) || 'w';
  return stm === 'b' ? 'white' : 'black';
}

// Mover-POV winning-chance drop between two ply records
// { cpWhite, mate, fen }. Positive = the move made things worse for the
// mover. Returns null when either side is unevaluated (skip it), and 0
// for a terminal checkmating move (mate:0 in `after` — the best possible
// move, never a mistake; audit A11).
export function moverWinDrop(before, after) {
  if (!before || !after) return null;
  if (after.mate === 0) return 0;                    // mover delivered mate
  const wb = winChanceWhite(before.cpWhite, before.mate);
  const wa = winChanceWhite(after.cpWhite,  after.mate);
  if (wb == null || wa == null) return null;         // unevaluated / terminal
  const sign = moverOf(after) === 'white' ? 1 : -1;
  // Lichess winningChances.povDiff divides the difference of the
  // [-1,+1] winning-chance values by 2. That maps it to an actual
  // probability delta: 0.04 = four percentage points, not eight.
  return ((sign * wb) - (sign * wa)) / 2;
}

// Severity of a single move, or null if not bad enough / unscorable.
export function classifySeverity(drop) {
  if (drop == null) return null;
  if (drop >= THRESHOLDS.blunder)    return 'blunder';
  if (drop >= THRESHOLDS.mistake)    return 'mistake';
  if (drop >= THRESHOLDS.inaccuracy) return 'inaccuracy';
  return null;
}

// Learn defaults to Lichess's 6-point inaccuracy threshold, but may include
// smaller coaching misses when the learner explicitly selects a more
// sensitive lesson list. Official severity labels remain unchanged.
export function isLearnCandidateDrop(drop, minimumDrop = THRESHOLDS.inaccuracy) {
  if (drop == null || !Number.isFinite(drop)) return false;
  const requested = Number(minimumDrop);
  const cutoff = Number.isFinite(requested)
    ? Math.max(0, requested)
    : THRESHOLDS.inaccuracy;
  return drop >= cutoff;
}

// Full quality bucket for the accuracy pills / learn-mode:
//   'unknown' (unevaluated) | 'best' | 'good' | 'ok' |
//   'inaccuracy' | 'mistake' | 'blunder'
export function classifyQuality(before, after) {
  const drop = moverWinDrop(before, after);
  if (drop == null) return 'unknown';
  if (drop >= THRESHOLDS.blunder)    return 'blunder';
  if (drop >= THRESHOLDS.mistake)    return 'mistake';
  if (drop >= THRESHOLDS.inaccuracy) return 'inaccuracy';
  if (drop >= 0.02) return 'ok';
  if (drop >= 0)    return 'good';
  return 'best';
}

// Accuracy % for a single move given the mover-POV win-chance drop.
// Lichess: 103.1668·exp(-0.04354·Δwin%) - 3.1669, where Δwin% is in
// percentage POINTS. moverWinDrop already applies Lichess's `/ 2`, so
// 0.01 = one percentage point and Δwin% = 100·drop.
export function moveAccuracy(drop) {
  if (drop == null) return null;
  if (drop <= 0) return 100;
  const v = 103.1668 * Math.exp(-0.04354 * (drop * 100)) - 3.1669;
  return Math.max(0, Math.min(100, Number.isFinite(v) ? v : 0));
}
