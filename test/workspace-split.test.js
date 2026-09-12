import test from 'node:test';
import assert from 'node:assert/strict';
import { fitSplit, splitBounds, fitBoardHeight, fitSidebar, installWorkspaceSplit } from '../src/workspace-split.js';
import { installRightPaneToggle } from '../src/left-pane.js';

test('workspace split preserves usable board and analysis widths at both drag limits', () => {
  for (const space of [640, 780, 900, 1200, 1800]) {
    for (const request of [-10000, 0, 300, space * 0.58, 10000]) {
      const split = fitSplit(space, request);
      assert.ok(split.board >= 300 && split.board <= 1100);
      assert.ok(split.tools >= 280);
      assert.equal(split.board + split.tools, space);
    }
  }
});

test('a remembered ratio refits a narrower window and handles invalid dimensions', () => {
  const ratio = 0.6;
  assert.equal(fitSplit(1000, 1000 * ratio).board, 600);
  assert.equal(fitSplit(700, 700 * ratio).board, 420);
  assert.deepEqual(fitSplit(0, 900), { board: 0, tools: 0 });
  assert.deepEqual(splitBounds(NaN), { min: 0, max: 0, available: 0 });
  assert.equal(fitSplit(1000, NaN).board, 580);
});

test('regular 2D fills the space below its top gap and leaves the navigation visible', () => {
  for (const header of [40, 60, 100]) for (const viewport of [340, 600, 900]) {
    const fit = fitBoardHeight(800, viewport, header, 80);
    assert.equal(fit.top - header, 24);
    assert.ok(fit.top + fit.height + 80 + 20 <= viewport);
    assert.equal(fit.height, Math.min(800, viewport - header - 24 - 80 - 20));
  }
  assert.deepEqual(fitBoardHeight(300, 900, 60, 80), {top:84,height:300});
  assert.deepEqual(fitBoardHeight(800, 600, 60, 80, 12), {top:72,height:428});
});

test('enlarging the clock pane reserves usable board and analysis space', () => {
  for (const available of [1100, 1400, 1800]) for (const request of [-1000, 280, 450, 10000]) {
    const left = fitSidebar(available, request);
    const rest = fitSplit(available - left, 500);
    assert.ok(left >= 220 && left <= 560);
    assert.ok(rest.board >= 300 && rest.tools >= 280);
    assert.equal(left + rest.board + rest.tools, available);
  }
});

function workspaceFixture(t, saved = new Map()) {
  class Element extends EventTarget {
    attrs = {}; values = new Map(); classes = new Set(); capture = null;
    style = { setProperty: (key, value) => this.values.set(key, value) };
    classList = { contains: key => this.classes.has(key), add: key => this.classes.add(key),
      remove: key => this.classes.delete(key), toggle: (key, on) => on ? this.classes.add(key) : this.classes.delete(key) };
    setAttribute(key, value) { this.attrs[key] = value; }
    focus() {}
    setPointerCapture(id) { this.capture = id; }
    hasPointerCapture(id) { return this.capture === id; }
    releasePointerCapture() { this.capture = null; }
  }
  const body = new Element(), layout = new Element(), side = new Element(), area = new Element(), tools = new Element();
  const win = new EventTarget(), doc = new EventTarget(), elements = [], frames = new Map(), rightToggle = new Element();
  win.innerWidth = 1600; win.innerHeight = 1000;
  let frameId = 0, resizeEvents = 0;
  const cssNumber = (key, fallback) => parseFloat(layout.values.get(key)) || fallback;
  Object.defineProperty(layout, 'clientWidth', { get: () => win.innerWidth });
  side.getBoundingClientRect = () => ({width: cssNumber('--split-side-width', 280)});
  side.insertAdjacentElement = (_, el) => elements.push(el);
  area.getBoundingClientRect = () => ({width: cssNumber('--split-board-width', 600)});
  layout.querySelector = selector => selector.endsWith('.side') ? side : selector.endsWith('.tools') ? tools :
    selector === '.board-nav' ? {getBoundingClientRect: () => ({height:72})} : null;
  layout.insertBefore = el => elements.push(el);
  const root = { closest: () => layout, parentElement: area, getBoundingClientRect: area.getBoundingClientRect };
  Object.assign(doc, { body, createElement: () => new Element(), getElementById: id => id === 'btn-toggle-right-pane' ? rightToggle : null,
    querySelector: () => ({getBoundingClientRect: () => ({bottom:60})}) });
  doc.addEventListener('chessgroundResize', () => resizeEvents++);
  const globals = { window:win, document:doc,
    localStorage:{getItem:key => saved.get(key) ?? null, setItem:(key,value) => saved.set(key,value)},
    getComputedStyle:() => ({paddingLeft:'20',paddingRight:'20',columnGap:'12'}),
    requestAnimationFrame:cb => {frames.set(++frameId,cb); return frameId;}, cancelAnimationFrame:id => frames.delete(id),
    ResizeObserver:class {observe() {}}, MutationObserver:class {observe() {}} };
  for (const [key,value] of Object.entries(globals)) {
    const original = Object.getOwnPropertyDescriptor(globalThis,key);
    Object.defineProperty(globalThis,key,{value,configurable:true});
    t.after(() => original ? Object.defineProperty(globalThis,key,original) : delete globalThis[key]);
  }
  const flush = () => {const pending=[...frames.values()]; frames.clear(); pending.forEach(cb=>cb());};
  installRightPaneToggle();
  const split = installWorkspaceSplit({rootEl:root}); flush();
  const left = elements.find(el=>el.id==='workspace-left-divider'), right = elements.find(el=>el.id==='workspace-divider');
  return {left,right,rightToggle,body,win,saved,split,flush, resizeEvents:()=>resizeEvents,
    height:()=>cssNumber('--split-board-height',600),
    widths:()=>({side:side.getBoundingClientRect().width,board:area.getBoundingClientRect().width}),
    event(handle,type,properties={}) {const event=new Event(type,{cancelable:true}); Object.assign(event,{pointerId:1,clientX:100,button:0,...properties}); handle.dispatchEvent(event);} };
}

