import test from 'node:test';
import assert from 'node:assert/strict';

import { Engine } from '../src/engine.js';

const FEN_A = '8/8/8/8/8/8/4P3/K6k w - - 0 1';
const FEN_B = '8/8/8/8/8/4P3/8/K6k b - - 0 1';

class FakeWorker extends EventTarget {
  constructor() {
    super();
    this.messages = [];
    this.onPost = null;
    this.terminated = false;
  }

  postMessage(message) {
    this.messages.push(message);
    this.onPost?.(message);
  }

  emit(line) {
    this.dispatchEvent(new MessageEvent('message', { data: line }));
  }

  terminate() {
    this.terminated = true;
  }
}

function readyEngine() {
  const engine = new Engine();
  const worker = new FakeWorker();
  engine.worker = worker;
  engine.ready = true;
  engine.uciokReceived = true;
  engine.flavor = 'lichess-full';
  engine._workerGeneration = 1;
  return { engine, worker };
}

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

test('quiesce discards obsolete queued analysis and blocks successor starts until idle', async () => {
  const { engine, worker } = readyEngine();
  engine.start(FEN_A, { infinite: true });

  // Simulate a navigation callback that was already queued before Practice.
  engine.start(FEN_B, { depth: 8 });
  assert.ok(engine._pendingRequest);

  const idle = engine.quiesce({ timeoutMs: 100, discardPending: true });
  assert.equal(engine._pendingRequest, null);
  assert.equal(
    engine.start('8/8/8/8/8/8/3P4/K6k w - - 0 1', { depth: 6 }),
    false,
    'late analysis must not enter the queue during the idle transition',
  );

  engine._handleLine('bestmove e2e4');
  const result = await idle;
  assert.deepEqual(result, {
    ok: true,
    status: 'idle',
    searchId: 1,
    generation: 1,
  });
  assert.equal(engine.searching, false);
  assert.equal(engine._bestmoveAwaited, false);
  assert.equal(engine._pendingRequest, null);
  assert.equal(
    worker.messages.some(message => message === `position fen ${FEN_B}`),
    false,
    'discarded pre-Practice position must never launch',
  );
  engine.terminate();
});

test('quiesce times out without pretending the worker is idle', async () => {
  const { engine } = readyEngine();
  engine.start(FEN_A, { infinite: true });
  const result = await engine.quiesce({ timeoutMs: 10, discardPending: true });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'timeout');
  assert.equal(engine.searching, true, 'only recovery/termination may clear a timed-out live search');
  engine.terminate();
});

test('quiet infinite analysis that answers readyok is preserved', async () => {
  const { engine, worker } = readyEngine();
  engine._infiniteStallMs = 8;
  engine._livenessTimeoutMs = 8;
  let crashes = 0;
  engine.addEventListener('engine-crashed', () => { crashes++; });
  worker.onPost = (message) => {
    if (message === 'isready') setTimeout(() => worker.emit('readyok'), 0);
  };

  engine.start(FEN_A, { infinite: true });
  engine._handleLine('info depth 12 score cp 10 nodes 100 time 10 pv e2e4');
  await wait(24);

  assert.ok(worker.messages.includes('isready'), 'quiet search must receive a liveness challenge');
  assert.equal(crashes, 0);
  assert.equal(engine.searching, true);
  assert.equal(engine._bestmoveAwaited, true);
  engine.terminate();
});

test('quiet infinite analysis is recovered only after its liveness probe fails', async () => {
  const { engine, worker } = readyEngine();
  engine._infiniteStallMs = 6;
  engine._livenessTimeoutMs = 6;
  let crashes = 0;
  engine.addEventListener('engine-crashed', () => { crashes++; });

  engine.start(FEN_A, { infinite: true });
  engine._handleLine('info depth 12 score cp 10 nodes 100 time 10 pv e2e4');
  await wait(24);

  assert.ok(worker.messages.includes('isready'));
  assert.equal(crashes, 1);
  assert.equal(engine.searching, false);
  assert.equal(engine._bestmoveAwaited, false);
  engine.terminate();
});

test('analyseMove waits for the old bestmove and uses the normal single-flight search', async () => {
  const { engine, worker } = readyEngine();
  engine.multipv = 3;
  engine.start(FEN_A, { infinite: true });

  const resultPromise = engine.analyseMove(FEN_B, 'h1h2', 14);
  assert.equal(
    worker.messages.includes(`position fen ${FEN_B}`),
    false,
    'specific-move search must not overlap the existing search',
  );

  // Flush result from the old free-analysis search. The wrapper suppresses
  // this event and only now launches the queued searchmoves request.
  engine._handleLine('bestmove e2e4');
  assert.ok(worker.messages.includes(`position fen ${FEN_B}`));
  assert.ok(worker.messages.includes('go depth 14 searchmoves h1h2'));

  engine._handleLine('info depth 14 score cp -25 nodes 1000 time 20 pv h1h2');
  engine._handleLine('bestmove h1h2');
  const result = await resultPromise;

  assert.equal(result.best, 'h1h2');
  assert.equal(result.topMoves[0].pv[0], 'h1h2');
  assert.equal(engine.multipv, 3, 'the user-selected line count must be restored');
  assert.equal(engine._pendingGos, 0);
  engine.terminate();
});
