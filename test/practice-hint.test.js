import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { buildPracticeHintLines, upsertPracticeHint } from '../src/practice-hint.js';
import { sanitizePracticeHints } from '../src/server/games.js';

test('practice hints convert every candidate from side-to-move into White POV', () => {
  const blackToMove = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1';
  const lines = buildPracticeHintLines([
    { scoreKind: 'cp', score: 120, pv: ['e7e5'] },
    { scoreKind: 'cp', score: -80, pv: ['d7d5'] },
    { scoreKind: 'mate', score: 3, pv: ['g8f6'] },
  ], blackToMove);

  assert.equal(lines[0].evalText, '-1.20');
  assert.equal(lines[1].evalText, '+0.80');
  assert.equal(lines[2].evalText, '#-3');
});

test('practice hint UI offers seconds through minutes and an explicit White POV label', async () => {
  const [html, main, db, games] = await Promise.all([
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../src/main.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/server/db.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/server/games.js', import.meta.url), 'utf8'),
  ]);
  assert.match(html, /SHOW 3 TOP ENGINE MOVES \(HINT\)/);
  assert.match(html, /value="1000">1 second/);
  assert.match(html, /value="300000">5 minutes/);
  assert.match(main, /White POV/);
  assert.match(main, /stockfish-explain\.practice-hint-time-ms/);
  assert.match(main, /hints:\s+game\.hints/);
  assert.match(db, /016_practice_hints[\s\S]*?ADD COLUMN IF NOT EXISTS hints JSONB/);
  assert.match(games, /jsonb_array_length\(COALESCE\(hints, '\[\]'::jsonb\)\) AS hint_count/);
});

test('repeat hints replace the same game position rather than duplicating it', () => {
  const first = { ply: 12, fen: 'same fen', thinkMs: 1000, lines: [{ san: 'Nf3' }] };
  const deeper = { ply: 12, fen: 'same fen', thinkMs: 30000, lines: [{ san: 'd4' }] };
  const other = { ply: 13, fen: 'other fen', thinkMs: 3000, lines: [{ san: 'e5' }] };
  const history = upsertPracticeHint(upsertPracticeHint([first], deeper), other);
  assert.equal(history.length, 2);
  assert.equal(history[0].thinkMs, 30000);
  assert.equal(history[0].lines[0].san, 'd4');
});

test('server stores only bounded canonical White-POV hint data', () => {
  const [hint] = sanitizePracticeHints([{
    ply: 18,
    fen: '8/8/8/8/8/8/8/8 b - - 0 10',
    side: 'black',
    thinkMs: 30_000,
    engineFlavor: 'lite-single',
    analyzedAt: '2026-07-13T20:00:00.000Z',
    lines: [
      { rank: 1, uci: 'e7e5', san: 'e5', pvSan: 'e5 Nf3', cpWhite: -42, mateWhite: null, evalText: '-0.42' },
    ],
  }]);
  assert.equal(hint.ply, 18);
  assert.equal(hint.side, 'black');
  assert.equal(hint.lines[0].cpWhite, -42);
  assert.equal(hint.lines[0].mateWhite, null);
  assert.throws(() => sanitizePracticeHints(Array.from({ length: 101 }, () => ({}))), /too many hints/);
});
