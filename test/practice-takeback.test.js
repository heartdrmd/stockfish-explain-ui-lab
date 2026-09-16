import test from 'node:test';
import assert from 'node:assert/strict';
import { BoardController } from '../src/board.js';
import { practiceTakebackCount } from '../src/practice-takeback.js';
import { canAccept3DMove } from '../src/board-3d.js';

function board() {
  const b = new BoardController({classList:{toggle(){}}});
  b.cg = {state:{movable:{}},cancelMove(){},set(config){
    for(const [key,value] of Object.entries(config)) this.state[key]=value;
  }};
  return b;
}
function play(b, san) {
  const move=b.chess.move(san);
  b.tree.currentPath=b.tree.addNode({uci:move.from+move.to,san,fen:b.fen()},b.tree.currentPath).path;
  b.livePath=b.tree.currentPath;
}
for (const [color,moves,opening,expected] of [
  ['white',['e4'],0,1], ['white',['e4','e5'],0,2],
  ['black',['e4'],0,0], ['black',['e4','e5'],0,1],
  ['black',['e4','e5','Nf3'],0,2],
  ['white',['e4','e5'],2,0], ['white',['e4','e5','Nf3','Nc6'],2,2],
]) test(`takeback ${color}: ${moves.join(' ')} with ${opening} opening plies`,()=>{
  const b=board(); moves.forEach(san=>play(b,san)); b.playerColor=color;
  const count=practiceTakebackCount(b.chess.history({verbose:true}),color,opening);
  assert.equal(count,expected);
  for(let i=0;i<count;i++) assert.ok(b.undo({prune:true}));
  assert.equal(b.chess.history().length,moves.length-count);
  assert.equal(b.tree.mainlineNodes().length,moves.length-count,'Retracted computer reply cannot remain the mainline');
  if(count) assert.equal(b.chess.turn(),color[0]);
});
test('post-game analysis unlocks both sides without replacing the position or archive',()=>{
  const b=board(); play(b,'e4');
  const before=b.fen(),tree=b.tree;
  const archive=Object.freeze({moves:['e4'],result:'0-1'}); b._archiveSnapshot=archive;
  b.playerColor='white'; b.setInteractionLocked(true);
  assert.equal(canAccept3DMove(b,{fen:before,uci:'e7e5'}),false);
  let ready=0;b.addEventListener('analysis-ready',()=>ready++);
  b.enterFreeAnalysis();
  assert.equal(ready,1);assert.equal(b.fen(),before);assert.equal(b.tree,tree);
  assert.equal(b._archiveSnapshot,archive);
  assert.equal(b.cg.state.draggable.enabled,true);assert.equal(b.cg.state.selectable.enabled,true);
  assert.ok(canAccept3DMove(b,{fen:b.fen(),uci:'e7e5'}),'Black can play after White resigned');
  play(b,'e5'); b._syncToChessground();
  assert.ok(canAccept3DMove(b,{fen:b.fen(),uci:'g1f3'}),'White can continue the analysis');
  assert.equal(canAccept3DMove(b,{fen:b.fen(),uci:'b8c6'}),false,'Analysis still alternates legal turns');
  assert.deepEqual(archive.moves,['e4']);
});
