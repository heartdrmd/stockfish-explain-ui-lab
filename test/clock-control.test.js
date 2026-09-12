import test from 'node:test';
import assert from 'node:assert/strict';
import { readClockControl, resetClockControl, startUntimedDisplay, usesClockBudget } from '../src/generated/clock-control.js';

const currentClock = () => ({active: true, mode: 'down', paused: true, timerId: 0,
  initialMs: 300000, msWhite: 243000, msBlack: 289000, incMs: 3000,
  tickingFor: 'w', lastTickAt: 1000, style: 'atelier'});

test('an optional untimed display cannot supply game timing limits or replace a running clock', () => {
  for (const turn of ['w', 'b']) {
    const clock = {...currentClock(), active: false};
    startUntimedDisplay(clock, turn, 6789);
    assert.equal(clock.mode, 'up');
    assert.equal(clock.paused, false);
    assert.equal(clock.displayOnly, true);
    assert.equal(clock.tickingFor, turn);
    assert.equal(clock.lastTickAt, 6789);
    assert.equal(clock.msWhite, 0);
    assert.equal(clock.msBlack, 0);
    assert.equal(clock.incMs, 0);
    assert.equal(clock.initialMs, 0);
    assert.equal(usesClockBudget(clock), false);
    const before = {...clock};
    assert.throws(() => startUntimedDisplay(clock, turn, 9000));
    assert.deepEqual(clock, before, 'A repeated Add request cannot reset the running counter');
  }
  const timed = currentClock();
  assert.throws(() => startUntimedDisplay(timed, 'w', 6000));
  assert.deepEqual(timed, currentClock(), 'A countdown and its increment are preserved');
  assert.equal(usesClockBudget(timed), true);
  for (const [turn, now] of [['x', 1000], ['w', NaN]]) {
    const stopped = {...currentClock(), active: false};
    assert.throws(() => startUntimedDisplay(stopped, turn, now));
    assert.deepEqual(stopped, {...currentClock(), active: false});
  }
});

test('changing time control resets both actual clocks and preserves running/paused state', () => {
  for (const paused of [true, false]) {
    for (const turn of ['w', 'b']) {
      const clock = {...currentClock(), paused, timerId: paused ? 0 : 42};
      const control = resetClockControl(clock, {minutes: 10, incrementSeconds: 5}, turn, 5678);
      assert.deepEqual(control, {minutes: 10, incrementSeconds: 5});
      assert.deepEqual(clock, {...currentClock(), paused, displayOnly: false, timerId: paused ? 0 : 42,
        initialMs: 600000, msWhite: 600000, msBlack: 600000, incMs: 5000,
        tickingFor: turn, lastTickAt: 5678});
    }
  }
  const clock = currentClock();
  resetClockControl(clock, {minutes: 1, incrementSeconds: 0}, 'w', 6000);
  assert.equal(clock.incMs, 0, 'A zero increment replaces the old increment');
});

test('invalid or stopped controls are rejected before changing any clock state', () => {
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
  for (const overrides of [{active: false}, {mode: 'invalid'}]) {
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

test('Set time converts an Analysis counter to the actual timed game clock', () => {
  for (const paused of [true, false]) for (const turn of ['w', 'b']) {
    const clock = {...currentClock(), mode: 'up', displayOnly: true, paused, incMs: 0};
    resetClockControl(clock, {minutes: 3, incrementSeconds: 2}, turn, 8000);
    assert.equal(clock.mode, 'down');
    assert.equal(clock.displayOnly, false);
    assert.equal(clock.msWhite, 180000);
    assert.equal(clock.msBlack, 180000);
    assert.equal(clock.incMs, 2000);
    assert.equal(clock.paused, paused);
    assert.equal(clock.tickingFor, turn);
    assert.equal(usesClockBudget(clock), true, 'The applied clock replaces the old practice timing budget');
  }
});
