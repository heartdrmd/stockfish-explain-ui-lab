// Own-game renderers share BoardController. Watch owns a separate display and analysis worker.
import { frameUpdate } from './resize-observer.js';
import { readClockControl } from './generated/clock-control.js';
import { isClockStyle } from './generated/clock-styles.js';
export function lastMoveFor3D(board) {
  // Interaction locks and transient cg.set calls may clear Chessground's mark.
  // The node at the displayed FEN is the durable source of the last move.
  const node = board.tree?.nodeAtPath(board.tree.currentPath);
  if (node?.fen === board.fen()) return node.uci ? [node.uci.slice(0, 2), node.uci.slice(2, 4)] : [];
  const last = board.chess.history({ verbose: true }).at(-1);
  return last ? [last.from, last.to] : [];
}

export function movesFor3D(board) {
  if (!board.tree) return [];
  const current = board.tree.currentPath;
  let path = '';
  // Keep the continuation visible when stepping backward through a line.
  const line = (board.livePath || '').startsWith(current) ? board.livePath : current;
  const result = [{ path: '', label: 'Start', current: current === '' }];
  for (const node of board.tree.nodesAlong(line || '')) {
    path += node.id;
    const before = board.tree.nodeAtPath(path.slice(0, -2)).fen.split(' ');
    result.push({ path, label: `${before[5]}${before[1] === 'b' ? '…' : '.'} ${node.san}`, current: path === current });
  }
  return result;
}

export function canAccept3DMove(board, request) {
  if (!request || request.fen !== board.fen() || board.interactionLocked ||
      !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(request.uci || '')) return false;
  const turn = board.chess.turn() === 'w' ? 'white' : 'black';
  const movable = board.cg.state.movable.color;
  if (movable !== 'both' && movable !== turn) return false;
  if (['white', 'black'].includes(board.playerColor) && board.playerColor !== turn) return false;
  return board.chess.moves({verbose: true}).some(m =>
    m.from + m.to + (m.promotion || '') === request.uci);
}

