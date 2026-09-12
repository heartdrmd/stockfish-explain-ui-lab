import test from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from '../vendor/chess.js/chess.js';
import { install3DBoard } from '../src/board-3d.js';

test('shared clocks use parent time in both board modes and reject foreign controls', t => {
  class Element extends EventTarget {
    style = {};
    children = [];
    classList = { toggle() {}, contains: () => false };
    attributes = {};
    setAttribute(name, value) { this.attributes[name] = value; }
    prepend(child) { this.children.unshift(child); }
    append(child) { this.children.push(child); }
    insertBefore(child) { this.children.push(child); }
    click() { this.dispatchEvent(new Event('click')); }
  }
  const area = new Element(), nav = new Element(), root = new Element(), graphButton = new Element(), controlsButton = new Element();
  area.querySelector = () => nav;
  root.parentElement = area;
  root.offsetWidth = 640;
  root.offsetHeight = 640;
  const sent = [], frames = [];
  const windowTarget = new EventTarget();
  const origin = 'https://chess.example';
  const globals = {
    document: {
      body: new Element(), querySelector: () => null, getElementById: id =>
        id === 'btn-live-graph' ? graphButton : id === 'btn-toggle-board-controls' ? controlsButton : null,
      createElement: () => {
        const element = new Element();
        element.contentWindow = { postMessage: (message, target) => sent.push({message, target}) };
        return element;
      },
    },
    window: windowTarget, location: {origin}, localStorage: {getItem: () => null},
    MutationObserver: class { observe() {} }, ResizeObserver: class { observe() {} },
    requestAnimationFrame: callback => { frames.push(callback); return frames.length; },
    cancelAnimationFrame() {},
  };
  for (const [name, value] of Object.entries(globals)) {
    const original = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, {value, configurable:true});
    t.after(() => original ? Object.defineProperty(globalThis,name,original) : delete globalThis[name]);
  }
  const chess = new Chess(), board = new EventTarget();
  Object.assign(board, {
    rootEl: root, chess, fen: () => chess.fen(),
    cg: {state: {movable: {color:'both'}, orientation:'white'}, set() {}},
    studyClock: {available:true, active:true, paused:false, mode:'down', whiteMs:287600, blackMs:300000, running:'w', label:'5 + 3'},
  });
  let pauseRequests = 0;
  let designRequests = 0;
  board.addEventListener('clock-pause-request', () => pauseRequests++);
  board.addEventListener('clock-design-request', () => designRequests++);
  install3DBoard(board);
  frames.splice(0).forEach(callback => callback());
  const frame = area.children[0], toggle = nav.children[0];
  assert.equal(frame.style.width, '640px', 'Startup sizing does not require a message event');
  assert.equal(sent.length, 0, 'Wait for the iframe handshake before publishing');
  function message(type, source = frame.contentWindow, from = origin, payload = {}) {
    const event = new Event('message');
    Object.assign(event, {data:{type, ...payload}, source, origin:from});
    windowTarget.dispatchEvent(event);
  }
  const clockMessages = () => sent.filter(item => item.message.type === 'zagreb:clock');
  message('zagreb:ready');
  const analysisRequests=[],docks=[];
  board.requestAnalysis=request=>analysisRequests.push(request.action);
  board.setClockDock=placement=>docks.push(placement);
  message('zagreb:analysis',{},origin,{action:'play-best',fen:chess.fen()});
  message('zagreb:analysis',frame.contentWindow,'https://other.example',{action:'play-best',fen:chess.fen()});
  assert.equal(analysisRequests.length,0);
  message('zagreb:analysis',frame.contentWindow,origin,{action:'toggle-engine',fen:chess.fen()});
  assert.deepEqual(analysisRequests,['toggle-engine']);
  message('zagreb:clock-dock',{},origin,{placement:'right'});
  assert.equal(docks.length,0);
  message('zagreb:clock-dock',frame.contentWindow,origin,{placement:'right'});
  assert.deepEqual(docks,['right']);
  board.studyAnalysis={available:true,fen:chess.fen(),lines:[]};
  board.dispatchEvent(new Event('analysis-change'));
  assert.deepEqual(sent.findLast(item=>item.message.type==='zagreb:overlay').message.analysis,board.studyAnalysis);

  board.dispatchEvent(new CustomEvent('clock-appearance-request',{detail:'zmf-pro-3d'}));
  assert.equal(sent.some(item=>item.message.type==='zagreb:clock-style'),false,'Wait for saved preferences before applying a requested clock');
  message('zagreb:clock-style-state',{},origin,{style:'dgt'});
  assert.equal(board.clockAppearance,undefined,'Foreign frames cannot supply a clock preference');
  message('zagreb:clock-style-state',frame.contentWindow,origin,{style:'dgt'});
  assert.deepEqual(sent.at(-1),{message:{type:'zagreb:clock-style',style:'zmf-pro-3d'},target:origin});
  message('zagreb:clock-style-state',frame.contentWindow,origin,{style:'zmf-pro-3d'});
  assert.equal(board.clockAppearance,'zmf-pro-3d');
  message('zagreb:clock-style-state',frame.contentWindow,origin,{style:'unknown-clock'});
  assert.equal(board.clockAppearance,'zmf-pro-3d','Invalid styles cannot replace a saved clock');
  assert.equal(controlsButton.disabled, true, 'Wait for saved settings before offering the toggle');
  message('zagreb:board-controls-state', {}, origin, {visible:false,ready:true});
  assert.equal(controlsButton.disabled, true, 'Ignore a state message from a foreign frame');
  message('zagreb:board-controls-state', frame.contentWindow, origin, {visible:false,ready:true});
  assert.equal(controlsButton.disabled, false);
  assert.equal(controlsButton.attributes['aria-label'], 'Show board controls');
  controlsButton.click();
  assert.deepEqual(sent.at(-1), {message:{type:'zagreb:board-controls',visible:true},target:origin});
  controlsButton.click();
  assert.equal(sent.at(-1).message.visible, false, 'The same accessible header button can hide and restore the row');
  message('zagreb:board-controls-state', frame.contentWindow, origin, {visible:true,ready:true});
  assert.equal(controlsButton.attributes['aria-label'], 'Hide board controls', 'Loading another saved view updates the header toggle');
  const positions = () => sent.filter(item => item.message.type === 'zagreb:position').map(item => item.message);
  const firstViewRevision = positions().at(-1).viewRevision;
  assert.equal(positions().at(-1).orientation, 'white');
  board.studyGraph = {available:true, enabled:true, visible:false, points:[{path:'ab', label:'1. e4',value:0,score:'0.00'}]};
  let graphClicks = 0, graphPath;
  board.goToPath = path => { graphPath = path; };
  graphButton.addEventListener('click', () => {
    graphClicks++; board.studyGraph.visible = !board.studyGraph.visible;
    board.dispatchEvent(new Event('graph-change'));
  });
  const graphRequest = {control:'graph', visible:true};
  message('zagreb:visibility', {}, origin, graphRequest);
  assert.equal(graphClicks, 0);
  message('zagreb:visibility', frame.contentWindow, origin, graphRequest);
  assert.equal(graphClicks, 1, 'The fullscreen toggle routes through the existing graph button');
  assert.equal(sent.findLast(item=>item.message.type === 'zagreb:overlay').message.graph.visible, true);
  message('zagreb:visibility', frame.contentWindow, origin, graphRequest);
  assert.equal(graphClicks, 1, 'An already visible graph is not toggled off by a repeated request');
  message('zagreb:navigate', frame.contentWindow, origin, {path:'ab'});
  assert.equal(graphPath, 'ab', 'Graph clicks can navigate its mainline even outside the displayed variation');
  board.studyGraph.enabled = false;
  message('zagreb:visibility', frame.contentWindow, origin, {control:'graph',visible:false});
  assert.equal(graphClicks, 1, 'Existing practice restrictions still control graph requests');
  board.studyGraph.visible = false;
  assert.deepEqual(clockMessages().at(-1), {message:{type:'zagreb:clock',...board.studyClock},target:origin});
  message('zagreb:clock-pause', {}, origin);
  message('zagreb:clock-pause', frame.contentWindow, 'https://other.example');
  assert.equal(pauseRequests, 0);
  message('zagreb:clock-pause');
  assert.equal(pauseRequests, 1);
  const hardwareRequests = [];
  board.setClockHardwareModel = family => hardwareRequests.push({family});
  board.clockHardwareInput = (key, phase) => hardwareRequests.push({key, phase});
  for (const [type, payload] of [
    ['zagreb:clock-hardware-model', {family:'dgt'}],
    ['zagreb:clock-hardware', {key:'menu', phase:'down'}],
  ]) {
    message(type, {}, origin, payload);
    message(type, frame.contentWindow, 'https://other.example', payload);
  }
  assert.equal(hardwareRequests.length, 0, 'Foreign frames cannot operate physical clock controls');
  message('zagreb:clock-hardware-model', frame.contentWindow, origin, {family:'dgt'});
  message('zagreb:clock-hardware', frame.contentWindow, origin, {key:'menu',phase:'down'});
  message('zagreb:clock-hardware', frame.contentWindow, origin, {key:'menu',phase:'up'});
  assert.deepEqual(hardwareRequests, [{family:'dgt'}, {key:'menu',phase:'down'}, {key:'menu',phase:'up'}]);
  toggle.click();
  assert.equal(controlsButton.hidden, true, 'Native 2D has no viewer toolbar to collapse');
  assert.equal(positions().at(-1).viewRevision, firstViewRevision, 'Hiding 3D does not request a camera change');
  const beforeHiddenTick = clockMessages().length;
  message('zagreb:clock-pause');
  message('zagreb:clock-design', {}, origin);
  assert.equal(designRequests, 0);
  message('zagreb:clock-design');
  assert.equal(designRequests, 1, 'The left clock can select a design while native 2D is active');
  board.studyClock = {...board.studyClock, whiteMs:280000, paused:true, running:null};
  board.dispatchEvent(new Event('clock-change'));
  assert.equal(pauseRequests, 2, 'The visible left-pane clock can pause while the board iframe is hidden');
  assert.equal(clockMessages().length, beforeHiddenTick + 1);
  assert.equal(clockMessages().at(-1).message.whiteMs, 280000, 'Native 2D keeps the shared clock current');
  let addedClocks = 0;
  board.addUntimedClock = () => addedClocks++;
  const addPayload = {requestId: 'add-clock-test'};
  message('zagreb:clock-add', {}, origin, addPayload);
  message('zagreb:clock-add', frame.contentWindow, 'https://other.example', addPayload);
  assert.equal(addedClocks, 0);
  message('zagreb:clock-add', frame.contentWindow, origin, addPayload);
  assert.equal(addedClocks, 1, 'Adding a count-up clock also works with the iframe hidden in native 2D');
  assert.equal(sent.at(-1).message.ok, true);
  board.addUntimedClock = () => { throw new Error('Wait for the position to finish loading.'); };
  message('zagreb:clock-add', frame.contentWindow, origin, addPayload);
  assert.equal(sent.at(-1).message.ok, false);
  const changes = [];
  board.setClockTimeControl = control => changes.push(control);
  const payload = {requestId: 'clock-test-1', control: {minutes: 10, incrementSeconds: 5}};
  message('zagreb:clock-control', {}, origin, payload);
  message('zagreb:clock-control', frame.contentWindow, 'https://other.example', payload);
  assert.equal(changes.length, 0, 'Foreign source/origin cannot reset the game clock');
  message('zagreb:clock-control', frame.contentWindow, origin, {...payload, control: {minutes: 0, incrementSeconds: 0}});
  assert.equal(changes.length, 0, 'Invalid values never reach the actual timekeeper');
  assert.equal(sent.at(-1).message.ok, false);
  message('zagreb:clock-control', frame.contentWindow, origin, payload);
  assert.deepEqual(changes, [payload.control], 'Native 2D can set the shared game time control');
  assert.deepEqual(sent.at(-1), {message: {type:'zagreb:clock-control-result', requestId:payload.requestId, ok:true}, target:origin});
  board.setClockTimeControl = () => { throw new Error('The timed game has stopped.'); };
  message('zagreb:clock-control', frame.contentWindow, origin, payload);
  assert.equal(sent.at(-1).message.ok, false, 'The viewer receives a failure if the game stops while editing');
  assert.equal(sent.at(-1).message.error, 'The timed game has stopped.');
  board.cg.state.orientation = 'black';
  toggle.click();
  assert.equal(controlsButton.hidden, false);
  assert.equal(positions().at(-1).orientation, 'black', 'Returning to 3D takes the current 2D side');
  assert.equal(positions().at(-1).viewRevision, firstViewRevision + 1);
  toggle.click(); toggle.click();
  assert.equal(positions().at(-1).viewRevision, firstViewRevision + 2,
    'Reentering with an unchanged side still corrects a freely rotated or restored 3D camera');
  assert.equal(clockMessages().at(-1).message.whiteMs, 280000, 'Returning to the viewer receives the latest parent time');
  board.studyClock = {...board.studyClock, whiteMs:278900, paused:false, running:'w'};
  board.dispatchEvent(new Event('clock-change'));
  assert.equal(clockMessages().at(-1).message.whiteMs, 278900);
});
