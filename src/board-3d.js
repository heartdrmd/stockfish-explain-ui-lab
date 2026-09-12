// Both renderers share BoardController. The iframe never owns a game or engine.
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
  let enabled = false, ready = false, busy = false, scheduled = false, lastState = '';
  function snapshot() {
    const cg = board.cg.state;
    const turn = board.chess.turn() === 'w' ? 'White' : 'Black';
    const isThinking = document.body.classList.contains('practice-thinking');
    return {
      type: 'zagreb:position', fen: board.fen(),
      orientation: cg.orientation || board.orientation,
      movable: board.interactionLocked || window.__practiceStarting ? 'none' : cg.movable.color || 'none',
      lastMove: cg.lastMove || [],
      status: board.interactionLocked ? 'Preparing position…' : isThinking ? 'Computer is thinking…' :
        board.chess.isCheckmate() ? 'Checkmate' : board.chess.isDraw() ? 'Draw' :
          `${turn} to move${board.chess.inCheck() ? ' · check' : ''}`,
    };
  }
  function sync(force = false) {
    if (!ready || !enabled) return;
    const state = snapshot();
    const serialized = JSON.stringify(state);
    if (force || serialized !== lastState) {
      frame.contentWindow.postMessage(state, location.origin);
      lastState = serialized;
    }
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
    frame.style.width = `${board.rootEl.offsetWidth}px`;
    frame.style.height = `${board.rootEl.offsetHeight}px`;
  }
  new ResizeObserver(sizeFrame).observe(board.rootEl);
  toggle.addEventListener('click', () => {
    enabled = !enabled;
    frame.hidden = !enabled;
    board.rootEl.style.visibility = enabled ? 'hidden' : '';
    board.rootEl.inert = enabled;
    area.classList.toggle('using-3d', enabled);
    toggle.setAttribute('aria-pressed', String(enabled));
    toggle.textContent = enabled ? '2D board' : '3D board';
    if (enabled && !frame.src) frame.src = '/zagreb/?embed=1';
    sizeFrame(); sync(true);
  });
  const restartOpening = () => {
    if (window.__practiceStarting || board.interactionLocked) return;
    document.getElementById('btn-practice-again')?.click();
  };
  restart.addEventListener('click', restartOpening);
  window.addEventListener('message', async event => {
    if (event.origin !== location.origin || event.source !== frame.contentWindow || !enabled) return;
    if (event.data?.type === 'zagreb:ready') { ready = true; sync(true); return; }
    if (event.data?.type === 'zagreb:restart') { restartOpening(); return; }
    if (event.data?.type !== 'zagreb:move') return;
    if (busy || window.__practiceStarting || !canAccept3DMove(board, event.data)) { sync(true); return; }
    busy = true;
    try {
      const uci = event.data.uci;
      await board._onUserMove(uci.slice(0, 2), uci.slice(2, 4), {via: '3d-board', promotion: uci[4]});
    } finally { busy = false; sync(true); }
  });
}
