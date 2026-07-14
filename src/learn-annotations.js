import { classifySeverity, isLearnCandidateDrop } from './evals.js';

const META = {
  'small-miss': { severity: 'small-miss', mark: '△', label: 'Small miss' },
  inaccuracy:   { severity: 'inaccuracy', mark: '?!', label: 'Inaccuracy' },
  mistake:      { severity: 'mistake', mark: '?', label: 'Mistake' },
  blunder:      { severity: 'blunder', mark: '??', label: 'Blunder' },
};

export function isUserMovePly(ply, userColor) {
  if (userColor !== 'white' && userColor !== 'black') return null;
  const moverColor = Number(ply) % 2 === 1 ? 'white' : 'black';
  return moverColor === userColor;
}

export function includeLessonPly(ply, userColor, includeOpponentMistakes = false) {
  const userMove = isUserMovePly(ply, userColor);
  // Analysis games without a recorded user side retain the established
  // two-sided review behavior because "mine" cannot be determined.
  return userMove == null || userMove || !!includeOpponentMistakes;
}

export function notationAnnotation(drop, lessonThresholdPoints = 6) {
  const official = classifySeverity(drop);
  if (official && META[official]) return { ...META[official] };
  if (isLearnCandidateDrop(drop, Number(lessonThresholdPoints) / 100)) {
    return { ...META['small-miss'] };
  }
  return null;
}

