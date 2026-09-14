import test from "node:test";
import assert from "node:assert/strict";
import { fitClockArea, visibleBoardRight } from "../src/clock-safe-area.js";
test("saved positions and oversized clocks stay outside board across available widths", () => {
  for (const left of [500, 900, 1250, 1390])
    for (const x of [-5000, 0, 900, 5000]) {
      const area = {
        left,
        right: 1400,
        top: 100,
        bottom: 850,
        width: 850,
        height: 540,
        x,
        y: -800,
      };
      const fit = fitClockArea(area);
      assert.ok(fit.left >= left);
      assert.ok(fit.left + fit.width <= 1400.001);
      assert.ok(fit.top >= 100);
      assert.ok(fit.top + fit.height <= 850.001);
      assert.ok(fit.scale <= 1);
      assert.ok(Math.abs(fit.width / fit.height - 850 / 540) < 1e-12);
    }
});
test("clock retains requested position when enough space exists and collapses at zero space", () => {
  const area = {
    left: 1000,
    right: 1600,
    top: 60,
    bottom: 1000,
    width: 300,
    height: 220,
    x: 1100,
    y: 120,
  };
  assert.deepEqual(fitClockArea(area), { left: 1100, top: 120, width: 300, height: 220, scale: 1 });
  assert.equal(fitClockArea({ ...area, left: 1600 }).width, 0);
});
test("clock boundary follows projected 3D board, translated native 2D board, and safe loading fallback", () => {
  const board = { getBoundingClientRect: () => ({ right: 920 }) };
  const frame = {
    hidden: false,
    getBoundingClientRect: () => ({ left: 200, right: 1100, width: 900 }),
  };
  const doc = { getElementById: (id) => (id === "zagreb-board" ? frame : board) };
  assert.equal(
    visibleBoardRight(doc),
    1100,
    "Until model loading completes, protect entire iframe",
  );
  frame.boardFootprint = [
    { x: 10, y: 50 },
    { x: 600, y: 70 },
    { x: 800, y: 500 },
  ];
  assert.equal(visibleBoardRight(doc), 1000);
  frame.boardFootprint = [{ x: 1400, y: 0 }];
  assert.equal(visibleBoardRight(doc), 1100, "Offscreen projection clamps to visible frame");
  frame.hidden = true;
  assert.equal(visibleBoardRight(doc), 920);
});
