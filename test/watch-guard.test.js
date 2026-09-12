import test from 'node:test';
import assert from 'node:assert/strict';
import { createWatchGuard } from '../src/watch-guard.js';
import { createClockHardwareBridge } from '../src/clock-hardware-bridge.js';

function setup(paused = false, active = true) {
  let now = 1000, fen = 'original position', blocked = false;
  const board = { fen: () => fen };
  const clock = { active, paused, mode: 'down', msWhite: 300000, msBlack: 295000, incMs: 3000, initialMs: 300000, tickingFor: 'w' };
  const hardware = createClockHardwareBridge({ clock, turn: () => 'w', now: () => now, render() {}, expired() { throw Error('Unexpected flag'); }, storage: {getItem: () => null, setItem() {}} });
  hardware.model('dgt');
  let toggles = 0;
  const watch = createWatchGuard({ board, clock, blocked: () => blocked,
    togglePause() { toggles++; hardware.pause(); } });
  return { board, clock, watch, toggles: () => toggles, block: () => blocked = true,
    newGame: () => fen = 'a new position', advance(ms) { now += ms; hardware.tick(); } };
}
test('watching pauses the real clock without losing time or awarding increments, and resumes the same game', () => {
  const h = setup(); h.advance(1500); const white = h.clock.msWhite;
  h.watch(true); h.watch(true); h.advance(60000);
  assert.equal(h.board.watchActive, true); assert.equal(h.clock.paused, true);
  assert.equal(h.clock.msWhite, white); assert.equal(h.clock.msBlack, 295000);
  assert.equal(h.clock.incMs, 3000); assert.equal(h.toggles(), 1);
  h.watch(false); h.watch(false); h.advance(1000);
  assert.equal(h.clock.msWhite, white - 1000); assert.equal(h.clock.paused, false);
  assert.equal(h.toggles(), 2); assert.equal(h.board.fen(), 'original position');
});
test('already paused and untimed games retain their state', () => {
  for (const [paused, active] of [[true,true],[false,false]]) {
    const h = setup(paused, active); h.watch(true); h.watch(false);
    assert.equal(h.clock.paused, paused); assert.equal(h.clock.active, active); assert.equal(h.toggles(), 0);
  }
});
test('a pending computer move cannot enter Watch and a new game is never resumed by the old pause', () => {
  const blocked = setup(); blocked.block(); assert.throws(()=>blocked.watch(true), /finish loading/);
  assert.equal(blocked.toggles(), 0); assert.equal(blocked.board.watchActive, undefined);
  const h = setup(); h.watch(true); h.newGame(); h.watch(false);
  assert.equal(h.clock.paused, true); assert.equal(h.toggles(), 1); assert.equal(h.board.watchActive, false);
});
