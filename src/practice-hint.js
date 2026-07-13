import { Chess } from '../vendor/chess.js/chess.js';
import { engineScoreToWhite, formatWhiteEval } from './evals.js';

function pvToSan(fen, pv = []) {
  const chess = new Chess(fen);
  const san = [];
  for (const uci of pv.slice(0, 8)) {
    try {
      const move = chess.move({
        from: uci.slice(0, 2),
        to: uci.slice(2, 4),
        promotion: uci[4] || undefined,
      });
      if (!move) break;
      san.push(move.san);
    } catch {
      break;
    }
  }
  return san;
}

// Stockfish's raw score is from the side-to-move POV. Convert it exactly
// once here so every visible practice-hint value follows the application's
// canonical convention: positive favours White, negative favours Black.
export function buildPracticeHintLines(topMoves, fen, limit = 3) {
  return (topMoves || []).slice(0, limit).map((line, index) => {
    const pvSan = pvToSan(fen, line.pv || []);
    const whiteScore = engineScoreToWhite(line.score, fen);
    const isMate = line.scoreKind === 'mate';
    return {
      rank: index + 1,
      uci: line.pv?.[0] || null,
      san: pvSan[0] || line.pv?.[0] || '—',
      pvSan: pvSan.join(' '),
      cpWhite: isMate ? null : whiteScore,
      mateWhite: isMate ? whiteScore : null,
      evalText: isMate
        ? formatWhiteEval(null, whiteScore)
        : formatWhiteEval(whiteScore, null),
    };
  });
}

// Keep one durable answer per exact game position. Asking again with a
// longer think time replaces the older result instead of bloating the game
// record with duplicates. A generous cap protects localStorage/JSONB from
// pathological marathon sessions while preserving normal games in full.
export function upsertPracticeHint(history, record, limit = 100) {
  if (!record?.fen || !Number.isFinite(+record.ply)) {
    return Array.isArray(history) ? history.slice() : [];
  }
  const previous = Array.isArray(history) ? history : [];
  const next = previous.filter(item =>
    !(item?.fen === record.fen && +item?.ply === +record.ply));
  next.push(record);
  return next.slice(-Math.max(1, limit));
}
