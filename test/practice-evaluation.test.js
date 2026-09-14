import test from "node:test";
import assert from "node:assert/strict";
import { PracticeEvaluation, evaluationFromEngine } from "../src/practice-evaluation.js";

const WHITE = "8/8/8/8/8/8/4P3/K6k w - - 0 1";
const BLACK = "8/8/8/8/8/4P3/8/K6k b - - 0 1";
class FakeEngine extends EventTarget {
  ready = false;
  currentFen = "";
  topMoves = new Map();
  starts = [];
  settings = [];
  terminated = 0;
  boot(options) {
    this.options = options;
    return new Promise((resolve, reject) => {
      this.finishBoot = () => {
        this.ready = true;
        resolve();
      };
      this.failBoot = reject;
    });
  }
  setMultiPV(v) {
    this.settings.push(["multipv", v]);
  }
  setSkill(v) {
    this.settings.push(["skill", v]);
  }
  setThreads(v) {
    this.settings.push(["threads", v]);
  }
  setHash(v) {
    this.settings.push(["hash", v]);
  }
  start(fen, limits) {
    this.starts.push({ fen, limits });
    this.currentFen = fen;
    this.topMoves.clear();
  }
  terminate() {
    this.terminated++;
    this.ready = false;
    this.dispatchEvent(new Event("engine-terminated"));
  }
  result(fen, score, extra = {}) {
    this.currentFen = fen;
    this.topMoves.set(1, { score, scoreKind: "cp", depth: 15, ...extra });
    this.dispatchEvent(new Event("thinking"));
  }
}
function setup() {
  const engines = [],
    states = [];
  const runner = new PracticeEvaluation(
    () => {
      const e = new FakeEngine();
      engines.push(e);
      return e;
    },
    (s) => states.push(s),
  );
  const update = (fen = WHITE, extra = {}) =>
    runner.update({ enabled: true, fen, flavor: "lichess-full", ...extra });
  return { engines, states, runner, update };
}
test("practice evaluation uses best line at exact FEN, rejects bounds, and converts to White perspective", () => {
  const e = new FakeEngine();
  e.currentFen = BLACK;
  e.topMoves.set(2, { score: 900, scoreKind: "cp" });
  assert.equal(evaluationFromEngine(e, BLACK), null);
  e.topMoves.set(1, { score: -170, scoreKind: "cp", depth: 12 });
  assert.deepEqual(evaluationFromEngine(e, BLACK), { cp: 170, mate: null, depth: 12 });
  assert.equal(evaluationFromEngine(e, WHITE), null);
  e.topMoves.set(1, { score: 5, scoreKind: "mate", depth: 19 });
  assert.deepEqual(evaluationFromEngine(e, BLACK), { cp: null, mate: -5, depth: 19 });
  e.topMoves.set(1, { score: 200, scoreKind: "cp", bound: "lowerbound" });
  assert.equal(evaluationFromEngine(e, BLACK), null);
});
test("display search is bounded, strongest skill, one thread and independent from opponent limits", async () => {
  const s = setup();
  s.update();
  const e = s.engines[0];
  assert.deepEqual(e.options, { flavor: "lichess-full", threads: 1 });
  assert.equal(e.backgroundEvaluation, true);
  assert.equal(s.states.at(-1).evaluation, null);
  e.finishBoot();
  await Promise.resolve();
  assert.deepEqual(e.settings, [
    ["multipv", 1],
    ["skill", 20],
    ["threads", 1],
    ["hash", 32],
  ]);
  assert.deepEqual(e.starts, [{ fen: WHITE, limits: { depth: 20, movetime: 1500 } }]);
  s.update();
  assert.equal(e.starts.length, 1, "Same FEN is not repeatedly searched");
  e.result(WHITE, 125);
  assert.equal(s.states.at(-1).evaluation.cp, 125);
  s.update(BLACK);
  assert.equal(s.engines.length, 1, "Moves reuse the worker");
  assert.equal(s.states.at(-1).evaluation, null, "Old score is not shown for a new position");
  const count = s.states.length;
  e.result(WHITE, 999);
  assert.equal(s.states.length, count, "Late prior-position scores are ignored");
  e.result(BLACK, -200);
  assert.equal(s.states.at(-1).evaluation.cp, 200);
  s.runner.stop();
  assert.equal(e.terminated, 1);
  assert.deepEqual(s.states.at(-1), { active: false });
});
test("rapid moves while booting search only latest position; hiding prevents late boot/results", async () => {
  const s = setup();
  s.update();
  s.update(BLACK);
  const e = s.engines[0];
  e.finishBoot();
  await Promise.resolve();
  assert.equal(e.starts.length, 1);
  assert.equal(e.starts[0].fen, BLACK);
  s.update(BLACK, { enabled: false });
  const count = s.states.length;
  e.result(BLACK, 99);
  assert.equal(s.states.length, count);
  s.update();
  const next = s.engines[1];
  s.runner.stop();
  next.finishBoot();
  await Promise.resolve();
  assert.equal(next.starts.length, 0);
});
test("flavor switches discard old worker/cache and failures report unavailable with clean retry", async () => {
  const s = setup();
  s.update();
  const first = s.engines[0];
  first.finishBoot();
  await Promise.resolve();
  first.result(WHITE, 80);
  s.update(WHITE, { flavor: "avrukh" });
  assert.equal(first.terminated, 1);
  assert.equal(s.states.at(-1).evaluation, null);
  const second = s.engines[1];
  second.finishBoot();
  await Promise.resolve();
  second.dispatchEvent(new Event("engine-crashed"));
  assert.equal(s.states.at(-1).status, "Evaluation unavailable");
  assert.equal(second.terminated, 1);
  s.runner.stop();
  s.update();
  const third = s.engines[2];
  third.failBoot(Error("boot failure"));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(s.states.at(-1).status, "Evaluation unavailable");
  s.runner.stop();
});
