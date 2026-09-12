import test from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from '../vendor/chess.js/chess.js';
import { GameTree } from '../src/tree.js';
import { studyGraphForBoard } from '../src/board-graph.js';
import { pliesToSeries } from '../src/eval-graph.js';

test('fullscreen graph follows existing scores, gaps and move paths without changing the game', () => {
  const chess = new Chess(), tree = new GameTree(chess.fen()), cache = new Map();
  const board = {tree};
  const expected = [{cpWhite:25}, {}, {cpWhite:-180}, {mate:3}, {mate:0}];
  const paths = [];
  for (const [i,san] of ['e4','e5','Nf3','Nc6','Bb5'].entries()) {
    const move = chess.move(san);
    const node = tree.addNode({uci:move.from+move.to, san, fen:chess.fen()}, tree.currentPath);
    tree.currentPath = node.path; paths.push(node.path);
    cache.set(chess.fen(), expected[i]);
  }
  const fen = chess.fen(), cursor = tree.currentPath;
  const graph = studyGraphForBoard(board, cache, true, true);
  assert.deepEqual(graph.points.map(p=>p.value), pliesToSeries(expected).pts);
  assert.deepEqual(graph.points.map(p=>p.path), paths);
  assert.deepEqual(graph.points.map(p=>p.label), ['1. e4','1… e5','2. Nf3','2… Nc6','3. Bb5']);
  assert.equal(graph.cursorPath, cursor);
  assert.equal(tree.currentPath, cursor);
  assert.equal(chess.fen(), fen);
  tree.currentPath = paths[1];
  assert.equal(studyGraphForBoard(board, cache, true, true).cursorPath, paths[1]);
  assert.equal(studyGraphForBoard(board, cache, false, true).points.length, 0);
  const practice = studyGraphForBoard(board, cache, true, false);
  assert.equal(practice.visible, false);
  assert.equal(practice.points.length, 0, 'Preserve the existing practice-game restriction');
});
