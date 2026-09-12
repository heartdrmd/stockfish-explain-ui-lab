import test from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from '../vendor/chess.js/chess.js';
import { studyAnalysisState, handleStudyAnalysisRequest } from '../src/board-analysis.js';

function setup() {
  const chess=new Chess(), played=[], calls=[];
  const board={chess,fen:()=>chess.fen(),isAtLive:()=>true,playEngineMove:uci=>played.push(uci)};
  const context={engine:{ready:true,currentFen:chess.fen(),topMoves:new Map([
    [2,{multipv:2,depth:18,score:15,scoreKind:'cp',pv:['d2d4','d7d5']}],
    [1,{multipv:1,depth:19,score:30,scoreKind:'cp',pv:['e2e4','e7e5']}],
    [3,{multipv:3,depth:18,score:10,scoreKind:'cp',pv:['g1f3','d7d5']}],
  ])},practice:false,player:'w',lineCount:3,hintTimes:[{value:3000,label:'3 seconds'},{value:10000,label:'10 seconds'}]};
  const controls=Object.fromEntries(['toggle','lines','hintTime','hint','cancelHint'].map(key=>[key,value=>calls.push([key,value])]));
  const request=(action,value,fen=chess.fen())=>handleStudyAnalysisRequest(board,{action,value,fen},context,controls);
  return {chess,board,context,played,calls,request};
}
test('fullscreen analysis uses legal, ordered lines at exactly the displayed position',()=>{
  const s=setup();
  assert.deepEqual(studyAnalysisState(s.board,s.context).lines.map(l=>l.pv),['e4 e5','d4 d5','Nf3 d5']);
  assert.equal(s.request('play-best'),true);
  assert.equal(s.request('play-line',1),true);
  assert.deepEqual(s.played,['e2e4','d2d4']);
  assert.equal(s.request('play-line',3),false);
  assert.equal(s.request('play-best',undefined,'old position'),false);
  s.chess.move('e4');
  assert.deepEqual(studyAnalysisState(s.board,s.context).lines,[]);
  assert.equal(s.request('play-best'),false);
  s.context.engine.currentFen=s.chess.fen();
  s.context.engine.topMoves=new Map([[1,{multipv:1,score:30,scoreKind:'cp',pv:['e7e5']}]]);
  assert.equal(studyAnalysisState(s.board,s.context).lines[0].score,'-0.30');
  assert.equal(s.request('play-best'),true);
});
test('practice shares only explicit hints and preserves opponent engine ownership',()=>{
  const s=setup();s.context.practice=true;
  assert.deepEqual(studyAnalysisState(s.board,s.context).lines,[]);
  for(const [action,value] of [['toggle-engine'],['lines',3],['play-best'],['play-line',0]]) assert.equal(s.request(action,value),false);
  assert.equal(s.request('hint-time',10000),true);
  assert.deepEqual(s.calls,[['hintTime',10000]],'Changing time does not launch a search');
  assert.equal(s.request('hint',10000),true);
  assert.equal(s.request('hint',1234),false);
  s.context.hintRunning=true;
  assert.equal(s.request('hint',3000),false);
  assert.equal(s.request('hint-time',3000),false);
  assert.equal(s.request('cancel-hint'),true);
  s.context.hintRunning=false;
  s.context.hint={fen:s.chess.fen(),lines:[{uci:'e2e4',san:'e4',pvSan:'e4 e5',evalText:'+0.30'}]};
  assert.equal(studyAnalysisState(s.board,s.context).lines.length,1);
  s.board.isAtLive=()=>false;
  assert.equal(s.request('hint',3000),false);
  assert.deepEqual(studyAnalysisState(s.board,s.context).lines,[]);
  s.board.isAtLive=()=>true;s.chess.move('e4');
  assert.equal(s.request('hint',3000),false,'No hint search during the computer turn');
});
test('lesson, recovery, transitions and game over prevent unsafe engine actions',()=>{
  for(const flag of ['lesson','recovering','busy']) {
    const s=setup();s.context[flag]=true;
    for(const [action,value] of [['toggle-engine'],['lines',3],['play-best']]) assert.equal(s.request(action,value),false,flag);
    s.context.practice=true;assert.equal(s.request('hint',3000),false,flag);
  }
  const s=setup();
  assert.equal(s.request('toggle-engine'),true);
  s.context.paused=true;assert.equal(studyAnalysisState(s.board,s.context).engineOn,false);
  assert.equal(s.request('toggle-engine'),true);
  assert.equal(s.request('lines',2),true);
  assert.equal(s.request('lines',4),false);
  assert.deepEqual(s.calls,[['toggle',undefined],['toggle',undefined],['lines',2]]);
  s.context.threat=true;assert.deepEqual(studyAnalysisState(s.board,s.context).lines,[]);
  s.chess.load('7k/8/6K1/8/8/8/8/8 w - - 0 1');s.context.practice=true;
  assert.equal(s.request('hint',3000),false);
});