export function install3DBoard(board) {
  const area = board.rootEl.parentElement;
  const nav = area.querySelector('.board-nav');
  const frame = document.createElement('iframe');
  frame.id = 'zagreb-board';
  frame.className = 'board-3d-frame';
  frame.title = 'Interactive 3D practice board';
  frame.allow = 'fullscreen';
  frame.hidden = true;
  area.insertBefore(frame, board.rootEl);
  const toggle = document.createElement('button');
  toggle.className = 'nav-btn board-render-toggle';
  toggle.type = 'button';
  toggle.textContent = '3D board';
  toggle.setAttribute('aria-pressed', 'false');
  toggle.title = 'Switch between 2D and 3D without changing your game';
  nav.prepend(toggle);
  const restart = document.createElement('button');
  restart.type = 'button'; restart.className = 'nav-btn board-restart-opening';
  restart.textContent = '↻ Opening';
  restart.title = 'Restart the same practice opening';
  restart.setAttribute('aria-label', 'Restart practice opening');
  nav.append(restart);
  // Visibility is presentation only. Keep notation mounted and leave cg.lastMove
  // intact so hiding the list cannot erase last-move square highlights.
  const movesWrap = document.querySelector('.move-list-wrap');
  const movesToggle = document.createElement('button');
  movesToggle.type = 'button'; movesToggle.className = 'nav-btn';
  movesToggle.id = 'board-moves-toggle';
  nav.append(movesToggle);
  const movesKey = 'stockfish-explain.moves-hidden';
  let movesHidden = false;
  try { movesHidden = localStorage.getItem(movesKey) === '1'; } catch {}
  function applyMoves() {
    movesWrap?.classList.toggle('notation-hidden', movesHidden);
    const label = movesHidden ? 'Show moves' : 'Hide moves';
    movesToggle.textContent = 'Moves';
    movesToggle.setAttribute('aria-label', label);
    movesToggle.setAttribute('aria-pressed', String(!movesHidden));
    movesToggle.title = label;
  }
  applyMoves();
  movesToggle.addEventListener('click', () => {
    movesHidden = !movesHidden; applyMoves();
    try { localStorage.setItem(movesKey, movesHidden ? '1' : '0'); } catch {}
    syncOverlay();
  });
  const gauge = document.getElementById('gauge-black');
  const gaugeControl = document.getElementById('eval-gauge-control');
  let enabled = false, ready = false, busy = false, scheduled = false, lastState = '', lastOverlay = '';
  let viewRevision = 0;
  let clockStyleReady = false, pendingClockStyle = null;
  const watchButton = document.getElementById('btn-watch');
  let returnToNative = false;
  function leaveWatch(notify = true) {
    board.setWatchMode?.(false);
    document.body.classList.remove('watch-mode');
    watchButton?.setAttribute('aria-pressed', 'false');
    if (notify) frame.contentWindow?.postMessage({type:'zagreb:watch-stop'}, location.origin);
    sync(true);
    if (returnToNative) { returnToNative = false; setEnabled(false); }
  }
  watchButton?.addEventListener('click', () => {
    if (!ready) return;
    const flat = !enabled;
    if (flat) { returnToNative = true; setEnabled(true); }
    frame.contentWindow.postMessage({type:'zagreb:watch-menu',flat}, location.origin);
  });
  for (const event of ['move','nav','undo','new-game']) board.addEventListener(event, () => {
    if (board.watchActive) leaveWatch();
  });
  frame.addEventListener('load', () => { if (board.watchActive) leaveWatch(); });
  const sendClockStyle = () => {
    if (clockStyleReady && pendingClockStyle) frame.contentWindow.postMessage({
      type: 'zagreb:clock-style', style: pendingClockStyle,
    }, location.origin);
  };
  board.addEventListener('clock-appearance-request', event => {
    if (!isClockStyle(event.detail)) return;
    pendingClockStyle = event.detail;
    sendClockStyle();
  });
  const flatMoveButton = document.getElementById('btn-move-flat-board');
  let inlineFlat=false, backdrop='#151c1a';
  const setFlatMoveMode = value => {
    board.flatMoveMode=value;
    flatMoveButton?.setAttribute('aria-pressed',String(value));
    frame.contentWindow.postMessage({type:'zagreb:flat-move-mode',enabled:value},location.origin);
  };
  flatMoveButton?.addEventListener('click',()=>setFlatMoveMode(!board.flatMoveMode));
  board.addEventListener('flat-layout-patch',event=>{
    if(ready)frame.contentWindow.postMessage({type:'zagreb:flat-layout-patch',...event.detail},location.origin);
  });
  const controlsToggle = document.getElementById('btn-toggle-board-controls');
  let controlsVisible = true, controlsReady = false;
  function syncControlsToggle() {
    if (!controlsToggle) return;
    controlsToggle.hidden = !enabled;
    controlsToggle.disabled = !controlsReady;
    const label = controlsVisible ? 'Hide board controls' : 'Show board controls';
    controlsToggle.setAttribute('aria-label', label);
    controlsToggle.setAttribute('aria-pressed', String(controlsVisible));
    controlsToggle.title = label;
  }
  controlsToggle?.addEventListener('click', () => {
    if (!enabled || !controlsReady) return;
    controlsVisible = !controlsVisible;
    syncControlsToggle();
    frame.contentWindow.postMessage({type:'zagreb:board-controls', visible:controlsVisible}, location.origin);
  });
  const clockToggle = document.getElementById('btn-toggle-clock');
  let clockVisible = false, clockAvailable = false, clockToggleReady = false;
  function syncClockToggle() {
    if (!clockToggle) return;
    const shown = clockVisible && clockAvailable;
    clockToggle.disabled = !clockToggleReady;
    const label = shown ? 'Hide clock' : 'Show upper-right clock';
    clockToggle.setAttribute('aria-label', label);
    clockToggle.setAttribute('aria-pressed', String(shown));
    clockToggle.title = label;
  }
  clockToggle?.addEventListener('click', () => {
    if (!clockToggleReady) return;
    const visible = !(clockVisible && clockAvailable);
    // Only visibility changes here. The shared game timer remains untouched.
    frame.contentWindow.postMessage({type:'zagreb:clock-visibility', visible}, location.origin);
  });
  window.addEventListener('keydown', event => {
    if (!enabled || !ready || !event.shiftKey || event.ctrlKey || event.metaKey ||
        event.target.closest?.('input,textarea,select,[contenteditable=true],[role=dialog],.game-clock,.clock-view-panel,#practice-clock,#clock-top-controls')) return;
    const direction = {ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,1],ArrowDown:[0,-1]}[event.key];
    if (!direction) return;
    event.preventDefault(); event.stopImmediatePropagation();
    frame.contentWindow.postMessage({type:'zagreb:pan-board',horizontal:direction[0],depth:direction[1]}, location.origin);
  }, true);
  function syncClock() {
    if (ready) frame.contentWindow.postMessage({ type: 'zagreb:clock', ...board.studyClock }, location.origin);
  }
  board.addEventListener('clock-change', syncClock);
  function syncOverlay(force = false) {
    if (!ready || !enabled) return;
    let score;
    try { score = JSON.parse(gauge?.dataset.evaluation || 'null'); } catch {}
    const overlay = {
      type: 'zagreb:overlay', fen: board.fen(),
      // A new board position must never inherit the old position's score.
      evaluation: score?.fen === board.fen() ? score.evaluation : null,
      evaluationVisible: !gaugeControl?.classList.contains('eval-gauge-hidden'),
      movesVisible: !movesHidden,
      graph: board.studyGraph,
      analysis: board.studyAnalysis,
      moves: movesFor3D(board),
    };
    const serialized = JSON.stringify(overlay);
    if (force || serialized !== lastOverlay) {
      frame.contentWindow.postMessage(overlay, location.origin);
      lastOverlay = serialized;
    }
  }
  if (gauge) new MutationObserver(() => syncOverlay()).observe(gauge, {attributes: true, attributeFilter: ['data-evaluation']});
  board.addEventListener('graph-change', () => syncOverlay());
  board.addEventListener('analysis-change', () => syncOverlay());
  if (gaugeControl) new MutationObserver(() => syncOverlay()).observe(gaugeControl, {attributes: true, attributeFilter: ['class']});
  function snapshot() {
    const cg = board.cg.state;
    const turn = board.chess.turn() === 'w' ? 'White' : 'Black';
    const isThinking = document.body.classList.contains('practice-thinking');
    return {
      type: 'zagreb:position', fen: board.fen(),
      orientation: cg.orientation || board.orientation,
      viewRevision,
      movable: board.interactionLocked || window.__practiceStarting ? 'none' : cg.movable.color || 'none',
      lastMove: lastMoveFor3D(board),
      status: board.interactionLocked ? 'Preparing position…' : isThinking ? 'Computer is thinking…' :
        board.chess.isCheckmate() ? 'Checkmate' : board.chess.isDraw() ? 'Draw' :
          `${turn} to move${board.chess.inCheck() ? ' · check' : ''}`,
    };
  }
  function sync(force = false) {
    if (!ready) return;
    const state = snapshot();
    const serialized = JSON.stringify(state);
    if (force || serialized !== lastState) {
      frame.contentWindow.postMessage(state, location.origin);
      lastState = serialized;
    }
    syncOverlay(force);
    if (force) syncClock();
  }
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => { scheduled = false; sync(); });
  }
  // Every BoardController path already commits its final visual state through
  // cg.set, including opening setup, archive load, variation navigation, and locks.
  const originalSet = board.cg.set.bind(board.cg);
  board.cg.set = config => { const result = originalSet(config); schedule(); return result; };
  for (const event of ['move', 'nav', 'undo', 'new-game', 'orientation-change', 'tree-changed'])
    board.addEventListener(event, schedule);
  new MutationObserver(schedule).observe(document.body, {attributes: true, attributeFilter: ['class', 'data-practice-color']});
  function sizeFrame() {
    const navWidth = `${board.rootEl.offsetWidth}px`;
    if (nav.style.width !== navWidth) nav.style.width = navWidth;
    if (!enabled) return;
    const width = `${board.rootEl.offsetWidth}px`, height = `${board.rootEl.offsetHeight}px`;
    if (frame.style.width !== width) frame.style.width = width;
    if (frame.style.height !== height) frame.style.height = height;
  }
  const scheduleFrameSize = frameUpdate(sizeFrame);
  new ResizeObserver(scheduleFrameSize).observe(board.rootEl);
  function setEnabled(value) {
    if (value && !enabled) viewRevision++;
    enabled = value;
    frame.hidden = !enabled;
    board.rootEl.style.visibility = enabled ? 'hidden' : '';
    board.rootEl.inert = enabled;
    area.classList.toggle('using-3d', enabled);
    if(flatMoveButton)flatMoveButton.hidden=enabled&&!inlineFlat;
    area.closest?.('.uniboard')?.style.setProperty?.('--board-surround',enabled?backdrop:'#151c1a');
    toggle.setAttribute('aria-pressed', String(enabled));
    toggle.textContent = enabled ? '2D board' : '3D board';
    syncControlsToggle();
    if (enabled && !frame.src) frame.src = '/zagreb/?embed=1';
    scheduleFrameSize(); sync(true);
  }
  toggle.addEventListener('click', () => { if (board.watchActive) leaveWatch(); else setEnabled(!enabled); });
  const fullscreenButton = document.getElementById('btn-board-fullscreen');
  let fullscreenFromNative = false;
  fullscreenButton?.addEventListener('click', () => {
    if (!ready) return;
    fullscreenFromNative = !enabled;
    setEnabled(true);
    frame.contentWindow.postMessage({type:'zagreb:fullscreen-view', ...(fullscreenFromNative ? {flat:true} : {})}, location.origin);
    const shell = frame.contentDocument?.querySelector('.fullscreen-shell');
    shell?.requestFullscreen?.().catch(() => {});
  });
  document.addEventListener?.('fullscreenchange', () => {
    if (!document.fullscreenElement && fullscreenFromNative) { fullscreenFromNative=false; setEnabled(false); }
  });
  const restartOpening = () => {
    if (window.__practiceStarting || board.interactionLocked) return;
    document.getElementById('btn-practice-again')?.click();
  };
  restart.addEventListener('click', restartOpening);
  function syncAccount() {
    if (window.__boardAccountReady && frame.contentWindow) frame.contentWindow.postMessage({ type: 'zagreb:account', user: window.__currentUser || null }, location.origin);
  }
  window.addEventListener('chess:account-change', syncAccount);
  window.addEventListener('message', async event => {
    if (event.origin !== location.origin || event.source !== frame.contentWindow) return;
    if (event.data?.type === 'zagreb:backdrop') {
      if(!/^#[0-9a-f]{6}$/i.test(event.data.color||''))return;
      backdrop=event.data.color;
      if(enabled)area.closest?.('.uniboard')?.style.setProperty?.('--board-surround',backdrop);return;
    }
    if(event.data?.type==='zagreb:flat-layout-state'){
      const {flatPan,flatPanY=0,flatScale}=event.data;
      if(!Number.isFinite(flatPan)||flatPan < -50||flatPan > 50||!Number.isFinite(flatPanY)||flatPanY < -50||flatPanY > 50||!Number.isFinite(flatScale)||flatScale<35||flatScale>100)return;
      board.restoreFlatLayout?.({flatPan,flatPanY,flatScale});return;
    }
    if(event.data?.type==='zagreb:flat-mode-state'){
      if(typeof event.data.flat!=='boolean')return;
      inlineFlat=event.data.flat;
      document.body.classList.toggle('inline-flat-board',inlineFlat);
      if(flatMoveButton)flatMoveButton.hidden=enabled&&!inlineFlat;return;
    }
    if(event.data?.type==='zagreb:flat-move-mode'){
      if(typeof event.data.enabled==='boolean')setFlatMoveMode(event.data.enabled);return;
    }
    if (event.data?.type === 'zagreb:move-navigation-ready') {
      area.classList.add('inner-navigation-ready'); return;
    }
    if (event.data?.type === 'zagreb:watch-active') {
      const {active,requestId}=event.data;
      if (typeof active !== 'boolean' || typeof requestId !== 'string' || requestId.length > 80) return;
      try {
        if (active) {
          if (busy || typeof board.setWatchMode !== 'function') throw Error('Your game is still getting ready. Try Watch again in a moment.');
          board.setWatchMode(true);
          document.body.classList.add('watch-mode');
          watchButton?.setAttribute('aria-pressed','true');
        } else leaveWatch(false);
        frame.contentWindow.postMessage({type:'zagreb:watch-result',requestId,ok:true},location.origin);
      } catch(error) {
        frame.contentWindow.postMessage({type:'zagreb:watch-result',requestId,ok:false,error:error.message},location.origin);
      }
      return;
    }
    if (board.watchActive && ['zagreb:move','zagreb:restart','zagreb:navigate','zagreb:analysis','zagreb:flip',
      'zagreb:clock-hardware','zagreb:clock-hardware-model','zagreb:clock-pause','zagreb:clock-control','zagreb:clock-add','zagreb:clock-design'].includes(event.data?.type)) return;
    if (event.data?.type === 'zagreb:board-controls-state') {
      if (typeof event.data.visible !== 'boolean' || typeof event.data.ready !== 'boolean') return;
      controlsVisible = event.data.visible; controlsReady = event.data.ready;
      syncControlsToggle();
      return;
    }
    if (event.data?.type === 'zagreb:account-ready') { syncAccount(); return; }
    if (event.data?.type === 'zagreb:ready') { ready = true; if(fullscreenButton)fullscreenButton.disabled=false; if(watchButton)watchButton.disabled=false; sync(true); return; }
    if (event.data?.type === 'zagreb:clock-hardware-model') {
      board.setClockHardwareModel?.(event.data.family); return;
    }
    if (event.data?.type === 'zagreb:clock-hardware') {
      board.clockHardwareInput?.(event.data.key,event.data.phase); return;
    }
    if (event.data?.type === 'zagreb:clock-style-state') {
      if (!isClockStyle(event.data.style)) return;
      clockStyleReady = true;
      if (pendingClockStyle && pendingClockStyle !== event.data.style) { sendClockStyle(); return; }
      pendingClockStyle = null;
      board.clockAppearance = event.data.style;
      board.dispatchEvent(new Event('clock-appearance-state'));
      return;
    }
    if (event.data?.type === 'zagreb:clock-visibility-state') {
      const {visible, available, ready: toggleReady} = event.data;
      if (typeof visible !== 'boolean' || typeof available !== 'boolean' || typeof toggleReady !== 'boolean') return;
      clockVisible = visible; clockAvailable = available; clockToggleReady = toggleReady;
      document.body.classList.toggle('clock-presentation-hidden', !visible);
      syncClockToggle();
      return;
    }
    if (event.data?.type === 'zagreb:clock-dock') {
      board.setClockDock?.(event.data.placement); return;
    }
    if (event.data?.type === 'zagreb:clock-design') {
      // An explicit preset selection supersedes an older dropdown request.
      if (isClockStyle(event.data.style)) pendingClockStyle = null;
      board.dispatchEvent(new CustomEvent('clock-design-request', { detail: event.data.style }));
      return;
    }
    if (event.data?.type === 'zagreb:analysis') {
      if (busy) return;
      board.requestAnalysis?.(event.data);
      syncOverlay();
      return;
    }
    if (event.data?.type === 'zagreb:clock-pause') {
      board.dispatchEvent(new Event('clock-pause-request'));
      return;
    }
    // The clock remains usable in the parent pane when native 2D hides this frame.
    if (event.data?.type === 'zagreb:clock-control' || event.data?.type === 'zagreb:clock-add') {
      const { requestId } = event.data;
      if (typeof requestId !== 'string' || !requestId.length || requestId.length > 80) return;
      try {
        if (event.data.type === 'zagreb:clock-add') {
          if (typeof board.addUntimedClock !== 'function') throw new Error('The game clock is not ready.');
          board.addUntimedClock();
        } else {
          const control = readClockControl(event.data.control);
          if (!control) throw new Error('Use 1–999 whole minutes and 0–60 seconds increment.');
          if (typeof board.setClockTimeControl !== 'function') throw new Error('The game clock is not ready.');
          board.setClockTimeControl(control);
        }
        syncClock();
        frame.contentWindow.postMessage({type: 'zagreb:clock-control-result', requestId, ok: true}, location.origin);
      } catch (error) {
        frame.contentWindow.postMessage({type: 'zagreb:clock-control-result', requestId, ok: false,
          error: error instanceof Error ? error.message : 'The clock could not be updated.'}, location.origin);
      }
      return;
    }
    if (!enabled) return;
    if (event.data?.type === 'zagreb:flip') {
      const orientation = event.data.orientation;
      if (!['white', 'black'].includes(orientation)) return;
      if (board.cg.state.orientation !== orientation) board.flipBoard();
      sync(true);
      return;
    }
    if (event.data?.type === 'zagreb:visibility') {
      if (typeof event.data.visible !== 'boolean') return;
      if (event.data.control === 'graph' && board.studyGraph?.enabled &&
          event.data.visible !== board.studyGraph.visible)
        document.getElementById('btn-live-graph')?.click();
      if (event.data.control === 'moves' && event.data.visible === movesHidden) movesToggle.click();
      if (event.data.control === 'evaluation' && event.data.visible === gaugeControl?.classList.contains('eval-gauge-hidden'))
        document.getElementById('eval-gauge-toggle')?.click();
      syncOverlay();
      return;
    }
    if (event.data?.type === 'zagreb:restart') { restartOpening(); return; }
    if (event.data?.type === 'zagreb:navigate') {
      if (busy || board.interactionLocked || window.__practiceStarting) return;
      const path = event.data.path;
      if (typeof path === 'string' && (movesFor3D(board).some(move => move.path === path) ||
          (board.studyGraph?.visible && board.studyGraph.enabled && board.studyGraph.points.some(point => point.path === path)))) board.goToPath(path);
      return;
    }
    if (event.data?.type !== 'zagreb:move') return;
    if (busy || window.__practiceStarting || !canAccept3DMove(board, event.data)) { sync(true); return; }
    busy = true;
    try {
      const uci = event.data.uci;
      await board._onUserMove(uci.slice(0, 2), uci.slice(2, 4), {via: '3d-board', promotion: uci[4]});
    } finally { busy = false; sync(true); }
  });
  // Start the viewer after its bridge is listening. It restores the complete
  // last-used appearance and camera automatically from its saved preferences.
  // The viewer also restores whether the last board was 2D or 3D.
  setEnabled(true);
}
