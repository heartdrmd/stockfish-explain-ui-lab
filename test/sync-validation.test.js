import test from 'node:test';
import assert from 'node:assert/strict';

import { cleanCard, cleanPreferences } from '../src/server/sync.js';

test('portable preferences allow UI choices but reject device and secret state', () => {
  const cleaned = cleanPreferences({
    'stockfish-explain.learn-settings': '{"scanMs":400}',
    'stockfish-explain.live-graph-visible': '1',
    'stockfish-explain.analysis-lines': '3',
    'stockfish-explain.hash-mb': '512',
    'stockfish-explain.engine-flavor': 'full',
    'stockfish-explain.board-size': '740',
    'stockfish-explain.anthropic-key': 'secret',
    'stockfish-explain.draft-game': '{"fen":"..."}',
    'stockfish-explain.account-state-owner': '42',
  });
  assert.deepEqual(cleaned, {
    'stockfish-explain.learn-settings': '{"scanMs":400}',
    'stockfish-explain.live-graph-visible': '1',
    'stockfish-explain.analysis-lines': '3',
  });
});

test('SRS cards receive a conflict timestamp and reject malformed numbers', () => {
  const good = cleanCard({ key: 'game:1:ply:22', dueAt: 123, reps: 2, updatedAt: 456 });
  assert.equal(good.updatedAt, 456);
  assert.equal(good.key, 'game:1:ply:22');
  assert.equal(cleanCard({ key: 'bad', dueAt: 'tomorrow' }), null);
  assert.equal(cleanCard({ key: '' }), null);
});
