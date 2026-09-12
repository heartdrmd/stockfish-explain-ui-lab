import test from 'node:test';
import assert from 'node:assert/strict';
import { frameUpdate, isResizeObserverNotification } from '../src/resize-observer.js';

test('resize layout writes wait for a frame and use the latest measurements once', () => {
  const frames = new Map(); let id = 0, width = 500, writes = [];
  const schedule = frameUpdate(() => writes.push(width), callback => {
    frames.set(++id, callback); return id;
  }, frame => frames.delete(frame));
  schedule(); width = 420; schedule(); width = 650; schedule();
  assert.deepEqual(writes, [], 'No layout mutation during ResizeObserver delivery');
  assert.equal(frames.size, 1);
  frames.get(1)(); frames.delete(1);
  assert.deepEqual(writes, [650]);
  schedule(); schedule.cancel();
  assert.equal(frames.size, 0, 'Teardown removes pending work');
  schedule(); frames.get(3)();
  assert.deepEqual(writes, [650, 650]);
});

test('only browser resize delivery notifications bypass the fatal banner', () => {
  const message = 'ResizeObserver loop completed with undelivered notifications.';
  assert.equal(isResizeObserverNotification({ message, lineno: 0, colno: 0, error: null }), true);
  assert.equal(isResizeObserverNotification({ message: 'ResizeObserver loop limit exceeded' }), true);
  assert.equal(isResizeObserverNotification({ message, error: new Error(message) }), false);
  assert.equal(isResizeObserverNotification({ message, lineno: 40 }), false);
  assert.equal(isResizeObserverNotification({ message: 'Cannot read properties of undefined' }), false);
  assert.equal(isResizeObserverNotification({ message: 'ResizeObserver is not defined' }), false);
});
