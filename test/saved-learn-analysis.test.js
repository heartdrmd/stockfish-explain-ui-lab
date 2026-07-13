import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

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
  assert.match(main, /const reusableSaved = !force && savedMeta\?\.version >= 1/);
  assert.match(main, /if \(reusableSaved \|\|/);
  assert.match(main, /movetimeMs:\s*lastSweepStats\.movetimeMs \|\| 0/);
  assert.match(main, /Saved Learn analysis · \$\{budget\}/);
});

test('clicking any classified error row opens its lesson position', () => {
  assert.match(stats, /Click to try a better move at each/);
  assert.match(main, /beforeLesson:\s*\(\) => closeTab\(\)/);
  assert.match(main, /lessonKind[\s\S]*?window\.__enterLearnMode\(targetPly\)/);
});
