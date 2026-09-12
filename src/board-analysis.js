import { buildPracticeHintLines } from './practice-hint.js';

export function studyAnalysisState(board, context) {
  const { engine, practice, player, paused, locked, hint, hintRunning,
    busy, lesson, recovering, lineCount = 3, hintTimes = [], hintMs = 3000 } = context;
  const fen = board.fen();
  const ready = !!engine?.ready && !recovering && !busy;
  const canAnalyze = ready && !practice && !lesson;
  const canHint = ready && practice && !lesson && board.isAtLive() && !board.chess.isGameOver() && board.chess.turn() === player;
  const currentHint = hint?.fen === fen ? hint : null;
  const top = engine?.currentFen === fen && !context.threat
    ? Array.from(engine.topMoves?.values?.() || []).sort((a,b)=>(a.multipv||1)-(b.multipv||1)) : [];
  const count = Math.max(1, Math.min(3, Number(lineCount) || 3));
  const lines = practice
    ? (canHint && !hintRunning ? currentHint?.lines || [] : [])
    : !lesson && !busy ? buildPracticeHintLines(top, fen, count).filter(line => line.san !== line.uci && line.uci) : [];
  return {
    available: true, fen, practice: !!practice, engineOn: !paused && !locked,
    canToggle: canAnalyze, canChangeLines: canAnalyze && !hintRunning,
    canPlay: canAnalyze && !board.chess.isGameOver() && !!lines[0],
    canHint: !!canHint, hintRunning: !!hintRunning, lineCount: count, hintMs, hintTimes,
    depth: Math.max(0,...top.map(line=>Number(line.depth)||0)),
    status: busy ? 'Preparing position…' : lesson ? 'Lesson is using Stockfish.' :
      !ready ? 'Stockfish is starting…' : practice ?
        (hintRunning ? 'Calculating your top three moves…' : canHint ? currentHint?.status || 'Ask for your three best moves.' : 'Hints are available at the live position on your turn.') :
        paused || locked ? 'Stockfish paused' : context.threat ? 'Threat mode is active in the main controls.' : 'Stockfish analyzing',
    lines: lines.slice(0,3).map(line=>({uci:line.uci,san:line.san,pv:line.pvSan,score:line.evalText})),
  };
}

export function handleStudyAnalysisRequest(board, request, context, controls) {
  if (!request || request.fen !== board.fen()) return false;
  const state = studyAnalysisState(board, context);
  switch (request.action) {
    case 'toggle-engine':
      if (!state.canToggle || state.hintRunning) return false;
      controls.toggle(); break;
    case 'lines':
      if (!state.canChangeLines || ![1,2,3].includes(request.value)) return false;
      controls.lines(request.value); break;
    case 'hint-time':
      if (!state.canHint || state.hintRunning || !state.hintTimes.some(option=>option.value===request.value)) return false;
      controls.hintTime(request.value); break;
    case 'hint':
      if (!state.canHint || state.hintRunning || !state.hintTimes.some(option=>option.value===request.value)) return false;
      controls.hint(request.value); break;
    case 'cancel-hint':
      if (!state.hintRunning) return false;
      controls.cancelHint(); break;
    case 'play-best':
    case 'play-line': {
      if (!state.canPlay) return false;
      const index = request.action === 'play-best' ? 0 : request.value;
      if (!Number.isInteger(index) || index < 0 || index > 2) return false;
      const uci = state.lines[index]?.uci;
      if (!board.chess.moves({verbose:true}).some(move=>move.from+move.to+(move.promotion||'')===uci)) return false;
      board.playEngineMove(uci); break;
    }
    default: return false;
  }
  return true;
}

export function installStudyAnalysis(board, getContext, controls) {
  let frame = 0, serialized = '';
  const publish = () => {
    frame = 0;
    const state = studyAnalysisState(board,getContext());
    const json = JSON.stringify(state);
    if (json === serialized) return;
    serialized = json;
    board.studyAnalysis = state;
    board.dispatchEvent(new Event('analysis-change'));
  };
  const schedule = () => { if (!frame) frame=requestAnimationFrame(publish); };
  board.requestAnalysis = request => {
    const accepted=handleStudyAnalysisRequest(board,request,getContext(),controls);
    schedule();
    return accepted;
  };
  installAnalysisKeyboard(window, () => studyAnalysisState(board,getContext()), request => board.requestAnalysis(request));
  for (const event of ['move','nav','new-game','undo','analysis-refresh']) board.addEventListener(event,schedule);
  const wire = engine => {
    for (const event of ['thinking','bestmove','ready','error']) engine.addEventListener(event,schedule);
    schedule();
  };
  (window.__engineRewireHooks ||= []).push(wire);
  wire(getContext().engine);
  new MutationObserver(schedule).observe(document.body,{attributes:true,attributeFilter:['class']});
  for (const id of ['engine-power','btn-pause','analysis-lines-control','practice-hint-results']) {
    const node=document.getElementById(id);
    if (node) new MutationObserver(schedule).observe(node,{attributes:true,childList:true,subtree:true,characterData:true});
  }
  document.getElementById('practice-hint-time')?.addEventListener('change',schedule);
  publish();
}

export function installAnalysisKeyboard(target, getState, request) {
  target.addEventListener('keydown', event => {
    if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey ||
        event.target.closest?.('input,textarea,select,[contenteditable=true],[role=dialog]')) return;
    const action = event.key.toLowerCase() === 'l' ? 'toggle-engine' :
      event.code === 'Space' || event.key === ' ' ? 'play-best' : null;
    if (!action) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (event.repeat) return;
    const state = getState();
    if (action === 'play-best' && !state.engineOn) return;
    request({action,fen:state.fen});
  }, true);
}
