import test from 'node:test';
import assert from 'node:assert/strict';
import { probeEngine } from '../src/ai-coach.js';

test('a stalled lesson comparison times out and restores engine settings', async () => {
  class SilentEngine extends EventTarget {
    constructor() {
      super();
      this.multipv = 2;
      this.stopCalls = 0;
    }
    setMultiPV(value) { this.multipv = value; }
    stop() { this.stopCalls++; }
    start() {}
  }

  const engine = new SilentEngine();
  await assert.rejects(
    probeEngine(engine, '8/8/8/8/8/8/8/K6k w - - 0 1', 18, 3, 1, 15),
    /timed out/,
  );
  assert.equal(engine.multipv, 2);
  assert.ok(engine.stopCalls >= 2, 'initial stop plus timeout cleanup');
});
