// src/game-stats.js — per-side accuracy / ACPL / inaccuracy / mistake /
// blunder computation from a plies array.
//
// Thresholds mirror the lichess "winning-chance delta" convention — we
// compute the drop in win-chance between consecutive evals from the
// moving side's POV, not raw cp. Same formula used by our
// `classifyAccuracy` path in main.js.
//
// This module only DERIVES stats from already-computed plies; it does
// not call the engine. Safe to run synchronously inside the render
// loop of the My Games tab or the live analysis panel.

// Shared eval math (audit A5) — one sigmoid, thresholds, accuracy
// formula, and mate/null policy for the whole app.
import { moverWinDrop, classifySeverity, moveAccuracy } from './evals.js';

// Which colour moved to reach `after`? From the FEN's side-to-move
// (the opponent of the mover), so this is correct even for games that
// started from a custom position (audit A12 — parity i%2 assumed
// white-first and swapped the sides for Black-to-move start FENs).
// Falls back to ply-index parity if the FEN is missing.
function moverColor(after, plyIndex) {
  const stm = (after && after.fen && after.fen.split(' ')[1]) || null;
  if (stm) return stm === 'b' ? 'white' : 'black';
  return plyIndex % 2 === 0 ? 'white' : 'black';
}

// Plies shape assumed: [{ cpWhite, mate, san }, ...]
// Index i is the position AFTER ply i+1 has been played.
// Index 0 corresponds to the position after move 1 (white's first move).
// Returns { white, black, byKind } — byKind maps 'inaccuracy'/'mistake'/
// 'blunder' → { white: [plyNum...], black: [plyNum...] } so callers
// can cycle through mistakes Lichess-style.
export function computeGameStats(plies) {
  const empty = () => ({
    moves: 0, inaccuracies: 0, mistakes: 0, blunders: 0,
    acpl: 0, accuracy: 0,
    _sumLoss: 0, _sumAcc: 0,
  });
  const white = empty();
  const black = empty();
  const byKind = {
    inaccuracy: { white: [], black: [] },
    mistake:    { white: [], black: [] },
    blunder:    { white: [], black: [] },
  };
  if (!Array.isArray(plies) || plies.length < 2) {
    return { white: finalise(white), black: finalise(black), byKind };
  }
  // ACPL cap: clamp per-move loss to 1000 cp so a single blow-up in a
  // lost position doesn't dominate the average (industry-standard cap —
  // Chess.com, SCID, lichess's PGN importer).
  const ACPL_CAP_CP = 1000;
  for (let i = 0; i < plies.length; i++) {
    const before = i === 0
      ? { cpWhite: 20, mate: null, fen: null }   // startpos ≈ +0.2 for white
      : plies[i - 1];
    const after = plies[i];
    const mover = moverColor(after, i);
    // Shared classifier (audit A5) — same sigmoid/thresholds as the pills,
    // Mistake Bank, and PGN. moverWinDrop returns null for unevaluated
    // plies and for terminal mate:0, so those are skipped (A3 + A11 — a
    // null eval no longer reads as a phantom blunder, and the checkmating
    // move is no longer charged as a blunder for the winner).
    const drop = moverWinDrop(before, after);
    if (drop == null) continue;
    const kind = classifySeverity(drop);        // null | inaccuracy | mistake | blunder
    const acc  = moveAccuracy(drop);
    // True ACPL: cp loss from the mover's POV, capped at 1000/move so
    // blow-ups in lost positions don't dominate. Skip mate positions
    // (can't sign them cleanly here — moverWinDrop already excluded
    // mate:0; a non-zero mate is a decisive eval with no meaningful cp
    // loss to average).
    if (before.mate == null && after.mate == null) {
      const sign = mover === 'white' ? 1 : -1;
      const cpBefore = (before.cpWhite ?? 0) * sign;
      const cpAfter  = (after.cpWhite  ?? 0) * sign;
      const cpl = Math.max(0, Math.min(ACPL_CAP_CP, cpBefore - cpAfter));
      const b = mover === 'white' ? white : black;
      b._sumLoss += cpl;
    }
    const bucket = mover === 'white' ? white : black;
    bucket.moves++;
    bucket._sumAcc += (acc == null ? 100 : acc);
    const plyNum = i + 1;
    if      (kind === 'blunder')    { bucket.blunders++;     byKind.blunder[mover].push(plyNum); }
    else if (kind === 'mistake')    { bucket.mistakes++;     byKind.mistake[mover].push(plyNum); }
    else if (kind === 'inaccuracy') { bucket.inaccuracies++; byKind.inaccuracy[mover].push(plyNum); }
  }
  return { white: finalise(white), black: finalise(black), byKind };
}

function finalise(b) {
  if (b.moves === 0) {
    return { moves: 0, inaccuracies: 0, mistakes: 0, blunders: 0, acpl: 0, accuracy: 0 };
  }
  return {
    moves:         b.moves,
    inaccuracies:  b.inaccuracies,
    mistakes:      b.mistakes,
    blunders:      b.blunders,
    acpl:          Math.round(b._sumLoss / b.moves),
    accuracy:      Math.round(b._sumAcc / b.moves),
  };
}

// Format for the stats-panel UI. Returns an HTML string.
// `side` = 'white' | 'black'. `name` = display name. `isUser` flag
// colours the accuracy pill blue like Lichess's own-side highlight.
// `byKind` (optional) lets inaccuracy/mistake/blunder rows become
// clickable — they get data-plies attributes with CSV ply indexes so
// callers can cycle through each mistake.
export function renderStatsPanel({ side, name, stats, isUser, byKind }) {
  const dot = side === 'white' ? '●' : '○';
  const klass = isUser ? 'gs-side gs-side-user' : 'gs-side';
  const acc = stats.accuracy;
  const accColor = acc >= 90 ? '#4ec9b0' : acc >= 75 ? '#9cdcfe' : acc >= 60 ? '#dcdcaa' : '#f48771';
  const kindRow = (n, label, kind, kindKey) => {
    const plies = (byKind && byKind[kindKey] && byKind[kindKey][side]) || [];
    const clickable = plies.length > 0;
    const cls = `gs-row gs-${kind}${clickable ? ' gs-clickable' : ''}`;
    const dataAttrs = clickable
      ? ` data-side="${side}" data-kind="${kindKey}" data-plies="${plies.join(',')}" title="Click to cycle through each ${label.toLowerCase()}"`
      : '';
    return `<div class="${cls}"${dataAttrs}><span class="gs-n">${n}</span><span class="gs-label">${label}</span></div>`;
  };
  return `
    <div class="${klass}" data-side="${side}">
      <div class="gs-head"><span class="gs-dot">${dot}</span><strong>${escapeHtml(name || (side === 'white' ? 'White' : 'Black'))}</strong></div>
      ${kindRow(stats.inaccuracies, 'Inaccuracies', 'inacc', 'inaccuracy')}
      ${kindRow(stats.mistakes,     'Mistakes',     'mist',  'mistake')}
      ${kindRow(stats.blunders,     'Blunders',     'blun',  'blunder')}
      <div class="gs-row gs-acpl">
        <span class="gs-n">${stats.acpl}</span>
        <span class="gs-label">Average centipawn loss</span>
      </div>
      <div class="gs-row gs-acc">
        <span class="gs-n" style="color:${accColor}">${stats.accuracy}%</span>
        <span class="gs-label">Accuracy</span>
      </div>
    </div>`;
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c => (
    { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]
  ));
}