test('left divider drag resizes the board, flushes its final movement and remembers the pane width', t => {
  const f = workspaceFixture(t), before=f.widths(), resizes=f.resizeEvents();
  f.event(f.left,'pointerdown');
  f.event(f.left,'pointermove',{clientX:200});
  f.event(f.left,'pointerup',{clientX:200});
  assert.deepEqual(f.widths(),{side:before.side+100,board:before.board-100});
  assert.equal(f.saved.get('stockfish-explain.workspace-side-width'),'380');
  assert.ok(f.resizeEvents()>resizes,'Native 2D hit boxes remeasure after the board changes');
  f.flush();
  assert.deepEqual(f.widths(),{side:380,board:500},'Resize notification does not snap either divider back');
  f.event(f.right,'keydown',{key:'ArrowRight'});
  assert.deepEqual(f.widths(),{side:380,board:516},'The right divider retains the chosen left width');
  f.event(f.left,'keydown',{key:'End'});
  assert.equal(f.widths().side,560);
  f.event(f.left,'dblclick');
  assert.equal(f.widths().side,280);
});

test('restored left width survives hiding the pane and narrowing the window', t => {
  const f=workspaceFixture(t,new Map([['stockfish-explain.workspace-side-width','460']]));
  assert.equal(f.widths().side,460);
  f.body.classes.add('left-pane-hidden'); f.win.dispatchEvent(new Event('resize')); f.flush();
  f.body.classes.delete('left-pane-hidden'); f.win.dispatchEvent(new Event('resize')); f.flush();
  assert.equal(f.widths().side,460);
  f.win.innerWidth=1000; f.win.dispatchEvent(new Event('resize')); f.flush();
  f.event(f.left,'pointerdown'); f.event(f.left,'pointermove',{clientX:600}); f.event(f.left,'pointerup');
  f.win.innerWidth=1600; f.win.dispatchEvent(new Event('resize')); f.flush();
  assert.equal(f.widths().side,460,'The stacked layout cannot overwrite the desktop clock width');
});

test('right toggle gives the board the free space and restores the chosen divider', t => {
  const f=workspaceFixture(t), before=f.widths(), oldHeight=f.height();
  f.event(f.right,'keydown',{key:'ArrowLeft'});
  const chosen=f.widths(), preference=f.saved.get('stockfish-explain.workspace-split');
  f.event(f.rightToggle,'click'); f.flush();
  assert.equal(f.rightToggle.attrs['aria-label'],'Show right pane');
  assert.equal(f.rightToggle.attrs['aria-pressed'],'false');
  assert.equal(f.saved.get('stockfish-explain.right-pane-hidden'),'1');
  assert.deepEqual(f.widths(),{side:before.side,board:1200},'The board takes the full width freed by analysis and its divider');
  assert.ok(f.height()>oldHeight,'Native 2D also grows to fit the available height');
  assert.equal(f.saved.get('stockfish-explain.workspace-split'),preference);
  f.body.classes.add('left-pane-hidden'); f.win.dispatchEvent(new Event('resize')); f.flush();
  assert.equal(f.widths().board,1520,'Hiding both panes leaves only the board, gauge and outer spacing');
  f.body.classes.delete('left-pane-hidden'); f.win.dispatchEvent(new Event('resize')); f.flush();
  f.event(f.rightToggle,'click'); f.flush();
  assert.deepEqual(f.widths(),chosen,'Showing analysis restores the earlier divider width');
  assert.equal(f.rightToggle.attrs['aria-label'],'Hide right pane');
});

test('right-pane preference restores on load and still fits the narrower layout', t => {
  const saved=new Map([['stockfish-explain.right-pane-hidden','1'],['stockfish-explain.workspace-split','0.6']]);
  const f=workspaceFixture(t,saved);
  assert.equal(f.widths().board,1200);
  f.win.innerWidth=1000; f.win.dispatchEvent(new Event('resize')); f.flush();
  assert.equal(f.widths().board,924,'At medium width the board consumes all space except gauge, gap and padding');
  f.event(f.rightToggle,'click'); f.flush();
  assert.equal(f.widths().board,530,'Reopening uses the saved 60% board share');
});
