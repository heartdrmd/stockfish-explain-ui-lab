import test from 'node:test';
import assert from 'node:assert/strict';
import { fitSplit, splitBounds, fitBoardHeight } from '../src/workspace-split.js';

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

test('regular 2D fills the space below its top gap and leaves the navigation visible', () => {
  for (const header of [40, 60, 100]) for (const viewport of [340, 600, 900]) {
    const fit = fitBoardHeight(800, viewport, header, 80);
    assert.equal(fit.top - header, 24);
    assert.ok(fit.top + fit.height + 80 + 20 <= viewport);
    assert.equal(fit.height, Math.min(800, viewport - header - 24 - 80 - 20));
  }
  assert.deepEqual(fitBoardHeight(300, 900, 60, 80), {top:84,height:300});
  assert.deepEqual(fitBoardHeight(800, 600, 60, 80, 12), {top:72,height:428});
});
