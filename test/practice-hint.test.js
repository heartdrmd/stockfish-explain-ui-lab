import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { buildPracticeHintLines } from '../src/practice-hint.js';

test('practice hints convert every candidate from side-to-move into White POV', () => {
  const blackToMove = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1';
  const lines = buildPracticeHintLines([
    { scoreKind: 'cp', score: 120, pv: ['e7e5'] },
    { scoreKind: 'cp', score: -80, pv: ['d7d5'] },
    { scoreKind: 'mate', score: 3, pv: ['g8f6'] },
  ], blackToMove);

  assert.equal(lines[0].evalText, '-1.20');
  assert.equal(lines[1].evalText, '+0.80');
  assert.equal(lines[2].evalText, '#-3');
});

test('practice hint UI offers seconds through minutes and an explicit White POV label', async () => {
  const [html, main] = await Promise.all([
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../src/main.js', import.meta.url), 'utf8'),
  ]);
  assert.match(html, /SHOW 3 TOP ENGINE MOVES \(HINT\)/);
  assert.match(html, /value="1000">1 second/);
  assert.match(html, /value="300000">5 minutes/);
  assert.match(main, /White POV/);
  assert.match(main, /stockfish-explain\.practice-hint-time-ms/);
});
