import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildLichessCandidateArrows,
  lichessAlternativeWidth,
} from '../src/engine-arrows.js';

const line = (multipv, score, uci, scoreKind = 'cp') => ({
  multipv,
  score,
  scoreKind,
  pv: [uci],
});

test('Lichess candidate arrows use pale blue for #1 and gap-scaled pale grey alternatives', () => {
  const best = line(1, 30, 'e2e4');
  const close = line(2, 20, 'd2d4');
  const farther = line(3, -30, 'g1f3');
  const arrows = buildLichessCandidateArrows([farther, best, close]);

  assert.deepEqual(arrows[0], {
    orig: 'e2', dest: 'e4', brush: 'paleBlue',
  });
  assert.equal(arrows[1].brush, 'paleGrey');
  assert.equal(arrows[2].brush, 'paleGrey');
  assert.ok(arrows[1].modifiers.lineWidth > arrows[2].modifiers.lineWidth);
  assert.equal(arrows[1].modifiers.lineWidth, lichessAlternativeWidth(best, close));
});

test('Lichess candidate arrows hide clearly inferior and duplicate root moves', () => {
  const arrows = buildLichessCandidateArrows([
    line(1, 500, 'e2e4'),
    line(2, 490, 'e2e4'),
    line(3, -500, 'a2a3'),
  ]);
  assert.deepEqual(arrows, [{ orig: 'e2', dest: 'e4', brush: 'paleBlue' }]);
});

test('mate evaluations participate in the same Lichess winning-chance cutoff', () => {
  assert.equal(lichessAlternativeWidth(
    line(1, 3, 'h5h7', 'mate'),
    line(2, -3, 'h5e5', 'mate'),
  ), null);
});
