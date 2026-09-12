const STORAGE_KEY = 'stockfish-explain.workspace-split';
const SCALE_KEY = 'stockfish-explain.flat-board-scale';
const SIDE_KEY = 'stockfish-explain.workspace-side-width';
const DIVIDER_WIDTH = 16;

// Space here excludes the sidebar, gauge, divider, gaps and outer padding.
export function splitBounds(space) {
  const available = Math.max(0, Number.isFinite(space) ? space : 0);
  const min = Math.min(300, available / 2);
  const max = Math.max(min, Math.min(1100, available - Math.min(280, available / 2)));
  return { min, max, available };
}
export function fitSplit(space, requested, toolsVisible = true) {
  const { min, max, available } = splitBounds(space);
  if (!toolsVisible) return { board: Math.floor(available), tools: 0 };
  const board = Math.round(Math.max(min, Math.min(max, Number.isFinite(requested) ? requested : available * 0.58)));
  return { board, tools: available - board };
}

// Leave room for both the board and analysis when enlarging the clock pane.
export function sidebarBounds(space, toolsVisible = true) {
  const available = Math.max(0, Number.isFinite(space) ? space : 0);
  const max = Math.min(560, Math.max(0, available - 300 - (toolsVisible ? 280 : 0)));
  return { min: Math.min(220, max), max };
}
export function fitSidebar(space, requested, toolsVisible = true) {
  const { min, max } = sidebarBounds(space, toolsVisible);
  return Math.round(Math.max(min, Math.min(max, Number.isFinite(requested) ? requested : 280)));
}

export function fitBoardHeight(width, viewportHeight, headerBottom, navHeight, topGap = 24) {
  const top = Math.max(0, headerBottom) + topGap;
  const height = Math.max(1, Math.floor(Math.min(width, viewportHeight - top - navHeight - 20)));
  return { top, height };
}

