import test from "node:test";
import assert from "node:assert/strict";
import { createClockHardwareBridge } from "../src/clock-hardware-bridge.js";
function harness() {
  let at = 1000,
    turn = "w",
    flags = [];
  const clock = {
    active: true,
    paused: false,
    mode: "down",
    msWhite: 300000,
    msBlack: 300000,
    incMs: 3000,
    initialMs: 300000,
    tickingFor: "w",
  };
  const b = createClockHardwareBridge({
    clock,
    turn: () => turn,
    now: () => at,
    render() {},
    expired: (side) => flags.push(side),
    storage: {
      getItem() {
        return null;
      },
      setItem() {},
    },
  });
  return {
    b,
    clock,
    flags,
    advance: (ms) => {
      at += ms;
      b.tick();
    },
    turn: (side) => (turn = side),
  };
}
test("one timer; physical press cannot award a second increment", () => {
  const h = harness();
  h.b.model("dgt");
  h.advance(1000);
  assert.equal(h.clock.msWhite, 299000);
  h.turn("b");
  h.b.moved();
  assert.equal(h.clock.msWhite, 302000);
  assert.equal(h.clock.tickingFor, "b");
  h.b.input("right", "down");
  h.b.input("right", "up");
  assert.equal(h.clock.msWhite, 302000);
  assert.equal(h.clock.tickingFor, "b");
});
test("paused hold opens correction without charging time", () => {
  const h = harness();
  h.b.model("dgt");
  h.b.input("menu", "down");
  h.b.input("menu", "up");
  assert.equal(h.clock.paused, true);
  const time = h.clock.msWhite;
  h.b.input("menu", "down");
  h.advance(3000);
  h.b.input("menu", "up");
  assert.equal(h.clock.hardware.display.editing, true);
  assert.equal(h.clock.msWhite, time);
  h.b.input("plus", "down");
  h.b.input("plus", "up");
  h.b.input("menu", "down");
  h.b.input("menu", "up");
  assert.equal(h.clock.msBlack, 3900000);
  assert.equal(h.clock.paused, true);
});
test("changing cases keeps remaining time and running side", () => {
  const h = harness();
  h.b.model("dgt");
  h.advance(2000);
  h.b.model("zmf");
  assert.equal(h.clock.msWhite, 298000);
  assert.equal(h.clock.tickingFor, "w");
  h.advance(2000);
  assert.equal(h.clock.msWhite, 296000);
});
test("flag fall reports once", () => {
  const h = harness();
  h.clock.msWhite = 50;
  h.b.model("dgt");
  h.advance(100);
  h.advance(100);
  assert.deepEqual(h.flags, ["white"]);
});
test("untimed clock counts upwards without flagging", () => {
  const h = harness();
  Object.assign(h.clock, { mode: "up", msWhite: 0, msBlack: 0, initialMs: 0, incMs: 0 });
  h.b.model("zmf");
  h.advance(2000);
  assert.equal(h.clock.msWhite, 2000);
  assert.deepEqual(h.flags, []);
});
test("invalid input ignored; disconnect preserves state", () => {
  const h = harness();
  h.b.model("dgt");
  h.b.input("evil", "down");
  h.b.input("power", "bad");
  h.advance(1000);
  h.b.model(undefined);
  assert.equal(h.clock.msWhite, 299000);
  assert.equal(h.b.active, false);
  assert.equal(h.clock.hardware, undefined);
});
