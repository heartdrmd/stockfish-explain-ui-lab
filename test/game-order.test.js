import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { sortGamesByPlayedAt } from '../src/game-order.js';

const [html, main, server] = await Promise.all([
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
  readFile(new URL('../src/main.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/server/games.js', import.meta.url), 'utf8'),
]);

test('My Games stays newest-played first regardless of selection/open state', () => {
  const games = [
    { id: 2, played_at: '2026-07-12T12:00:00Z', selected: true, openedAt: '2026-07-13T23:00:00Z' },
    { id: 3, played_at: '2026-07-13T12:00:00Z' },
    { id: 1, played_at: '2026-07-11T12:00:00Z' },
  ];
  assert.deepEqual(sortGamesByPlayedAt(games).map(game => game.id), [3, 2, 1]);
  assert.deepEqual(games.map(game => game.id), [2, 3, 1], 'input is not mutated');
});

test('same-time games use a deterministic id tie-break', () => {
  const when = '2026-07-13T12:00:00Z';
  assert.deepEqual(sortGamesByPlayedAt([
    { id: 7, played_at: when },
    { id: 9, played_at: when },
  ]).map(game => game.id), [9, 7]);
});

test('My Games UI and merged pages enforce newest-played order', () => {
  assert.match(html, /Newest played first/);
  assert.doesNotMatch(html, /Most mistakes|Oldest first|Most moves/);
  assert.match(main, /q\.sort = 'newest'/);
  assert.match(main, /state\.games = sortGamesByPlayedAt\(state\.games\)/);
  assert.match(main, /played_at:\s+g\.playedAt \|\| legacyPlayedAt/);
  assert.match(server, /newest:\s+'played_at DESC, id DESC'/);
});
