import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { BoardController } from '../src/board.js';

function testBoard() {
  const board = new BoardController(null, null);
  board.cg = {
    move() {},
    set() {},
    setPieces() {},
  };
  return board;
}

test('a current-position PV move advances the explored branch without jumping to live', () => {
  const board = testBoard();
  assert.equal(board.playUciMoves(
    ['f2f3', 'e7e5', 'g2g4', 'd8h4'],
    { animate: false },
  ), true);
  const originalLivePath = board.livePath;

  const selectedPath = board.tree.addUciLine(['e2e4'], '');
  assert.equal(board.goToPath(selectedPath), true);
  assert.equal(board.isAtLive(), false);

  assert.equal(board.playUciMoves(['c7c6'], {
    fromCurrent: true,
    preserveLivePath: true,
  }), true);

  assert.deepEqual(board.chess.history(), ['e4', 'c6']);
  assert.equal(board.livePath, originalLivePath);
  assert.equal(board.isAtLive(), false);
  assert.equal(board.viewPly, 2);
  assert.equal(board._historicalChess, board.chess);

  board.toEnd();
  assert.deepEqual(board.chess.history(), ['f3', 'e5', 'g4', 'Qh4#']);
  assert.equal(board.isAtLive(), true);
});

test('a normal live-position PV move still becomes the active continuation', () => {
  const board = testBoard();

  assert.equal(board.playUciMoves(['e2e4'], {
    fromCurrent: true,
    preserveLivePath: false,
  }), true);

  assert.deepEqual(board.chess.history(), ['e4']);
  assert.equal(board.tree.currentPath, board.livePath);
  assert.equal(board.isAtLive(), true);
  assert.equal(board.viewPly, null);
  assert.equal(board._historicalChess, null);
});

test('engine PV click opts into current-position play and Learn-only endpoint preservation', async () => {
  const explain = await readFile(new URL('../src/explain.js', import.meta.url), 'utf8');
  assert.match(explain, /window\.__learnExploring === true/);
  assert.match(explain, /board\.playUciMoves\(\[pv\[0\]\], \{[\s\S]*?fromCurrent: true,[\s\S]*?preserveLivePath/);
});
