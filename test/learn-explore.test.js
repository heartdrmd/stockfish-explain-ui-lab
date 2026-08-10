import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  buildLearnExploreUciLine,
  isLearnExploreUci,
} from '../src/learn-explore.js';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

test('Learn exploration prefers and validates a cached UCI PV', () => {
  assert.deepEqual(buildLearnExploreUciLine(START, {
    uci: 'e2e4',
    pvUci: ['e2e4', 'e7e5', 'g1f3', 'b8c6'],
  }), ['e2e4', 'e7e5', 'g1f3', 'b8c6']);
});

test('Learn exploration can recover a legacy SAN-only PV', () => {
  assert.deepEqual(buildLearnExploreUciLine(START, {
    uci: 'e2e4',
    pvSan: 'e4 e5 Nf3 Nc6',
  }), ['e2e4', 'e7e5', 'g1f3', 'b8c6']);
});

test('a mismatched or illegal cached PV can never replace the clicked move', () => {
  assert.deepEqual(buildLearnExploreUciLine(START, {
    uci: 'd2d4',
    pvUci: ['e2e4', 'e7e5'],
  }), ['d2d4']);
  assert.deepEqual(buildLearnExploreUciLine(START, {
    uci: 'e2e5',
    pvUci: ['e2e5'],
  }), []);
  assert.equal(isLearnExploreUci('e7e8q'), true);
  assert.equal(isLearnExploreUci('not-a-move'), false);
});

const [main, board, panels] = await Promise.all([
  readFile(new URL('../src/main.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/board.js', import.meta.url), 'utf8'),
  readFile(new URL('../styles/panels.css', import.meta.url), 'utf8'),
]);

test('comparison rows expose accessible exploration actions for every row type', () => {
  assert.match(main, /data-learn-explore="\$\{escapeHtml\(key\)\}"/);
  assert.match(main, /rowHtml\('original', 'Original mistake'/);
  assert.match(main, /rowHtml\('attempt', tryLabel/);
  assert.match(main, /`top-\$\{i\}`/);
  assert.match(main, /querySelectorAll\('\[data-learn-explore\]'\)[\s\S]*?_enterLearnExploration/);
});

test('Explore keeps Learn variation safety while temporarily allowing visible analysis', () => {
  assert.match(main, /function _enterLearnMode[\s\S]*?__setLearnEngineControls\?\.\(\{ active: true, preparing: false, exploring: false \}\)/);
  assert.match(main, /_learn\.exploring = true[\s\S]*?window\.__learnExploring = true/);
  assert.match(main, /window\.__learnOwnsEngine && !window\.__learnExploring/);
  assert.match(main, /\(!paused && !locked\) \|\| window\.__learnExploring/);
  assert.match(panels, /body\.learn-active:not\(\.learn-exploring\) \.ceval-bar/);
  assert.match(panels, /body\.learn-active:not\(\.learn-exploring\) \.analysis-lines-control/);
  assert.match(main, /EXPLORE · ENGINE ON/);
});

test('Explore uses path-aware navigation and restores before rearming grading', () => {
  assert.match(board, /goToPath\(path\)[\s\S]*?this\._navigateTo\(path\)/);
  const exitBlock = main.match(/function _exitLearnExploration[\s\S]*?\n  \}\n\n  async function _loadLearnComparison/)?.[0] || '';
  assert.match(exitBlock, /board\.goToPath\?\.\(saved\.lessonPath\)/);
  assert.match(exitBlock, /board\.fen\(\) === _learn\.prevFen[\s\S]*?board\.addEventListener\('move', saved\.moveHandler\)/);
  assert.match(exitBlock, /_renderLearnPanel\('comparison'\)[\s\S]*?_drawLearnFeedbackArrows/);
  assert.match(main, /id="learn-back-to-lesson"/);
});

test('closing during Explore releases the temporary lease without invoking Back', () => {
  assert.match(main, /if \(_learn\.exploring\) _exitLearnExploration\(\{ restoreLesson: false \}\)/);
  assert.match(main, /document\.body\.classList\.remove\('learn-active', 'learn-phase-find', 'learn-preparing', 'learn-exploring'\)/);
  assert.match(main, /window\.__learnExploring = false/);
});
