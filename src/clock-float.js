// Position only: keep the same clock element and its existing game timer.
export function installFloatingClock(card, host) {
  const grip = document.getElementById('clock-float-drag');
  const panel = host.closest?.('.tools');
  if (!grip || !panel) return;
  const key = 'stockfish-explain.floating-clock-position';
  let toolsPin = 0;
  let offset = { x: 0, y: 0 }, drag = null, frame = 0, moveMode = false, skipClick = false;
  try {
    const saved = JSON.parse(localStorage.getItem(key));
    if (Number.isFinite(saved?.x) && Number.isFinite(saved?.y)) offset = saved;
  } catch {}
  const active = () => window.innerWidth >= 800 && !card.hidden &&
    !document.body.classList.contains('clock-presentation-hidden') &&
    document.body.classList.contains('clock-docked-right') &&
    !document.body.classList.contains('mobile-mode');
  const floating = () => document.body.classList.contains('right-pane-hidden');
  const save = () => {
    try { localStorage.setItem(key, JSON.stringify(offset)); } catch {}
  };
  function paint() {
    panel.style.setProperty('--clock-float-x', `${offset.x}px`);
    panel.style.setProperty('--clock-float-y', `${offset.y}px`);
    card.style.setProperty('--clock-dock-x',`${offset.x}px`);
    card.style.setProperty('--clock-dock-y',`${offset.y}px`);
    host.style.height = active() && !floating() ? `${Math.max(0,card.getBoundingClientRect().height+offset.y)}px` : '';
  }
  function move(x, y) {
    const rect = (floating() ? panel : card).getBoundingClientRect();
    const baseX = rect.left - offset.x, baseY = rect.top - offset.y;
    const header = document.querySelector('.site-header')?.getBoundingClientRect();
    let top = Math.max(8, (header?.bottom || 0) + 8);
    // A transparent clock canvas must never cover the embedded board toolbar.
    const boardFrame=document.getElementById('zagreb-board');
    const toolbar=boardFrame?.contentDocument?.querySelector('.viewport-actions');
    if(boardFrame && !boardFrame.hidden && toolbar){
      const f=boardFrame.getBoundingClientRect(), t=toolbar.getBoundingClientRect();
      if(baseX+x < f.left+t.right && baseX+x+rect.width > f.left+t.left)
        top=Math.max(top,f.top+t.bottom+8);
    }
    // Keep the grip and clock reachable after a resize or a settings change.
    const maxX = Math.max(8, window.innerWidth - rect.width - 8);
    const maxY = Math.max(top, window.innerHeight - rect.height - 8);
    offset = {
      x: Math.round(Math.max(8, Math.min(maxX, baseX + x)) - baseX),
      y: Math.round(Math.max(top, Math.min(maxY, baseY + y)) - baseY),
    };
    paint();
  }
  const finish = () => {
    if (!drag) return;
    const ended = drag;
    drag = null;
    if (ended.target.hasPointerCapture?.(ended.id)) ended.target.releasePointerCapture(ended.id);
    document.body.classList.remove('clock-floating-dragging');
    save();
  };
  function setMoveMode(enabled) {
    moveMode = enabled;
    grip.setAttribute('aria-pressed', String(enabled));
    grip.setAttribute('aria-label', enabled ? 'Stop moving clock' : 'Enable clock move mode');
    grip.title = enabled ? 'Move mode on · drag the clock, click here to turn off' : 'Enable Move mode · move the clock without rotating it';
    card.classList.toggle('clock-move-mode', enabled);
    if (!enabled) finish();
  }
  function schedule() {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (active()) {
        const naturalWidth = parseFloat(card.querySelector('.game-clock')?.style.width || '300');
        const width = `${Math.round(Math.max(180, Math.min(window.innerWidth * .52, naturalWidth || 300)))}px`;
        if (floating() && panel.style.getPropertyValue('--floating-clock-width') !== width)
          panel.style.setProperty('--floating-clock-width', width);
        move(offset.x, offset.y);
      }
      else {setMoveMode(false);host.style.height='';}
      const docked = window.innerWidth >= 800 && !document.body.classList.contains('mobile-mode') &&
        document.body.classList.contains('clock-docked-right') && !document.body.classList.contains('right-pane-hidden');
      const top = parseFloat(getComputedStyle(panel).top) || 0;
      const next = docked ? Math.max(0, top-(panel.getBoundingClientRect().top-toolsPin)) : 0;
      if (Math.abs(next-toolsPin)>.1) { toolsPin=next;panel.style.setProperty('--tools-pin-y',`${next}px`); }

    });
  }
  paint();
  setMoveMode(false);
  grip.addEventListener('click', () => {
    if (skipClick) { skipClick = false; return; }
    if (active()) setMoveMode(!moveMode);
  });
  card.addEventListener('pointerdown', event => {
    if (!active() || !moveMode || event.button !== 0 || drag) return;
    const target = event.target.closest?.('canvas, #clock-float-drag');
    if (!target || !card.contains(target)) return;
    // Capture before the 3D renderer: a Move-mode drag cannot also rotate or
    // press a physical clock key. Switching Move off restores normal hardware.
    event.preventDefault(); event.stopImmediatePropagation();
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, start: { ...offset }, target };
    target.setPointerCapture(event.pointerId);
    document.body.classList.add('clock-floating-dragging');
  }, true);
  card.addEventListener('pointermove', event => {
    if (!drag || event.pointerId !== drag.id) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (!active() || (event.pointerType === 'mouse' && event.buttons === 0)) { finish(); return; }
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
    if (drag.target === grip && Math.hypot(dx, dy) > 3) skipClick = true;
    move(drag.start.x + dx, drag.start.y + dy);
  }, true);
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    card.addEventListener(type, event => {
      if (event.pointerId !== drag?.id) return;
      event.stopImmediatePropagation();
      finish();
    }, true);
  }
  const reset = () => { if (active()) { move(0, 0); save(); } };
  grip.addEventListener('keydown', event => {
    if (!active() || !moveMode || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === 'Home') { event.preventDefault(); reset(); return; }
    const delta = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
    if (!delta) return;
    event.preventDefault();
    const step = event.shiftKey ? 1 : 10;
    move(offset.x + delta[0] * step, offset.y + delta[1] * step);
    save();
  });
  window.addEventListener('scroll', schedule, {passive:true});
  window.addEventListener('resize', schedule);
  window.addEventListener('blur', () => setMoveMode(false));
  document.addEventListener('fullscreenchange', schedule);
  const resize = new ResizeObserver(schedule);
  resize.observe(panel);resize.observe(card);
  new MutationObserver(schedule).observe(card, { attributes: true, attributeFilter: ['hidden'] });
  new MutationObserver(schedule).observe(card, { attributes: true, childList: true, subtree: true, attributeFilter: ['style'] });
  schedule();
}
