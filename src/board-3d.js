// Both renderers share BoardController. The iframe never owns a game or engine.
import { frameUpdate } from './resize-observer.js';
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
      moves: movesFor3D(board),
    };
    const serialized = JSON.stringify(overlay);
    if (force || serialized !== lastOverlay) {
      frame.contentWindow.postMessage(overlay, location.origin);
      lastOverlay = serialized;
    }
  }
  if (gauge) new MutationObserver(() => syncOverlay()).observe(gauge, {attributes: true, attributeFilter: ['data-evaluation']});
  if (gaugeControl) new MutationObserver(() => syncOverlay()).observe(gaugeControl, {attributes: true, attributeFilter: ['class']});
  function snapshot() {
    const cg = board.cg.state;
    const turn = board.chess.turn() === 'w' ? 'White' : 'Black';
    const isThinking = document.body.classList.contains('practice-thinking');
    return {
      type: 'zagreb:position', fen: board.fen(),
      orientation: cg.orientation || board.orientation,
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
    if (!enabled) return;
    const width = `${board.rootEl.offsetWidth}px`, height = `${board.rootEl.offsetHeight}px`;
    if (frame.style.width !== width) frame.style.width = width;
    if (frame.style.height !== height) frame.style.height = height;
  }
  const scheduleFrameSize = frameUpdate(sizeFrame);
  new ResizeObserver(scheduleFrameSize).observe(board.rootEl);
  function setEnabled(value) {
    enabled = value;
    frame.hidden = !enabled;
    board.rootEl.style.visibility = enabled ? 'hidden' : '';
    board.rootEl.inert = enabled;
    area.classList.toggle('using-3d', enabled);
    toggle.setAttribute('aria-pressed', String(enabled));
    toggle.textContent = enabled ? '2D board' : '3D board';
    if (enabled && !frame.src) frame.src = '/zagreb/?embed=1';
    scheduleFrameSize(); sync(true);
  }
  toggle.addEventListener('click', () => setEnabled(!enabled));
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
    if (event.data?.type === 'zagreb:account-ready') { syncAccount(); return; }
    if (event.data?.type === 'zagreb:ready') { ready = true; sync(true); return; }
    if (event.data?.type === 'zagreb:clock-design') {
      board.dispatchEvent(new Event('clock-design-request'));
      return;
    }
    if (event.data?.type === 'zagreb:clock-pause') {
      board.dispatchEvent(new Event('clock-pause-request'));
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
      if (typeof path === 'string' && movesFor3D(board).some(move => move.path === path)) board.goToPath(path);
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
  // Switching to 2D is temporary; the next visit always opens in 3D.
  setEnabled(true);
}
