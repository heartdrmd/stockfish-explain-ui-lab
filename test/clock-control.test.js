import test from 'node:test';
import assert from 'node:assert/strict';
import { readClockControl, resetClockControl } from '../src/generated/clock-control.js';

const currentClock = () => ({active: true, mode: 'down', paused: true, timerId: 0,
  initialMs: 300000, msWhite: 243000, msBlack: 289000, incMs: 3000,
  tickingFor: 'w', lastTickAt: 1000, style: 'atelier'});

test('changing time control resets both actual clocks and preserves running/paused state', () => {
  for (const paused of [true, false]) {
    for (const turn of ['w', 'b']) {
      const clock = {...currentClock(), paused, timerId: paused ? 0 : 42};
      const control = resetClockControl(clock, {minutes: 10, incrementSeconds: 5}, turn, 5678);
      assert.deepEqual(control, {minutes: 10, incrementSeconds: 5});
      assert.deepEqual(clock, {...currentClock(), paused, timerId: paused ? 0 : 42,
        initialMs: 600000, msWhite: 600000, msBlack: 600000, incMs: 5000,
        tickingFor: turn, lastTickAt: 5678});
    }
  }
  const clock = currentClock();
  resetClockControl(clock, {minutes: 1, incrementSeconds: 0}, 'w', 6000);
  assert.equal(clock.incMs, 0, 'A zero increment replaces the old increment');
});

test('invalid, stopped or untimed controls are rejected before changing any clock state', () => {
  for (const value of [null, {}, {minutes: '5', incrementSeconds: 3},
    {minutes: 0, incrementSeconds: 3}, {minutes: 1000, incrementSeconds: 3},
    {minutes: 2.5, incrementSeconds: 3}, {minutes: NaN, incrementSeconds: 3},
    {minutes: 5, incrementSeconds: -1}, {minutes: 5, incrementSeconds: 61},
    {minutes: 5, incrementSeconds: 2.5}, {minutes: 5, incrementSeconds: Infinity}]) {
    const clock = currentClock();
    assert.equal(readClockControl(value), null);
    assert.throws(() => resetClockControl(clock, value, 'w', 6000));
    assert.deepEqual(clock, currentClock());
  }
  for (const overrides of [{active: false}, {mode: 'up'}]) {
    const clock = {...currentClock(), ...overrides};
    assert.throws(() => resetClockControl(clock, {minutes: 5, incrementSeconds: 3}, 'w', 6000));
    assert.deepEqual(clock, {...currentClock(), ...overrides});
  }
  for (const [turn, now] of [['x', 6000], ['w', NaN]]) {
    const clock = currentClock();
    assert.throws(() => resetClockControl(clock, {minutes: 5, incrementSeconds: 3}, turn, now));
    assert.deepEqual(clock, currentClock());
  }
  assert.deepEqual(readClockControl({minutes: 999, incrementSeconds: 60}), {minutes: 999, incrementSeconds: 60});
});
