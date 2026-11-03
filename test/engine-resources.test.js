import test from 'node:test';
import assert from 'node:assert/strict';
import { Engine, ENGINE_FLAVORS } from '../src/engine.js';
import { isComputerBrowser, computerThreadPolicy, clampComputerThreads, readComputerThreads, saveComputerThreads, readCpuGuardDiagnostics } from '../src/engine-resources.js';

const mac = { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', platform: 'MacIntel', maxTouchPoints: 0, hardwareConcurrency: 16 };
const fen = '8/8/8/8/8/8/4P3/K6k w - - 0 1';

function readyEngine(t, nav = mac) {
  const prior = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: nav });
  t.after(() => prior ? Object.defineProperty(globalThis, 'navigator', prior) : delete globalThis.navigator);
  const messages = [];
  const engine = new Engine();
  engine.worker = { postMessage: message => messages.push(message), terminate() {} };
  engine.ready = engine.uciokReceived = true;
  engine.flavor = 'lichess-full';
  engine.activeNet = 'big';
  t.after(() => engine.terminate());
  return { engine, messages };
}

test('desktop policy leaves headroom even on small CPUs and respects the WASM ceiling', () => {
  for (let cores = 1; cores <= 256; cores++) {
    const p = computerThreadPolicy(cores);
    assert.ok(p.default >= 1 && p.default <= p.max && p.max <= 32);
    if (cores >= 2) assert.ok(p.max < cores);
    if (cores >= 3) assert.ok(p.max <= cores - 2);
    if (cores >= 2) assert.ok(p.max <= Math.floor(cores * .75));
  }
  assert.deepEqual(computerThreadPolicy(16), { cores: 16, default: 6, max: 12 });
  assert.deepEqual(computerThreadPolicy(18), { cores: 18, default: 6, max: 13 });
  assert.deepEqual(computerThreadPolicy(64), { cores: 64, default: 6, max: 32 });
  for (const bad of [null, 0, -4, NaN, Infinity, 'bad']) assert.equal(computerThreadPolicy(bad).cores, 4);
});

function preferenceStorage(t) {
  const prior = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const data = new Map();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
  } });
  t.after(() => prior ? Object.defineProperty(globalThis, 'localStorage', prior) : delete globalThis.localStorage);
  return data;
}

test('computer preference defaults to six and remembers explicit nine or six', t => {
  const { engine } = readyEngine(t);
  preferenceStorage(t);
  assert.equal(readComputerThreads(), 6);
  saveComputerThreads(9);
  assert.equal(readComputerThreads(), 9);
  engine.setThreads(2);
  assert.equal(readComputerThreads(), 9, 'temporary engine settings do not overwrite preference');
  engine.flavor = 'lite-single';
  engine.setThreads(readComputerThreads());
  assert.equal(engine.threads, 1);
  assert.equal(readComputerThreads(), 9, 'single-thread fallback does not erase preference');
  saveComputerThreads(6);
  assert.equal(readComputerThreads(), 6);
});

test('invalid saved values fall back safely; a different computer clamps the saved choice', t => {
  readyEngine(t);
  const data = preferenceStorage(t);
  const key = 'stockfish-explain.computer-threads.v1';
  for (const value of ['', '0', '-2', '9.5', 'NaN', 'Infinity', 'bad']) {
    data.set(key, value);
    assert.equal(readComputerThreads(), 6);
  }
  data.set(key, '32');
  assert.equal(readComputerThreads(computerThreadPolicy(18)), 13);
  assert.equal(readComputerThreads(computerThreadPolicy(4)), 2);
  assert.equal(data.get(key), '32', 'reading on a smaller device does not overwrite the preference');
});

test('blocked browser storage never prevents the default or engine setting', t => {
  readyEngine(t);
  preferenceStorage(t);
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('storage blocked'); } });
  assert.equal(readComputerThreads(), 6);
  assert.doesNotThrow(() => saveComputerThreads(9));
});

test('Vision/mobile paths never read or save the computer thread preference', t => {
  readyEngine(t, { ...mac, userAgent: 'AtelierVision visionOS', maxTouchPoints: 5 });
  const data = preferenceStorage(t);
  data.set('stockfish-explain.computer-threads.v1', '9');
  assert.equal(readComputerThreads(), undefined);
  saveComputerThreads(6);
  assert.equal(data.get('stockfish-explain.computer-threads.v1'), '9');
});

test('invalid or oversized restored preferences cannot exceed the ceiling', () => {
  const p = computerThreadPolicy(18);
  for (const n of [32, 999, Infinity, NaN, undefined, 'oops', -5, 0, 12.9]) {
    const result = clampComputerThreads(n, p);
    assert.ok(Number.isInteger(result) && result >= 1 && result <= 13);
  }
});

