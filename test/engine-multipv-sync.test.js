import test from 'node:test';
import assert from 'node:assert/strict';

import { Engine } from '../src/engine.js';

test('every new search reasserts the selected MultiPV before position/go', () => {
  const messages = [];
  const engine = new Engine();
  engine.ready = true;
  engine.multipv = 3;
  engine._sentOptions = new Map([['MultiPV', '3']]);
  engine.worker = {
    postMessage(message) { messages.push(message); },
    terminate() {},
  };

  // Simulate the failure mode: the memo/UI both already say 3, so an
  // ordinary memoized setter would skip the command even if a cancelled
  // temporary probe had left the actual Stockfish worker at MultiPV 1.
  engine._doStart('8/8/8/8/8/8/8/K6k w - - 0 1', { infinite: true });

  assert.deepEqual(messages.slice(0, 3), [
    'setoption name MultiPV value 3',
    'position fen 8/8/8/8/8/8/8/K6k w - - 0 1',
    'go infinite',
  ]);

  engine.terminate();
});
