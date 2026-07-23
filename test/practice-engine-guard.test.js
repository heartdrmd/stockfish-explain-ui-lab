import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { canApplyPracticeEngineMove } from '../src/practice-engine-guard.js';

const base = {
  launchFen: 'position-a w - - 0 1',
  resultFen: 'position-a w - - 0 1',
  boardFen: 'position-a w - - 0 1',
  searchToken: 12,
  currentSearchToken: 12,
  isAtLive: true,
  boardPly: 18,
  livePly: 18,
  practiceFinished: false,
};

test('practice engine move applies only to the still-live searched position', () => {
  assert.equal(canApplyPracticeEngineMove(base), true);
});

test('practice engine move rejects every stale-search and historical-board shape', () => {
  const staleCases = [
    { searchToken: 11 },
    { resultFen: 'different search' },
    { boardFen: 'historical board' },
    { isAtLive: false },
    { boardPly: 17 },
    { boardPly: null },
    { livePly: null },
    { practiceFinished: true },
  ];
  for (const changed of staleCases) {
    assert.equal(
      canApplyPracticeEngineMove({ ...base, ...changed }),
      false,
      `expected rejection for ${JSON.stringify(changed)}`,
    );
  }
});

test('every automatic practice play site uses the guarded apply helper', async () => {
  const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  const guardedUses = main.match(/playPracticeEngineMoveIfCurrent\(/g) || [];
  assert.equal(guardedUses.length, 4, 'definition + forced + variation + ordinary style plays');
  assert.match(main, /function playPracticeEngineMoveIfCurrent[\s\S]*?board\.playEngineMove\(uci\)[\s\S]*?board\.fen\(\) === beforeFen[\s\S]*?__pendingEngineTurnFen = null/);
  assert.match(main, /const launchFen = fen;[\s\S]*?resultFen: ev\.detail\.fen/);
  assert.match(main, /board\.addEventListener\('nav'[\s\S]*?practiceSearchToken\+\+/);
  assert.match(main, /Space ignored during active practice/);
});
