import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLearnFeedbackArrows } from '../src/learn-arrows.js';

test('accepted alternative shows large green best arrow and small blue try', () => {
  const result = buildLearnFeedbackArrows({
    bestUci: 'c3d5',
    attemptUci: 'c3b5',
    attemptAccepted: true,
    revealBest: true,
  });
  assert.equal(result.exactBest, false);
  assert.deepEqual(result.shapes, [
    { orig: 'c3', dest: 'd5', brush: 'green', modifiers: { lineWidth: 22 } },
    { orig: 'c3', dest: 'b5', brush: 'blue', modifiers: { lineWidth: 8 } },
  ]);
});

test('exact best attempt shows one large blue arrow without duplicate green', () => {
  const result = buildLearnFeedbackArrows({
    bestUci: 'G1F3',
    attemptUci: 'g1f3',
    attemptAccepted: true,
    revealBest: true,
  });
  assert.equal(result.exactBest, true);
  assert.deepEqual(result.shapes, [
    { orig: 'g1', dest: 'f3', brush: 'blue', modifiers: { lineWidth: 24 } },
  ]);
});

test('accepted try can be previewed in blue before revealing the answer', () => {
  const exact = buildLearnFeedbackArrows({
    bestUci: 'e2e4', attemptUci: 'e2e4', attemptAccepted: true, revealBest: false,
  });
  const alternative = buildLearnFeedbackArrows({
    bestUci: 'e2e4', attemptUci: 'd2d4', attemptAccepted: true, revealBest: false,
  });
  assert.equal(exact.shapes[0].modifiers.lineWidth, 24);
  assert.deepEqual(alternative.shapes, [
    { orig: 'd2', dest: 'd4', brush: 'blue', modifiers: { lineWidth: 8 } },
  ]);
});

test('failed or malformed attempts never get a blue approval arrow', () => {
  const result = buildLearnFeedbackArrows({
    bestUci: 'e7e8q',
    attemptUci: 'not-a-move',
    attemptAccepted: false,
    revealBest: true,
  });
  assert.deepEqual(result.shapes, [
    { orig: 'e7', dest: 'e8', brush: 'green', modifiers: { lineWidth: 22 } },
  ]);
});
