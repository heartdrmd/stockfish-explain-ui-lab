import test from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from '../vendor/chess.js/chess.js';
import { install3DBoard } from '../src/board-3d.js';

test('shared clocks use parent time in both board modes and reject foreign controls', t => {
  class Element extends EventTarget {
    style = {};
    children = [];
    classList = { toggle() {}, contains: () => false };
    setAttribute() {}
    prepend(child) { this.children.unshift(child); }
    append(child) { this.children.push(child); }
    insertBefore(child) { this.children.push(child); }
    click() { this.dispatchEvent(new Event('click')); }
  }
  const area = new Element(), nav = new Element(), root = new Element();
  area.querySelector = () => nav;
  root.parentElement = area;
  root.offsetWidth = 640;
  root.offsetHeight = 640;
  const sent = [], frames = [];
  const windowTarget = new EventTarget();
  const origin = 'https://chess.example';
  const globals = {
    document: {
      body: new Element(), querySelector: () => null, getElementById: () => null,
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
  assert.deepEqual(clockMessages().at(-1), {message:{type:'zagreb:clock',...board.studyClock},target:origin});
  message('zagreb:clock-pause', {}, origin);
  message('zagreb:clock-pause', frame.contentWindow, 'https://other.example');
  assert.equal(pauseRequests, 0);
  message('zagreb:clock-pause');
  assert.equal(pauseRequests, 1);
  toggle.click();
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
  toggle.click();
  assert.equal(clockMessages().at(-1).message.whiteMs, 280000, 'Returning to the viewer receives the latest parent time');
  board.studyClock = {...board.studyClock, whiteMs:278900, paused:false, running:'w'};
  board.dispatchEvent(new Event('clock-change'));
  assert.equal(clockMessages().at(-1).message.whiteMs, 278900);
});
