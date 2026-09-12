import test from 'node:test';
import assert from 'node:assert/strict';
import { installBoardResizeHandle } from '../src/board-resize.js';

function fixture(split = true, nativeSquare = false) {
  const handle = new EventTarget(), blurTarget = new EventTarget();
  let capture = null, columnWidth = 573, squareWidth = 514, nextFrame = 0;
  const frames = new Map(), applied = [], finished = [];
  handle.setPointerCapture = id => { capture = id; };
  handle.hasPointerCapture = id => capture === id;
  handle.releasePointerCapture = () => { capture = null; };
  const boardElement = {
    getBoundingClientRect: () => ({ width: squareWidth }),
    parentElement: { getBoundingClientRect: () => ({ width: columnWidth }) },
  };
  installBoardResizeHandle({
    handle, boardElement, workspaceSplit: {
      isActive: () => split,
      ...(nativeSquare ? { getCornerSize: () => squareWidth } : {}),
    }, blurTarget,
    request: callback => { frames.set(++nextFrame, callback); return nextFrame; },
    cancel: id => frames.delete(id),
    onStart: () => {},
    onResize: width => { applied.push(width); if (split && !nativeSquare) columnWidth = width; else squareWidth = width; },
    onFinish: moved => finished.push({ moved, width: split && !nativeSquare ? columnWidth : squareWidth }),
  });
  return {
    applied, finished, frames, blurTarget,
    dimensions: () => ({ column: columnWidth, square: squareWidth }),
    pointer(type, x = 100, y = 100, id = 1) {
      const event = new Event(type, { cancelable: true });
      Object.assign(event, { clientX: x, clientY: y, pointerId: id, button: 0 });
      handle.dispatchEvent(event);
    },
    tick() { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(callback => callback()); },
  };
}

test('touching the corner without dragging preserves the divider preference', () => {
  const f = fixture();
  f.pointer('pointerdown');
  f.pointer('pointermove', 101, 102);
  f.pointer('pointerup', 101, 102);
  assert.deepEqual(f.applied, []);
  assert.deepEqual(f.finished, [{ moved: false, width: 573 }]);
});

test('a viewer column corner drag starts at the current column width', () => {
  const f = fixture();
  f.pointer('pointerdown');
  f.pointer('pointermove', 90, 90);
  f.tick();
  assert.deepEqual(f.applied, [563], 'A 10px drag moves the divider 10px, without snapping to the 514px square');
  f.pointer('pointerup', 90, 90);
  assert.deepEqual(f.finished, [{ moved: true, width: 563 }]);
});

test('native 2D resizes immediately inside a wider column without moving its divider', () => {
  const f = fixture(true, true);
  f.pointer('pointerdown');
  f.pointer('pointermove', 90, 90);
  f.pointer('pointerup', 90, 90);
  assert.deepEqual(f.dimensions(), { column: 573, square: 504 });
  assert.deepEqual(f.finished, [{ moved: true, width: 504 }]);
  f.pointer('pointerdown');
  f.pointer('pointermove', 110, 110);
  f.pointer('pointerup', 110, 110);
  assert.deepEqual(f.dimensions(), { column: 573, square: 514 });
});

test('corner resize coalesces moves and commits the last pending width before saving', () => {
  const f = fixture();
  f.pointer('pointerdown');
  f.pointer('pointermove', 110, 110);
  f.pointer('pointermove', 120, 120);
  assert.equal(f.frames.size, 1);
  f.pointer('pointerup', 120, 120);
  assert.deepEqual(f.applied, [593]);
  assert.deepEqual(f.finished, [{ moved: true, width: 593 }]);
  assert.equal(f.frames.size, 0, 'No late frame can change the saved result');
});

test('non-split resizing uses the square and cancelled drags cannot keep resizing', () => {
  const f = fixture(false);
  f.pointer('pointerdown');
  f.pointer('pointermove', 180, 180, 2);
  f.pointer('pointerup', 180, 180, 2);
  assert.deepEqual(f.applied, []);
  f.pointer('pointermove', 120, 120);
  f.pointer('pointercancel', 120, 120);
  assert.deepEqual(f.finished, [{ moved: true, width: 534 }]);
  f.pointer('pointermove', 150, 150);
  f.tick();
  assert.deepEqual(f.applied, [534]);
  f.pointer('pointerdown');
  f.pointer('pointermove', 105, 105);
  f.blurTarget.dispatchEvent(new Event('blur'));
  assert.deepEqual(f.finished.at(-1), { moved: true, width: 539 });
});
