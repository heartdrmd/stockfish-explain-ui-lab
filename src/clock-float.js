// Position only: keep the same clock element and its existing game timer.
import {fitClockArea, visibleBoardBounds} from './clock-safe-area.js';
export function installFloatingClock(practiceCard, practiceHost) {
  const grip = document.getElementById('clock-float-drag');
  const toolbarToggle = document.getElementById('btn-move-clock');
  const practicePanel = practiceHost.closest?.('.tools');
  let card = practiceCard, host = practiceHost, panel = practicePanel;
  if (!grip || !panel) return;
  const key = 'stockfish-explain.floating-clock-layouts-v1';
  let toolsPin = 0;
  let offset = { x: 0, y: 0 }, drag = null, frame = 0, moveMode = false, skipClick = false;
  let desired = { x: 0, y: 0 }, layout = null, model = null, suspended = false, legacy = null;
  let positions = {};
  const point = p => p && Number.isFinite(p.x) && Number.isFinite(p.y) && Math.abs(p.x)<=10000 && Math.abs(p.y)<=10000;
  try {
    const saved = JSON.parse(localStorage.getItem(key));
    if (saved && typeof saved==='object' && !Array.isArray(saved)) positions = saved;
    const old = JSON.parse(localStorage.getItem('stockfish-explain.floating-clock-position'));
    if (point(old) && !Object.keys(positions).length) legacy = old;
  } catch {}
  const inFullscreen = () => suspended || !!document.fullscreenElement ||
    document.getElementById('zagreb-board')?.contentDocument?.querySelector('.fullscreen-shell')?.classList.contains('is-expanded');
  const watching = () => document.body.classList.contains('watch-mode');
  const watchClock = () => card !== practiceCard;
  const active = () => window.innerWidth >= 800 && !card.hidden &&
    !inFullscreen() &&
    !document.body.classList.contains('clock-presentation-hidden') &&
    (watching() ? watchClock() : document.body.classList.contains('clock-docked-right')) &&
    !document.body.classList.contains('mobile-mode');
  const floating = () => !watchClock() && document.body.classList.contains('right-pane-hidden');
  const aboveNotation = () => !watchClock() && !floating() && document.body.classList.contains('notation-bottom-docked');
  const safeHorizontal = () => {
    const bounds=panel.getBoundingClientRect();
    const board=visibleBoardBounds(document);
    if (watchClock() && panel.dataset.side === 'left') {
      const left=Math.max(8,bounds.left);
      return {left,right:Math.max(left,Math.min(bounds.right,board.left-16))};
    }
    const right=floating()?window.innerWidth-20:Math.min(window.innerWidth-12,bounds.right);
    const left=Math.max(board.right+16,floating()?8:bounds.left);
    return {left:Math.min(right,left),right};
  };
  const save = () => {
    if (!layout || !model) return;
    positions[`${layout}:${model}`] = {...desired};
    try { localStorage.setItem(key, JSON.stringify(positions)); } catch {}
    document.getElementById('zagreb-board')?.contentWindow?.postMessage({
      type:'zagreb:clock-position',layout,model,x:desired.x,y:desired.y,
    },location.origin);
  };
  function paint() {
    panel.style.setProperty('--clock-float-x', `${offset.x}px`);
    panel.style.setProperty('--clock-float-y', `${offset.y}px`);
    card.style.setProperty('--clock-dock-x',`${offset.x}px`);
    card.style.setProperty('--clock-dock-y',`${offset.y}px`);
    const clockTop=Math.max(8,card.getBoundingClientRect().top);
    const availableHeight = `${aboveNotation() ? Math.max(1,safeBottom()-clockTop-40) : Math.max(120,window.innerHeight-clockTop-48)}px`;
    if(card.style.getPropertyValue('--clock-available-height') !== availableHeight)card.style.setProperty('--clock-available-height', availableHeight);
    if (!watchClock()) host.style.height = active() && !floating() ? `${Math.max(0,card.getBoundingClientRect().height)}px` : '';
  }
  const safeBottom = () => {
    if (!watchClock()) {
      if (aboveNotation()) {
        const bounds=panel.getBoundingClientRect();
        // The right column ends above notation. Leave usable analysis space
        // below the clock instead of letting its fixed slot consume it all.
        const analysisHeight=Math.min(240,Math.max(120,bounds.height*.5));
        return Math.min(window.innerHeight-8,bounds.bottom-analysisHeight-28);
      }
      return window.innerHeight-8;
    }
    const moves=panel.querySelector('.watch-pane-moves:not(:empty)')?.getBoundingClientRect();
    return Math.min(window.innerHeight-8,panel.getBoundingClientRect().bottom,moves?.top ? moves.top-28 : Infinity);
  };
  function move(x, y, remember = false) {
    const rect = (floating() ? panel : card).getBoundingClientRect();
    const baseX = rect.left - offset.x, baseY = rect.top - offset.y;
    const canvas = card.querySelector('canvas')?.getBoundingClientRect();
    const above = canvas?.width > 0 && canvas?.height > 0 ? Math.max(0, rect.top - canvas.top) : 0;
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
    top += above;
    // Keep the grip and clock reachable after a resize or a settings change.
    const horizontal=safeHorizontal();
    if (watchClock()) top=Math.max(top,panel.getBoundingClientRect().top+above);
    const fit=fitClockArea({...horizontal,top,bottom:safeBottom(),width:rect.width,height:rect.height,
      x:baseX+x,y:baseY+y});
    offset = {
      x: Math.round(fit.left-baseX),
      y: Math.round(fit.top-baseY),
    };
    // A smaller viewport may clamp the display, but must not overwrite where
    // the user placed it in this layout at its usual size.
    if (remember) desired = {...offset};
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
    if (toolbarToggle) {
      toolbarToggle.setAttribute('aria-pressed', String(enabled));
      toolbarToggle.setAttribute('aria-label', enabled ? 'Finish moving clock' : 'Move clock');
      toolbarToggle.title = enabled ? 'Move mode on · drag the clock, then click here to finish' : 'Move clock · click, then drag the clock without rotating it';
    }
    card.classList.toggle('clock-move-mode', enabled);
    if (!enabled) finish();
  }
  function schedule() {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      // Watch renders a separate, read-only clock portal. Follow that visible
      // element rather than inspecting the hidden practice clock's canvas.
      const nextCard = watching() ? document.querySelector('.watch-pane-clock:has(canvas)') || practiceCard : practiceCard;
      const nextPanel = nextCard !== practiceCard ? nextCard.closest('.watch-pane') : practicePanel;
      if (nextCard !== card || nextPanel !== panel) {
        finish();setMoveMode(false);
        resize.unobserve(card);
        card.classList.remove('watch-clock-free');
        for (const axis of ['x','y']) {
          card.style.removeProperty(`--clock-dock-${axis}`);
          panel.style.removeProperty(`--clock-float-${axis}`);
        }
        card.style.visibility='';
        host.style.height='';
        card=nextCard;
        panel=nextPanel;
        host=watchClock() ? card : practiceHost;
        offset={x:0,y:0};
        card.classList.toggle('watch-clock-free',watchClock());
        resize.observe(card);
      }
      if (toolbarToggle) toolbarToggle.disabled = !active() || !card.querySelector('canvas');
      if (active()) {
        const face = card.querySelector('.game-clock');
        const naturalWidth = parseFloat(face?.style.width || '300');
        const ratio = face?.offsetHeight / Math.max(1, naturalWidth) || .75;
        const clockTop = Math.max(8, card.getBoundingClientRect().top);
        const widthForHeight = watchClock() || aboveNotation()
          ? Math.max(1,(safeBottom()-clockTop-56)/ratio+30)
          : Math.max(180,(window.innerHeight-clockTop-64)/ratio+30);
        const safe=safeHorizontal();
        const width = `${Math.max(1,Math.floor(Math.min(safe.right-safe.left,widthForHeight,naturalWidth||300)))}px`;
        card.style.visibility=safe.right-safe.left<1?'hidden':'';
        if (panel.style.getPropertyValue('--floating-clock-width') !== width) panel.style.setProperty('--floating-clock-width', width);
        if (card.style.getPropertyValue('--docked-clock-width') !== width) card.style.setProperty('--docked-clock-width', width);
        move(desired.x, desired.y);
      }
      else {setMoveMode(false);host.style.height='';card.style.visibility='';}
      const docked = !watching() && window.innerWidth >= 800 && !document.body.classList.contains('mobile-mode') &&
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
  toolbarToggle?.addEventListener('click', () => {
    if (active()) setMoveMode(!moveMode);
  });
  document.addEventListener('pointerdown', event => {
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
  document.addEventListener('pointermove', event => {
    if (!drag || event.pointerId !== drag.id) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (!active() || (event.pointerType === 'mouse' && event.buttons === 0)) { finish(); return; }
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
    if (drag.target === grip && Math.hypot(dx, dy) > 3) skipClick = true;
    move(drag.start.x + dx, drag.start.y + dy, true);
  }, true);
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    document.addEventListener(type, event => {
      if (event.pointerId !== drag?.id) return;
      event.stopImmediatePropagation();
      finish();
    }, true);
  }
  const reset = () => { if (active()) { move(0, 0, true); save(); } };
  const keydown = event => {
    if (!active() || !moveMode || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === 'Home') { event.preventDefault(); reset(); return; }
    const delta = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
    if (!delta) return;
    event.preventDefault();
    const step = event.shiftKey ? 1 : 10;
    move(offset.x + delta[0] * step, offset.y + delta[1] * step, true);
    save();
  };
  grip.addEventListener('keydown',keydown);
  toolbarToggle?.addEventListener('keydown',keydown);
  window.addEventListener('scroll', schedule, {passive:true});
  window.addEventListener('resize', schedule);
  window.addEventListener('board-footprint-change',schedule);
  window.addEventListener('blur', finish);
  document.addEventListener('fullscreenchange', schedule);
  const resize = new ResizeObserver(schedule);
  resize.observe(panel);resize.observe(card);
  const boardNode=document.getElementById('board');if(boardNode)resize.observe(boardNode);
  const boardFrame=document.getElementById('zagreb-board');if(boardFrame)resize.observe(boardFrame);
  const boardLayout=document.querySelector('.uniboard');
  if(boardLayout)new MutationObserver(schedule).observe(boardLayout,{attributes:true,attributeFilter:['style']});
  new MutationObserver(schedule).observe(card, { attributes: true, attributeFilter: ['hidden'] });
  new MutationObserver(schedule).observe(card, { attributes: true, childList: true, subtree: true, attributeFilter: ['style'] });
  new MutationObserver(schedule).observe(document.body, {attributes:true,attributeFilter:['class']});
  // The broadcast portal and its canvas arrive after Watch has been opened.
  for (const side of ['study-side','study-tools']) {
    const pane=document.getElementById(side);
    if (pane) new MutationObserver(schedule).observe(pane,{childList:true,subtree:true});
  }
  schedule();
  return { setLayout(request) {
    if (!request || !['dgt-3000','zmf-pro','garde'].includes(request.model) ||
      !/^(fullscreen:(2d|3d)|window:(2d|3d):(left|right):(open|closed):(open|closed))$/.test(request.layout)) return;
    if (request.layout.startsWith('fullscreen:')) {
      finish(); suspended = true; setMoveMode(false); schedule(); return;
    }
    const changed = layout !== request.layout || model !== request.model;
    if (changed) {finish();setMoveMode(false);}
    layout = request.layout; model = request.model; suspended = false;
    const stored = positions[`${layout}:${model}`];
    const migrate = !point(request.position) && !point(stored) && legacy && layout.includes(':right:');
    desired = {...(point(request.position) ? request.position : point(stored) ? stored : migrate ? legacy : {x:0,y:0})};
    if (migrate) {legacy=null;save();}
    schedule();
  }};
}