export function installWorkspaceSplit(board) {
  const layout = board.rootEl.closest('.uniboard');
  const tools = layout?.querySelector(':scope > .tools');
  const side = layout?.querySelector(':scope > .side');
  if (!layout || !tools || !side) return null;
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
  const leftDivider = document.createElement('div');
  leftDivider.className = 'workspace-divider workspace-left-divider';
  leftDivider.id = 'workspace-left-divider';
  leftDivider.setAttribute('role', 'separator');
  leftDivider.setAttribute('aria-orientation', 'vertical');
  leftDivider.setAttribute('aria-label', 'Resize clock pane and board');
  leftDivider.setAttribute('aria-controls', 'study-side board');
  leftDivider.title = 'Drag left or right to resize the clock pane and board. Double-click to reset.';
  leftDivider.tabIndex = 0;
  side.insertAdjacentElement('afterend', leftDivider);
  let ratio = null, squareScale = 1, sideWidth = null;
  try {
    const saved = Number(localStorage.getItem(STORAGE_KEY));
    if (saved > 0 && saved < 1) ratio = saved;
    const savedScale = Number(localStorage.getItem(SCALE_KEY));
    if (savedScale >= 0.35 && savedScale <= 1) squareScale = savedScale;
    const savedSide = Number(localStorage.getItem(SIDE_KEY));
    if (savedSide >= 220 && savedSide <= 560) sideWidth = savedSide;
  } catch {}
  let drag = null, frame = 0, pendingWidth = null, pendingSide = null, lastWidth = 0, fittedHeight = 0;
  const isActive = () => window.innerWidth >= 800 && !document.body.classList.contains('mobile-mode');
  const hasSidebar = () => isActive() && (window.innerWidth >= 1260 || document.body.classList.contains('watch-mode')) && !document.body.classList.contains('left-pane-hidden');
  const hasTools = () => !document.body.classList.contains('right-pane-hidden');
  const using3D = () => board.rootEl.parentElement.classList.contains('using-3d');
  const contentSpace = () => {
    const css = getComputedStyle(layout);
    const wide = window.innerWidth >= 1260;
    return layout.clientWidth - parseFloat(css.paddingLeft) - parseFloat(css.paddingRight)
      - (wide ? 28 : 24) - DIVIDER_WIDTH * (Number(hasSidebar()) + Number(hasTools()))
      - parseFloat(css.columnGap) * (1 + (hasSidebar() ? 2 : 0) + (hasTools() ? 2 : 0));
  };
  const space = () => contentSpace() - (hasSidebar() ? side.getBoundingClientRect().width : 0);
  function save() {
    if (ratio != null) try { localStorage.setItem(STORAGE_KEY, String(ratio)); } catch {}
    try { localStorage.setItem(SCALE_KEY, String(squareScale)); } catch {}
    if (sideWidth != null) try { localStorage.setItem(SIDE_KEY, String(sideWidth)); } catch {}
  }
  function apply(requested, requestedSide = null) {
    if (!isActive()) return;
    if (hasSidebar()) {
      const currentSide = side.getBoundingClientRect().width;
      const defaultSide = Math.max(220, Math.min(280, window.innerWidth * 0.22));
      const fittedSide = fitSidebar(contentSpace(), requestedSide ?? sideWidth ?? defaultSide, hasTools());
      if (requestedSide != null) {
        sideWidth = fittedSide;
        // Keep the analysis width steady until the board reaches its fit limit.
        requested = board.rootEl.parentElement.getBoundingClientRect().width + currentSide - fittedSide;
      }
      layout.style.setProperty('--split-side-width', fittedSide + 'px');
      const bounds = sidebarBounds(contentSpace(), hasTools());
      leftDivider.setAttribute('aria-valuemin', String(bounds.min));
      leftDivider.setAttribute('aria-valuemax', String(bounds.max));
      leftDivider.setAttribute('aria-valuenow', String(fittedSide));
      leftDivider.setAttribute('aria-valuetext', `Clock pane ${fittedSide} pixels`);
    }
    const available = space();
    const { board: width, tools: right } = fitSplit(available, requested ?? (ratio == null ? initialWidth : available * ratio), hasTools());
    // Hiding analysis gives the whole remaining width to the board temporarily.
    // Keep its split preference so showing the pane restores the user's divider.
    if (hasTools() && (ratio == null || requested != null)) ratio = width / available;
    layout.style.setProperty('--split-board-width', width + 'px');
    const headerBottom = Math.max(0, document.querySelector('.site-header')?.getBoundingClientRect().bottom || 60);
    const navHeight = board.watchActive ? 0 : layout.querySelector('.board-nav')?.getBoundingClientRect().height || 72;
    const viewer = using3D();
    const { top, height: fitHeight } = fitBoardHeight(width, window.innerHeight, headerBottom, navHeight, viewer ? 12 : 48);
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
    board.dispatchEvent(new CustomEvent('flat-layout-patch',{detail:{flatScale:squareScale*100}}));
    apply();
  }
  function schedule(requested = null, requestedSide = null) {
    pendingWidth = requested;
    pendingSide = requestedSide;
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      const next = pendingWidth, nextSide = pendingSide;
      pendingWidth = pendingSide = null;
      apply(next, nextSide);
    });
  }
  function finish(event) {
    if (!drag || (event?.pointerId != null && event.pointerId !== drag.id)) return;
    if (frame) { cancelAnimationFrame(frame); frame = 0; apply(pendingWidth, pendingSide); pendingWidth = pendingSide = null; }
    const { id, handle } = drag;
    drag = null;
    document.body.classList.remove('board-split-dragging');
    if (handle.hasPointerCapture(id)) handle.releasePointerCapture(id);
    save();
    window.dispatchEvent(new Event('resize'));
  }
  function updateLayout() {
    const active = isActive();
    layout.classList.toggle('split-layout', active);
    if (!active) { finish(); return; }
    if (drag?.handle === leftDivider && !hasSidebar()) finish();
    if (drag?.handle === divider && !hasTools()) finish();
    schedule();
  }
  divider.addEventListener('pointerdown', event => {
    if (!isActive() || !hasTools() || event.button !== 0) return;
    event.preventDefault();
    divider.focus();
    drag = { id: event.pointerId, handle: divider, x: event.clientX, width: board.rootEl.parentElement.getBoundingClientRect().width };
    divider.setPointerCapture(event.pointerId);
    document.body.classList.add('board-split-dragging');
  });
  divider.addEventListener('pointermove', event => {
    if (drag?.handle === divider && drag.id === event.pointerId) schedule(drag.width + event.clientX - drag.x);
  });
  leftDivider.addEventListener('pointerdown', event => {
    if (!hasSidebar() || event.button !== 0) return;
    event.preventDefault();
    leftDivider.focus();
    drag = { id: event.pointerId, handle: leftDivider, x: event.clientX, width: side.getBoundingClientRect().width };
    leftDivider.setPointerCapture(event.pointerId);
    document.body.classList.add('board-split-dragging');
  });
  leftDivider.addEventListener('pointermove', event => {
    if (drag?.handle === leftDivider && drag.id === event.pointerId)
      schedule(null, drag.width + event.clientX - drag.x);
  });
  for (const handle of [divider, leftDivider])
    for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) handle.addEventListener(name, finish);
  window.addEventListener('blur', () => finish());
  divider.addEventListener('dblclick', () => { ratio = 0.58; apply(); save(); });
  leftDivider.addEventListener('dblclick', () => {
    apply(null, Math.max(220, Math.min(280, window.innerWidth * 0.22))); save();
  });
  leftDivider.addEventListener('keydown', event => {
    if (!hasSidebar()) return;
    const width = side.getBoundingClientRect().width;
    const step = event.shiftKey ? 40 : 16, bounds = sidebarBounds(contentSpace(), hasTools());
    const targets = { ArrowLeft: width - step, ArrowRight: width + step, Home: bounds.min, End: bounds.max };
    if (!(event.key in targets)) return;
    event.preventDefault(); event.stopPropagation();
    apply(null, targets[event.key]); save();
  });
  divider.addEventListener('keydown', event => {
    if (!isActive() || !hasTools()) return;
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
  const header = document.querySelector('.site-header');
  if (header) new ResizeObserver(updateLayout).observe(header);
  updateLayout();
  return {
    isActive, setBoardSize: apply, resizeFromCorner, save,
    restoreScale: value => { if(value>=35&&value<=100){squareScale=value/100;apply();save();} },
    getCornerSize: () => (using3D() ? board.rootEl.parentElement : board.rootEl).getBoundingClientRect().width,
  };
}
