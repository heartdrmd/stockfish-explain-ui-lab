const UCI_MOVE = /^[a-h][1-8][a-h][1-8][qrbn]?$/;

function cleanUci(value) {
  const uci = String(value || '').trim().toLowerCase();
  return UCI_MOVE.test(uci) ? uci : null;
}

function arrow(uci, brush, lineWidth) {
  return {
    orig: uci.slice(0, 2),
    dest: uci.slice(2, 4),
    brush,
    modifiers: { lineWidth },
  };
}

/**
 * Build the Chessground arrows used after a Learn From Mistakes attempt.
 * The original error is deliberately not included here: it is rendered by
 * main.js as a separate, thin red SVG so it can stay visible alongside these
 * engine/attempt arrows.
 */
export function buildLearnFeedbackArrows({
  bestUci,
  attemptUci,
  attemptAccepted = false,
  revealBest = true,
} = {}) {
  const best = cleanUci(bestUci);
  const attempt = cleanUci(attemptUci);
  const exactBest = !!(attemptAccepted && best && attempt && attempt === best);
  const shapes = [];

  // If the learner found Stockfish #1, one large blue arrow communicates
  // both facts without laying a duplicate green arrow over the same move.
  if (exactBest) {
    shapes.push(arrow(attempt, 'blue', 24));
    return { shapes, exactBest };
  }

  if (revealBest && best) shapes.push(arrow(best, 'green', 22));

  // A reasonable accepted alternative remains visible, but much thinner
  // than the #1 arrow so the hierarchy is unmistakable.
  if (attemptAccepted && attempt) shapes.push(arrow(attempt, 'blue', 8));

  return { shapes, exactBest };
}
