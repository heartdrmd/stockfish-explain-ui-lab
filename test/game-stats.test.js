import test from 'node:test';
import assert from 'node:assert/strict';
import { computeGameStats, renderStatsPanel } from '../src/game-stats.js';

const ply = (sideToMove, cpWhite = null, mate = null) => ({
  fen: `8/8/8/8/8/8/8/8 ${sideToMove} - - 0 1`,
  cpWhite,
  mate,
});

test('missing saved evaluations are reported as not analyzed, never fake zeroes', () => {
  const stats = computeGameStats([ply('b'), ply('w')]);
  assert.deepEqual(stats.coverage, { state: 'none', evaluatedMoves: 0, totalMoves: 2 });
  assert.equal(stats.white.analysisState, 'none');
  assert.equal(stats.black.analysisState, 'none');

  const html = renderStatsPanel({ side: 'white', name: 'Player', stats: stats.white, byKind: stats.byKind });
  assert.match(html, /Not analyzed yet/);
  assert.match(html, /<span class="gs-n">—<\/span><span class="gs-label">Inaccuracies/);
  assert.doesNotMatch(html, />0%<\/span>/);
});

test('partial saved analysis exposes exact coverage and withholds incomplete totals', () => {
  const stats = computeGameStats([
    ply('b', 25),
    ply('w', 10),
    ply('b'),
    ply('w'),
  ]);
  assert.deepEqual(stats.coverage, { state: 'partial', evaluatedMoves: 2, totalMoves: 4 });
  assert.equal(stats.white.analysisState, 'partial');
  assert.equal(stats.black.analysisState, 'partial');

  const html = renderStatsPanel({ side: 'white', name: 'Player', stats: stats.white, byKind: stats.byKind });
  assert.match(html, /Partial analysis · 1\/2 moves/);
  assert.match(html, /<span class="gs-n">—<\/span>[\s\S]*?<span class="gs-label">Accuracy/);
});

test('a fully evaluated checkmate game remains complete when the terminal move is intentionally ungraded', () => {
  const stats = computeGameStats([
    ply('b', -20),
    ply('w', 30),
    ply('b', -80),
    ply('w', null, 0),
  ]);
  assert.deepEqual(stats.coverage, { state: 'complete', evaluatedMoves: 4, totalMoves: 4 });
  assert.equal(stats.black.analysisState, 'complete');
});