test('computer detection excludes mobile and spatial identities', () => {
  assert.equal(isComputerBrowser(mac), true);
  assert.equal(isComputerBrowser({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }), true);
  assert.equal(isComputerBrowser({ userAgent: 'Mozilla/5.0 (X11; Linux x86_64)' }), true);
  for (const ua of ['iPhone', 'iPad', 'Android Linux', 'Macintosh visionOS', 'Macintosh AtelierVision', 'VisionPro']) {
    assert.equal(isComputerBrowser({ ...mac, userAgent: ua }), false);
  }
  assert.equal(isComputerBrowser({ ...mac, maxTouchPoints: 5 }), false);
  assert.equal(isComputerBrowser(null), false);
});

test('all desktop engine flavors enforce the cap without changing their network or skill', t => {
  const { engine, messages } = readyEngine(t);
  for (const [flavor, spec] of Object.entries(ENGINE_FLAVORS)) {
    engine.flavor = flavor;
    engine.setThreads(128);
    const wanted = spec.threaded ? 12 : 1;
    assert.equal(engine.threads, wanted);
    assert.equal(messages.at(-1), `setoption name Threads value ${wanted}`);
    assert.equal(engine.flavor, flavor);
    assert.equal(engine.skill, 20);
    assert.equal(engine.activeNet, 'big');
  }
});

test('worker-boundary guard also clamps direct writes and restores', t => {
  const { engine, messages } = readyEngine(t);
  engine._send('setoption name Threads value 128');
  assert.equal(messages.at(-1), 'setoption name Threads value 12');
  engine._pendingOpts = { threads: 64 };
  engine._applyPending();
  assert.equal(messages.at(-1), 'setoption name Threads value 12');
});

test('changing the thread setting waits for real idle without interrupting analysis', t => {
  const { engine, messages } = readyEngine(t);
  engine.start(fen, { infinite: true });
  const before = messages.length;
  engine.setThreads(100);
  assert.equal(engine.searching, true);
  assert.equal(messages.length, before, 'no stop or option write mid-search');
  assert.equal(engine._pendingOpts.threads, 12);
  engine._handleLine('bestmove e2e4');
  assert.equal(messages.at(-1), 'setoption name Threads value 12');
});

test('infinite analysis remains one continuous go through repeated healthy updates', t => {
  const { engine, messages } = readyEngine(t);
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  t.after(() => t.mock.timers.reset());
  engine.setThreads(100);
  engine.start(fen, { infinite: true });
  for (let seconds = 0; seconds < 600; seconds += 5) {
    t.mock.timers.tick(5000);
    engine._handleLine(`info depth ${10 + seconds / 5} score cp 10 nodes 1000 time ${seconds * 1000} pv e2e4`);
  }
  assert.deepEqual(messages.filter(m => m.startsWith('go')), ['go infinite']);
  assert.equal(messages.includes('stop'), false, 'no cooling pauses or periodic restarts');
  assert.equal(engine.searching, true);
  assert.equal(engine.flavor, 'lichess-full');
  engine.terminate();
});

test('practice search keeps its original time and depth limits', t => {
  const { engine, messages } = readyEngine(t);
  engine.setThreads(100);
  engine.start(fen, { depth: 22, movetime: 12000 });
  assert.equal(messages.at(-1), 'go depth 22 movetime 12000');
  assert.equal(engine.skill, 20);
});

test('Vision/mobile engine path is unchanged', t => {
  const { engine, messages } = readyEngine(t, { ...mac, userAgent: 'AtelierVision visionOS', maxTouchPoints: 5 });
  engine.setThreads(16);
  assert.equal(messages.at(-1), 'setoption name Threads value 16');
  engine.start(fen, { infinite: true });
  assert.equal(messages.at(-1), 'go infinite');
});

test('private diagnostics stay bounded and exclude positions and account data', t => {
  const { engine } = readyEngine(t);
  const prior = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const data = new Map();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: k => data.get(k), setItem: (k, v) => data.set(k, v) } });
  t.after(() => prior ? Object.defineProperty(globalThis, 'localStorage', prior) : delete globalThis.localStorage);
  for (let n = 0; n < 110; n++) engine._send('setoption name Threads value 128');
  const records = readCpuGuardDiagnostics();
  assert.equal(records.length, 100);
  assert.ok(records.every(r => r.id === engine._cpuGuardId && r.applied === 12));
  assert.equal(JSON.stringify(records).includes(fen), false);
  assert.deepEqual(Object.keys(records[0]).sort(), ['applied','at','continuous','cores','id','max','requested','stage']);
});
