// Pure helpers for Learn-from-Mistakes exploration.
//
// Comparison rows may carry Stockfish's cached PV as UCI (preferred) or
// SAN (legacy cache). Normalize either form into one legal UCI line that
// always begins with the move the learner clicked.

import { Chess } from '../vendor/chess.js/chess.js';

const UCI_RE = /^[a-h][1-8][a-h][1-8][qrbn]?$/;

export function isLearnExploreUci(value) {
  return UCI_RE.test(String(value || '').toLowerCase());
}

function applyUci(chess, uci) {
  try {
    return chess.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci[4] || undefined,
    });
  } catch {
    return null;
  }
}

function legalUciPrefix(fen, ucis) {
  const chess = new Chess(fen);
  const legal = [];
  for (const raw of ucis) {
    const uci = String(raw || '').toLowerCase();
    if (!isLearnExploreUci(uci) || !applyUci(chess, uci)) break;
    legal.push(uci);
  }
  return legal;
}

function sanPvToUcis(fen, pvSan) {
  const chess = new Chess(fen);
  const ucis = [];
  const tokens = String(pvSan || '').trim().split(/\s+/).filter(Boolean);
  for (const token of tokens) {
    // Be tolerant of a future cache that includes move-number tokens.
    if (/^\d+\.(?:\.\.)?$/.test(token)) continue;
    let move = null;
    try { move = chess.move(token, { sloppy: true }); } catch {}
    if (!move) break;
    ucis.push(move.from + move.to + (move.promotion || ''));
  }
  return ucis;
}

export function buildLearnExploreUciLine(fen, row) {
  const selected = String(row?.uci || '').toLowerCase();
  if (!fen || !isLearnExploreUci(selected)) return [];

  let candidate = Array.isArray(row?.pvUci)
    ? row.pvUci.map(uci => String(uci || '').toLowerCase())
    : [];
  if (!candidate.length && row?.pvSan) candidate = sanPvToUcis(fen, row.pvSan);

  // A comparison cache from an older version may have a partial/mismatched
  // PV. Never explore a different first move than the button the user chose.
  if (candidate[0] !== selected) candidate = [selected];

  const legal = legalUciPrefix(fen, candidate);
  if (legal[0] === selected) return legal;

  // The selected move itself is the minimum useful exploration line.
  return legalUciPrefix(fen, [selected]);
}
