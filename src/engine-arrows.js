// Lichess-style local-engine candidate arrows.
// Source model:
// https://github.com/lichess-org/lila/blob/master/ui/analyse/src/autoShape.ts
// https://github.com/lichess-org/lila/blob/master/ui/lib/src/ceval/winningChances.ts

const WIN_MULTIPLIER = -0.00368208;

function rawWinningChances(cp) {
  return 2 / (1 + Math.exp(WIN_MULTIPLIER * cp)) - 1;
}

function lineWinningChances(line) {
  if (!line || !Number.isFinite(Number(line.score))) return null;
  const score = Number(line.score);
  if (line.scoreKind === 'mate') {
    if (score === 0) return null;
    const cp = (21 - Math.min(10, Math.abs(score))) * 100;
    return rawWinningChances(cp * (score > 0 ? 1 : -1));
  }
  return rawWinningChances(Math.min(1000, Math.max(-1000, score)));
}

/**
 * Lichess's alternative-arrow width. Engine scores here are already from
 * the side-to-move POV, so no White/Black flip is needed before comparing.
 * Alternatives 20+ winning-chance points behind #1 are intentionally hidden.
 */
export function lichessAlternativeWidth(best, candidate) {
  const bestChance = lineWinningChances(best);
  const candidateChance = lineWinningChances(candidate);
  if (bestChance == null || candidateChance == null) return null;
  const shift = (bestChance - candidateChance) / 2;
  if (shift < 0 || shift >= 0.2) return null;
  return Math.round(12 - shift * 50); // exact lila range: 12 down to 2
}

/** Build the root-move arrows for the visible MultiPV candidates. */
export function buildLichessCandidateArrows(topMoves, maxLines = 3) {
  const lines = Array.from(topMoves || [])
    .filter(line => line?.pv?.[0]?.length >= 4)
    .sort((a, b) => (a.multipv || 99) - (b.multipv || 99))
    .slice(0, Math.max(1, maxLines));
  const best = lines[0];
  if (!best) return [];

  const bestUci = best.pv[0];
  const shapes = [{
    orig: bestUci.slice(0, 2),
    dest: bestUci.slice(2, 4),
    brush: 'paleBlue',
  }];

  for (const candidate of lines.slice(1)) {
    const uci = candidate.pv[0];
    if (uci === bestUci) continue;
    const lineWidth = lichessAlternativeWidth(best, candidate);
    if (lineWidth == null) continue;
    shapes.push({
      orig: uci.slice(0, 2),
      dest: uci.slice(2, 4),
      brush: 'paleGrey',
      modifiers: { lineWidth },
    });
  }
  return shapes;
}
