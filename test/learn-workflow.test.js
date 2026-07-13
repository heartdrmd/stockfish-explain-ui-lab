import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [html, main, layout, panels] = await Promise.all([
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
  readFile(new URL('../src/main.js', import.meta.url), 'utf8'),
  readFile(new URL('../styles/layout.css', import.meta.url), 'utf8'),
  readFile(new URL('../styles/panels.css', import.meta.url), 'utf8'),
]);

test('mobile Learn has a dedicated slot immediately after the board unit', () => {
  const boardEnd = html.indexOf('</div>', html.indexOf('<div class="board-eval-wrap">'));
  const host = html.indexOf('id="learn-panel-host"');
  const tools = html.indexOf('<section class="tools">');
  assert.ok(boardEnd >= 0 && boardEnd < host && host < tools);
  assert.match(layout, /learn-panel-open \.learn-panel-host:not\(\[hidden\]\)[\s\S]*?order:\s*1/);
  assert.match(layout, /learn-panel-open\.mobile-postgame-analysis \.tools[\s\S]*?order:\s*2/);
});

test('classified accuracy clicks always reopen the requested lesson', () => {
  assert.match(main, /shouldAutoEnter = isOverClass && gameOver && _findMistakePlies\(\)\.includes\(ply\)/);
  assert.match(main, /_learn\.userDismissed = false;[\s\S]*?_hydrateLearnSolutions\(\[ply\]\);[\s\S]*?window\.__enterLearnMode\(ply\)/);
});

test('Learn shows simple lesson progress and explicit retry or give-up actions', () => {
  assert.match(main, /state === 'end'[\s\S]*?`\$\{total\}\/\$\{total\} · Done`/);
  assert.match(main, /id="learn-retry">Try again/);
  assert.match(main, /id="learn-compare">Show top 3/);
  assert.match(main, /id="learn-give-up">Give up · solution/);
  assert.match(main, /learn-give-up'\)\?\.addEventListener\('click', _giveUpAndShowSolution\)/);
});

test('Learn exposes scan and top-three durations at launch and in the lesson panel', () => {
  assert.match(html, /id="learn-quick-scan-time"/);
  assert.match(html, /id="learn-quick-attempt-time"/);
  assert.match(html, /id="mg-learn-scan-time"/);
  assert.match(html, /id="mg-learn-attempt-time"/);
  assert.match(main, /data-learn-setting="scanMs"/);
  assert.match(main, /data-learn-setting="attemptMs"/);
  assert.match(main, /state === 'setup'[\s\S]*?Choose how long Stockfish should analyse each move/);
  assert.match(main, /id="learn-start">Start lesson scan/);
  assert.match(main, /btnLearnMistakes\.addEventListener\('click', _openLearnSetup\)/);
  assert.match(main, /learn-start'\)\?\.addEventListener\('click', _startLearnPreparation\)/);
});

test('Learn marks and previews the original error without replaying it', () => {
  assert.match(main, /inaccuracy:\s*\{ mark: '\?!'/);
  assert.match(main, /mistake:\s*\{ mark: '\?'/);
  assert.match(main, /blunder:\s*\{ mark: '\?\?'/);
  assert.match(main, /_learn\.originalSeverity = classifySeverityForPly\(prev, cur\)/);
  assert.match(main, /board\.goToPly\(targetPly - 1\)[\s\S]*?_drawLearnMistakeArrow\(\)/);
  assert.match(main, /id = 'learn-mistake-arrow'/);
  assert.match(main, /The red arrow shows that original move; it has <strong>not<\/strong> been replayed/);
  assert.match(panels, /\.learn-mistake-arrow line[\s\S]*?stroke:\s*#e84a4a/);
});

test('View solution and Give up both reveal the best move through top-three comparison', () => {
  assert.match(main, /function _showSolution\(\)[\s\S]*?_giveUpAndShowSolution\(\)/);
  assert.match(main, /if \(_learn\.solutionRequested\) _revealLearnBestMove\(top\[0\]\)/);
  assert.match(main, /Solution revealed:/);
});

test('Learn comparison labels visible evaluations as White POV', () => {
  assert.match(main, /<th>Eval \(White\)<\/th>/);
  assert.match(main, /Eval is always White POV, matching the main engine/);
});
