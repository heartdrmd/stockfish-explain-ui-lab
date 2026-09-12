const STORAGE_KEY = 'stockfish-explain.workspace-split';
const SCALE_KEY = 'stockfish-explain.flat-board-scale';
const DIVIDER_WIDTH = 16;

// Space here excludes the sidebar, gauge, divider, gaps and outer padding.
export function splitBounds(space) {
  const available = Math.max(0, Number.isFinite(space) ? space : 0);
  const min = Math.min(300, available / 2);
  const max = Math.max(min, Math.min(1100, available - Math.min(280, available / 2)));
  return { min, max, available };
}
export function fitSplit(space, requested) {
  const { min, max, available } = splitBounds(space);
  const board = Math.round(Math.max(min, Math.min(max, Number.isFinite(requested) ? requested : available * 0.58)));
  return { board, tools: available - board };
}

export function fitBoardHeight(width, viewportHeight, headerBottom, navHeight, topGap = 24) {
  const top = Math.max(0, headerBottom) + topGap;
  const height = Math.max(1, Math.floor(Math.min(width, viewportHeight - top - navHeight - 20)));
  return { top, height };
}

export function installWorkspaceSplit(board) {
  const layout = board.rootEl.closest('.uniboard');
  const tools = layout?.querySelector(':scope > .tools');
  if (!layout || !tools) return null;
  const initialWidth = board.rootEl.getBoundingClientRect().width;
  const divider = document.createElement('div');
  divider.className = 'workspace-divider';
  divider.id = 'workspace-divider';
  divider.setAttribute('role', 'separator');
  divider.setAttribute('aria-orientation', 'vertical');
  divider.setAttribute('aria-label', 'Resize board and analysis');
  divider.setAttribute('aria-controls', 'board study-tools');
  divider.title = 'Drag left or right to resize the board and analysis. Double-click to reset.';
  divider.tabIndex = 0;
  tools.id ||= 'study-tools';
  layout.insertBefore(divider, tools);
  let ratio = null, squareScale = 1;
  try {
    const saved = Number(localStorage.getItem(STORAGE_KEY));
    if (saved > 0 && saved < 1) ratio = saved;
    const savedScale = Number(localStorage.getItem(SCALE_KEY));
    if (savedScale >= 0.35 && savedScale <= 1) squareScale = savedScale;
  } catch {}
  let drag = null, frame = 0, pendingWidth = null, lastWidth = 0, fittedHeight = 0;
  const isActive = () => window.innerWidth >= 800 && !document.body.classList.contains('mobile-mode');
  const using3D = () => board.rootEl.parentElement.classList.contains('using-3d');
  const space = () => {
    const css = getComputedStyle(layout);
    const wide = window.innerWidth >= 1260;
    const hasSidebar = wide && !document.body.classList.contains('left-pane-hidden');
    const sidebar = hasSidebar ? layout.querySelector(':scope > .side').getBoundingClientRect().width : 0;
    return layout.clientWidth - parseFloat(css.paddingLeft) - parseFloat(css.paddingRight)
      - sidebar - (wide ? 28 : 24) - DIVIDER_WIDTH - parseFloat(css.columnGap) * (hasSidebar ? 4 : 3);
  };
  function save() {
    if (ratio != null) try { localStorage.setItem(STORAGE_KEY, String(ratio)); } catch {}
    try { localStorage.setItem(SCALE_KEY, String(squareScale)); } catch {}
  }
  function apply(requested) {
    if (!isActive()) return;
    const available = space();
    const { board: width, tools: right } = fitSplit(available, requested ?? (ratio == null ? initialWidth : available * ratio));
    if (ratio == null) ratio = width / available;
    if (requested != null) ratio = width / available;
    layout.style.setProperty('--split-board-width', width + 'px');
    const headerBottom = Math.max(0, document.querySelector('.site-header')?.getBoundingClientRect().bottom || 60);
    const navHeight = layout.querySelector('.board-nav')?.getBoundingClientRect().height || 72;
    const viewer = using3D();
    const { top, height: fitHeight } = fitBoardHeight(width, window.innerHeight, headerBottom, navHeight, viewer ? 12 : 24);
    fittedHeight = fitHeight;
    const height = viewer ? fitHeight : Math.max(1, Math.round(fitHeight * squareScale));
    layout.style.setProperty('--split-board-height', height + 'px');
    layout.style.setProperty('--split-top', top + 'px');
    const bounds = splitBounds(available);
    divider.setAttribute('aria-valuemin', String(Math.round(bounds.min / available * 100)));
    divider.setAttribute('aria-valuemax', String(Math.round(bounds.max / available * 100)));
    divider.setAttribute('aria-valuenow', String(Math.round(width / available * 100)));
    divider.setAttribute('aria-valuetext', `Board ${width} pixels, analysis ${Math.round(right)} pixels`);
    const corner = document.getElementById('board-resize');
    if (corner) { corner.style.top = (height - 10) + 'px'; corner.style.bottom = 'auto'; }
    const dimensions = `${width}:${height}`;
    if (dimensions !== lastWidth) {
      lastWidth = dimensions;
      // The existing iframe and gauge observers follow the board's dimensions.
      // Chessground must also remeasure square positions for correct hit tests.
      document.dispatchEvent(new Event('chessgroundResize'));
    }
  }
  function resizeFromCorner(requested) {
    if (using3D()) { apply(requested); return; }
    if (!Number.isFinite(requested) || fittedHeight <= 0) return;
    // The corner owns the visible square; the divider owns the column.
    // A height-limited square must respond without first crossing unused width.
    squareScale = Math.max(0.35, Math.min(1, requested / fittedHeight));
    apply();
  }
  function schedule(requested = null) {
    pendingWidth = requested;
    if (frame) return;
    frame = requestAnimationFrame(() => { frame = 0; const next = pendingWidth; pendingWidth = null; apply(next); });
  }
  function finish(event) {
    if (!drag || (event?.pointerId != null && event.pointerId !== drag.id)) return;
    if (frame) { cancelAnimationFrame(frame); frame = 0; apply(pendingWidth); pendingWidth = null; }
    const id = drag.id;
    drag = null;
    document.body.classList.remove('board-split-dragging');
    if (divider.hasPointerCapture(id)) divider.releasePointerCapture(id);
    save();
    window.dispatchEvent(new Event('resize'));
  }
  function updateLayout() {
    const active = isActive();
    layout.classList.toggle('split-layout', active);
    if (!active) { finish(); return; }
    schedule();
  }
  divider.addEventListener('pointerdown', event => {
    if (!isActive() || event.button !== 0) return;
    event.preventDefault();
    divider.focus();
    drag = { id: event.pointerId, x: event.clientX, width: board.rootEl.parentElement.getBoundingClientRect().width };
    divider.setPointerCapture(event.pointerId);
    document.body.classList.add('board-split-dragging');
  });
  divider.addEventListener('pointermove', event => {
    if (drag?.id === event.pointerId) schedule(drag.width + event.clientX - drag.x);
  });
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) divider.addEventListener(name, finish);
  window.addEventListener('blur', () => finish());
  divider.addEventListener('dblclick', () => { ratio = 0.58; apply(); save(); });
  divider.addEventListener('keydown', event => {
    const width = board.rootEl.parentElement.getBoundingClientRect().width;
    const step = event.shiftKey ? 40 : 16;
    const bounds = splitBounds(space());
    const targets = { ArrowLeft: width - step, ArrowRight: width + step, Home: bounds.min, End: bounds.max };
    if (!(event.key in targets)) return;
    event.preventDefault(); event.stopPropagation();
    apply(targets[event.key]); save();
  });
  window.addEventListener('resize', updateLayout);
  let measuredWidth = layout.clientWidth;
  new ResizeObserver(() => {
    if (measuredWidth === layout.clientWidth) return;
    measuredWidth = layout.clientWidth; updateLayout();
  }).observe(layout);
  // Mobile mode / toolbar changes may alter available space without a resize.
  new MutationObserver(() => { if (!drag) updateLayout(); }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  // Switching from the viewer to native 2D changes the top breathing room.
  new MutationObserver(updateLayout).observe(board.rootEl.parentElement, { attributes: true, attributeFilter: ['class'] });
  updateLayout();
  return {
    isActive, setBoardSize: apply, resizeFromCorner, save,
    getCornerSize: () => (using3D() ? board.rootEl.parentElement : board.rootEl).getBoundingClientRect().width,
  };
}
