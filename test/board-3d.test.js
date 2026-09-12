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
