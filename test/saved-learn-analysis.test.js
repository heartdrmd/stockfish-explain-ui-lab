import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { canReuseLearnScan, learnScanKey } from '../src/learn-scan-cache.js';

const [main, stats] = await Promise.all([
  readFile(new URL('../src/main.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/game-stats.js', import.meta.url), 'utf8'),
]);

test('completed Learn scans persist and hydrate the full best-move cache', () => {
  assert.match(main, /bestUci:\s*ev\.bestUci \|\| null/);
  assert.match(main, /out\[0\]\.analysisMeta = analysisMeta/);
  assert.match(main, /out\[0\]\.startAnalysis/);
  assert.match(main, /function hydrateSavedAnalysis\(game, startingFen\)/);
  assert.match(main, /bestUci:\s*p\.bestUci \|\| null/);
  assert.match(main, /Learn reuses it without rescanning/);
});

test('saved analysis records time and reuses cached positions', () => {
  assert.match(main, /sweepReused\+\+/);
  assert.match(main, /const reusableSaved = !force && savedBudgetMatches && savedMeta\?\.version >= 1/);
  assert.match(main, /!force && movetimeMs <= 0 && existing/);
  assert.match(main, /if \(reusableSaved \|\|/);
  assert.match(main, /movetimeMs:\s*lastSweepStats\.movetimeMs \|\| 0/);
  assert.match(main, /Saved Learn analysis · \$\{budget\}/);
});

test('Learn reuses only the exact requested scan duration and coverage', () => {
  const saved = {
    version: 1,
    movetimeMs: 400,
    positions: 72,
    engineFlavor: 'lite',
  };
  assert.equal(canReuseLearnScan(saved, {
    scanMs: 400,
    positions: 72,
    engineFlavor: 'lite',
  }), true);
  assert.equal(canReuseLearnScan(saved, {
    scanMs: 750,
    positions: 72,
    engineFlavor: 'lite',
  }), false);
  assert.equal(canReuseLearnScan(saved, {
    scanMs: 200,
    positions: 72,
    engineFlavor: 'lite',
  }), false);
  assert.equal(canReuseLearnScan(saved, {
    scanMs: 400,
    positions: 73,
    engineFlavor: 'lite',
  }), false);
  assert.equal(canReuseLearnScan(saved, {
    scanMs: 400,
    positions: 72,
    engineFlavor: 'full',
  }), false);
});

test('Learn scan identity changes with duration and engine flavor', () => {
  const base = { startingFen: 'start', mainlineKey: 'e2e4,e7e5' };
  const quick = learnScanKey({ ...base, scanMs: 400, engineFlavor: 'lite' });
  assert.notEqual(quick, learnScanKey({ ...base, scanMs: 750, engineFlavor: 'lite' }));
  assert.notEqual(quick, learnScanKey({ ...base, scanMs: 400, engineFlavor: 'full' }));
  assert.match(main, /force: !canReuseRequestedScan/);
});

test('clicking any classified error row opens its lesson position', () => {
  assert.match(stats, /Click to try a better move at each/);
  assert.match(main, /beforeLesson:\s*\(\) => closeTab\(\)/);
  assert.match(main, /lessonKind[\s\S]*?window\.__enterLearnMode\(targetPly\)/);
});
