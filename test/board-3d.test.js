import test from 'node:test';
import assert from 'node:assert/strict';
import {Chess} from '../vendor/chess.js/chess.js';
import {canAccept3DMove} from '../src/board-3d.js';
function controller(fen) { const chess=new Chess(fen);return {chess,fen:()=>chess.fen(),cg:{state:{movable:{color:'both'}}},playerColor:null,interactionLocked:false}; }
test('3D moves require the current position, legal turn and unlocked parent',()=>{
  const b=controller(), request={fen:b.fen(),uci:'e2e4'};
  assert.ok(canAccept3DMove(b,request));
  assert.equal(canAccept3DMove(b,{...request,uci:'e2e5'}),false);
  assert.equal(canAccept3DMove(b,{...request,fen:'stale'}),false);
  b.interactionLocked=true;assert.equal(canAccept3DMove(b,request),false);
  b.interactionLocked=false;b.cg.state.movable.color='black';assert.equal(canAccept3DMove(b,request),false);
  b.cg.state.movable.color='both';b.playerColor='black';assert.equal(canAccept3DMove(b,request),false);
});
test('3D promotion explicitly preserves all four legal choices',()=>{
  const b=controller('7k/P7/8/8/8/8/8/7K w - - 0 1');
  for(const piece of ['q','r','b','n']) assert.ok(canAccept3DMove(b,{fen:b.fen(),uci:'a7a8'+piece}));
  assert.equal(canAccept3DMove(b,{fen:b.fen(),uci:'a7a8'}),false);
});

import { lastMoveFor3D, movesFor3D } from '../src/board-3d.js';
import { GameTree } from '../src/tree.js';
test('3D last move survives cleared renderer marks and follows history navigation', () => {
  const b = controller(); b.tree = new GameTree(b.fen());
  for (const san of ['e4', 'e5', 'Nf3']) {
    const move = b.chess.move(san);
    const added = b.tree.addNode({ uci: move.from + move.to, san, fen: b.fen() }, b.tree.currentPath);
    b.tree.currentPath = added.path;
  }
  b.livePath = b.tree.currentPath;
  b.cg.state.lastMove = undefined;
  assert.deepEqual(lastMoveFor3D(b), ['g1', 'f3']);
  const moves = movesFor3D(b);
  assert.deepEqual(moves.map(m => m.label), ['Start', '1. e4', '1… e5', '2. Nf3']);
  b.chess.undo(); b.tree.currentPath = b.tree.parentPath(b.tree.currentPath);
  assert.deepEqual(lastMoveFor3D(b), ['e7', 'e5']);
  assert.equal(movesFor3D(b).length, 4, 'Moving backward retains the continuation');
  assert.equal(movesFor3D(b)[2].current, true);
  b.chess.reset(); b.tree.currentPath = '';
  assert.deepEqual(lastMoveFor3D(b), [], 'Starting position has no stale highlight');
});
