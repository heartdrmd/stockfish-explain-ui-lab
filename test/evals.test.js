import test from 'node:test';
import assert from 'node:assert/strict';

import {
  classifySeverity,
  engineScoreToWhite,
  formatWhiteEval,
  isLearnCandidateDrop,
  moveAccuracy,
  moverWinDrop,
  winChanceWhite,
} from '../src/evals.js';

test('engine scores cross into White POV exactly once for either side', () => {
  const whiteFen = '8/8/8/8/8/8/8/8 w - - 0 1';
  const blackFen = '8/8/8/8/8/8/8/8 b - - 0 1';
  assert.equal(engineScoreToWhite(125, whiteFen), 125);
  assert.equal(engineScoreToWhite(125, blackFen), -125);
  assert.equal(engineScoreToWhite(-80, blackFen), 80);
});

test('visible evals use the same White POV convention for cp and mate', () => {
  assert.equal(formatWhiteEval(125, null), '+1.25');
  assert.equal(formatWhiteEval(-125, null), '-1.25');
  assert.equal(formatWhiteEval(null, 3), '#3');
  assert.equal(formatWhiteEval(null, -3), '#-3');
  assert.equal(formatWhiteEval(null, null), '—');
});

test('moverWinDrop matches Lichess povDiff probability scale', () => {
  const before = { cpWhite: 0, mate: null, fen: '8/8/8/8/8/8/8/8 w - - 0 1' };
  const after = { cpWhite: -100, mate: null, fen: '8/8/8/8/8/8/8/8 b - - 0 1' };
  const expected = (winChanceWhite(0, null) - winChanceWhite(-100, null)) / 2;
  assert.ok(Math.abs(moverWinDrop(before, after) - expected) < 1e-12);
});

test('shared severity thresholds use normalized probability points', () => {
  assert.equal(classifySeverity(0.0599), null);
  assert.equal(classifySeverity(0.06), 'inaccuracy');
  assert.equal(classifySeverity(0.12), 'mistake');
  assert.equal(classifySeverity(0.20), 'blunder');
});

test('Learn includes inaccuracies as well as mistakes and blunders', () => {
  // Regression: a real game containing only 6–9.3 point losses was
  // incorrectly reported as clean by Learn's old, separate 10-point cutoff.
  for (const drop of [0.068, 0.065, 0.064, 0.093, 0.062]) {
    assert.equal(isLearnCandidateDrop(drop), true);
  }
  assert.equal(isLearnCandidateDrop(0.0599), false);
  assert.equal(isLearnCandidateDrop(0.12), true);
  assert.equal(isLearnCandidateDrop(0.20), true);
  assert.equal(isLearnCandidateDrop(null), false);
});

test('Learn sensitivity can include small misses without changing Lichess severity', () => {
  assert.equal(classifySeverity(0.04), null);
  assert.equal(isLearnCandidateDrop(0.04), false);
  assert.equal(isLearnCandidateDrop(0.04, 0.04), true);
  assert.equal(isLearnCandidateDrop(0.03, 0.03), true);
  assert.equal(isLearnCandidateDrop(0.0299, 0.03), false);
});

test('move accuracy treats 0.10 as ten probability points', () => {
  const expected = 103.1668 * Math.exp(-0.04354 * 10) - 3.1669;
  assert.ok(Math.abs(moveAccuracy(0.10) - expected) < 1e-9);
});
