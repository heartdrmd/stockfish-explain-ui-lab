// Position only: keep the same clock element and its existing game timer.
export function installFloatingClock(card, host) {
  const grip = document.getElementById('clock-float-drag');
  const panel = host.closest?.('.tools');
  if (!grip || !panel) return;
  const key = 'stockfish-explain.floating-clock-position';
  let offset = { x: 0, y: 0 }, drag = null, frame = 0, moveMode = false, skipClick = false;
  try {
    const saved = JSON.parse(localStorage.getItem(key));
    if (Number.isFinite(saved?.x) && Number.isFinite(saved?.y)) offset = saved;
  } catch {}
  const active = () => window.innerWidth >= 800 && !card.hidden &&
    !document.body.classList.contains('clock-presentation-hidden') &&
    document.body.classList.contains('clock-docked-right') &&
    document.body.classList.contains('right-pane-hidden') &&
    !document.body.classList.contains('mobile-mode');
  const save = () => {
    try { localStorage.setItem(key, JSON.stringify(offset)); } catch {}
  };
  function paint() {
    panel.style.setProperty('--clock-float-x', `${offset.x}px`);
    panel.style.setProperty('--clock-float-y', `${offset.y}px`);
  }
  function move(x, y) {
    const rect = panel.getBoundingClientRect();
    const baseX = rect.left - offset.x, baseY = rect.top - offset.y;
    const header = document.querySelector('.site-header')?.getBoundingClientRect();
    const top = Math.max(8, (header?.bottom || 0) + 8);
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
      if (active()) move(offset.x, offset.y);
      else setMoveMode(false);
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
  window.addEventListener('resize', schedule);
  window.addEventListener('blur', () => setMoveMode(false));
  document.addEventListener('fullscreenchange', schedule);
  new ResizeObserver(schedule).observe(panel);
  new MutationObserver(schedule).observe(card, { attributes: true, attributeFilter: ['hidden'] });
  schedule();
}
