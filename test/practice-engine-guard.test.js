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

test('Practice start reaches a confirmed idle boundary before changing the board', async () => {
  const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  const board = await readFile(new URL('../src/board.js', import.meta.url), 'utf8');
  const startBlock = main.match(
    /pStart\.addEventListener\('click', async \(\) => \{[\s\S]*?\n\s*\}\);\n\s*\}/,
  )?.[0] || '';

  assert.match(startBlock, /window\.__practiceStarting = true/);
  assert.match(startBlock, /board\.setInteractionLocked\?\.\(true\)/);
  assert.match(startBlock, /cancelAnimationFrame\(window\.__fireScheduled\)/);
  assert.match(startBlock, /await transitionEngine\.quiesce\(\{ timeoutMs: 4_000, discardPending: true \}\)/);
  assert.match(startBlock, /board\.newGame\(\{ force: true \}\)/);
  assert.match(startBlock, /board\.playUciMoves\(played\.uciMoves, \{ animate: false, force: true \}\)/);
  assert.match(startBlock, /if \(!idleResult\.ok\)[\s\S]*?await switchEngineFlavor\(recoveryFlavor\)/);
  assert.match(startBlock, /finally \{[\s\S]*?window\.__practiceStarting = false[\s\S]*?setInteractionLocked/);
  assert.match(startBlock, /if \(!practiceStarted\) return;[\s\S]*?fireAnalysis\(\)/);
  assert.match(main, /function fireAnalysis\(\) \{[\s\S]*?if \(window\.__practiceStarting\)/);
  assert.match(main, /function _fireAnalysisNow\(\) \{[\s\S]*?if \(window\.__practiceStarting\) return/);
  assert.match(board, /newGame\(\{ force = false \} = \{\}\)[\s\S]*?interactionLocked && !force/);
  assert.match(board, /playUciMoves\(uciList, \{[\s\S]*?force = false,[\s\S]*?\} = \{\}\)[\s\S]*?interactionLocked && !force/);
});

test('repeat engine boots use truthful loading language instead of claiming a download', async () => {
  const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(main, /Loading neural network \(browser cache is used when available\)/);
  assert.match(main, /`Loading <strong>\$\{lbl\}<\/strong> \$\{fmt\(d\.received\)\}`/);
  assert.doesNotMatch(main, /`Downloading <strong>\$\{lbl\}/);
});

test('a saved Practice draft is restored before the first analysis is allowed to start', async () => {
  const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.doesNotMatch(main, /setTimeout\(maybeRestoreDraft,\s*150\)/);
  assert.match(
    main,
    /board\.livePath = tree\.currentPath;[\s\S]*?board\.viewPly = null;[\s\S]*?board\._historicalChess = null/,
  );
  assert.match(
    main,
    /maybeRestoreDraft\(\);[\s\S]*?mainInitDone = true;[\s\S]*?if \(pendingFireAnalysis\)/,
  );
});
