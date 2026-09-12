import test from 'node:test';
import assert from 'node:assert/strict';
import { fitSplit, splitBounds } from '../src/workspace-split.js';

test('workspace split preserves usable board and analysis widths at both drag limits', () => {
  for (const space of [640, 780, 900, 1200, 1800]) {
    for (const request of [-10000, 0, 300, space * 0.58, 10000]) {
      const split = fitSplit(space, request);
      assert.ok(split.board >= 300 && split.board <= 1100);
      assert.ok(split.tools >= 280);
      assert.equal(split.board + split.tools, space);
    }
  }
});

test('a remembered ratio refits a narrower window and handles invalid dimensions', () => {
  const ratio = 0.6;
  assert.equal(fitSplit(1000, 1000 * ratio).board, 600);
  assert.equal(fitSplit(700, 700 * ratio).board, 420);
  assert.deepEqual(fitSplit(0, 900), { board: 0, tools: 0 });
  assert.deepEqual(splitBounds(NaN), { min: 0, max: 0, available: 0 });
  assert.equal(fitSplit(1000, NaN).board, 580);
});
