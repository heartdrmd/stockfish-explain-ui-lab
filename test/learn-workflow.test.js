import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [html, main, layout, panels, myGames] = await Promise.all([
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
  readFile(new URL('../src/main.js', import.meta.url), 'utf8'),
  readFile(new URL('../styles/layout.css', import.meta.url), 'utf8'),
  readFile(new URL('../styles/panels.css', import.meta.url), 'utf8'),
  readFile(new URL('../styles/my-games.css', import.meta.url), 'utf8'),
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
  assert.match(main, /const continueBtn = `<button class="retro-btn retro-continue" id="learn-next">Next mistake ▶<\/button>`/);
  assert.doesNotMatch(main, /id="learn-finish"/);
});

test('a rejected comparison offers persistent Try again beside Next mistake', () => {
  assert.match(main, /state === 'comparison'[\s\S]*?const canRetry = !_learn\.solutionRevealed[\s\S]*?!_learn\.gradePassed[\s\S]*?_learn\.comparison\?\.attempt/);
  assert.match(main, /canRetry \? '<button class="retro-btn" id="learn-retry">Try again<\/button>' : ''/);
  assert.match(main, /id="learn-next">Next mistake ▶/);
  assert.match(main, /learn-next'\)\?\.addEventListener\('click', _goNextMistake\)/);
  assert.match(main, /learn-retry'\)\?\.addEventListener\('click', _retryLearnAttempt\)/);
  assert.match(main, /function _retryLearnAttempt\(\)[\s\S]*?_enterLearnMode\(_learn\.targetPly, \{ preserveComparison: true \}\)/);
});

test('Learn retry preserves comparison, re-arms one listener, and starts no prefetch', () => {
  assert.match(main, /function _disarmLearnMoveHandler\(\)[\s\S]*?removeEventListener\('move', _learn\.moveHandler\)[\s\S]*?_learn\.moveHandler = null/);
  assert.match(main, /function _goNextMistake\(\) \{[\s\S]*?_disarmLearnMoveHandler\(\)/);
  assert.match(main, /function _enterLearnMode\(targetPly, \{ preserveComparison = false \} = \{\}\)[\s\S]*?const preservedComparison[\s\S]*?_disarmLearnMoveHandler\(\)/);
  assert.match(main, /preserveComparison && preservedComparison\?\.top\?\.length[\s\S]*?_renderLearnPanel\('comparison'\)[\s\S]*?_drawLearnFeedbackArrows\(preservedBest/);
  assert.match(main, /_learn\.moveHandler = onMove;[\s\S]*?board\.addEventListener\('move', onMove\)/);
  assert.match(main, /const cacheKey = `\$\{_learn\.prevFen\}\|\$\{_learnSettings\.attemptMs\}`[\s\S]*?_learnComparisonCache\.get\(cacheKey\)/);
  const retryBlock = main.match(/function _retryLearnAttempt\(\) \{([\s\S]*?)\n  \}/)?.[1] || '';
  assert.doesNotMatch(retryBlock, /engine\.(?:start|stop)|probeEngine/);
});

test('Learn exposes scan and top-three durations at launch and in the lesson panel', () => {
  assert.match(html, /id="learn-quick-scan-time"/);
  assert.match(html, /id="learn-quick-attempt-time"/);
  assert.match(html, /id="mg-learn-scan-time"/);
  assert.match(html, /id="mg-learn-attempt-time"/);
  assert.match(main, /data-learn-setting="scanMs"/);
  assert.match(main, /data-learn-setting="attemptMs"/);
  assert.match(main, /state === 'setup'[\s\S]*?Choose scan time and which lessons to include/);
  assert.match(main, /id="learn-start">Start lesson scan/);
  assert.match(main, /btnLearnMistakes\.addEventListener\('click', _openLearnSetup\)/);
  assert.match(main, /learn-start'\)\?\.addEventListener\('click', _startLearnPreparation\)/);
});

test('cancelled Learn scans release Stockfish before a changed-time restart', () => {
  assert.match(main, /const priorSweepRunning = window\.__isRetrospectiveSweepRunning\?\.\(\) === true/);
  assert.match(main, /const priorSweepIdle = priorSweepRunning[\s\S]*?window\.__stopRetrospectiveSweep\?\.\(\)/);
  assert.match(main, /await priorSweepIdle;[\s\S]*?if \(!runIsCurrent\(\)\) return;[\s\S]*?retrospectiveSweep\(\{/);
  assert.match(main, /const sweepIdleWaiters = new Set\(\)/);
  assert.match(main, /window\.__stopRetrospectiveSweep = \(\) =>[\s\S]*?return waitForRetrospectiveSweepIdle\(\)/);
  assert.match(main, /resolveRetrospectiveSweepIdle\(\)/);
  assert.match(main, /Finishing the cancelled scan before restarting/);
});

test('desktop loaded-game review gives Learn roughly twice notation space', () => {
  assert.match(main, /document\.body\.classList\.add\('review-layout-active'\)/);
  assert.match(main, /classList\.add\('review-stats-expanded'\)/);
  assert.match(main, /stockfish-explain\.stats-slot-height-v2/);
  assert.match(layout, /review-layout-active[\s\S]*?review-stats-expanded > #move-list[\s\S]*?22vh/);
  assert.match(layout, /review-layout-active[\s\S]*?notation-below-slot[\s\S]*?46vh/);
  assert.match(myGames, /review-stats-expanded[\s\S]*?live-graph-cta[\s\S]*?grid-column:\s*1 \/ -1/);
  assert.match(myGames, /review-stats-expanded[\s\S]*?btn-learn-mistakes[\s\S]*?font-size:\s*14px/);
});

test('lesson sensitivity is easy to adjust on desktop, mobile, Practice, and saved games', () => {
  assert.match(html, /id="learn-sensitivity"/);
  assert.match(html, /id="learn-quick-sensitivity"/);
  assert.match(html, /id="practice-learn-sensitivity"/);
  assert.match(html, /id="mg-learn-sensitivity"/);
  assert.match(main, /lessonThresholdPoints: new Set\(\[3, 4, 6\]\)/);
  assert.match(main, /data-learn-setting="lessonThresholdPoints"/);
  assert.match(main, /isLearnCandidateDrop\(drop, _learnSettings\.lessonThresholdPoints \/ 100\)/);
  assert.match(main, /'small-miss': \{ mark: 'MISS', label: 'Small miss' \}/);
  assert.match(panels, /data-severity="small-miss"/);
});

test('Learn defaults to personal mistakes and can add computer lessons without rescanning', () => {
  assert.match(main, /includeOpponentMistakes: new Set\(\[0, 1\]\)/);
  assert.match(main, /includeOpponentMistakes: pick\('includeOpponentMistakes', 0\)/);
  assert.match(main, /_openLearnSetup\(\)[\s\S]*?_setLearnSetting\('includeOpponentMistakes', 0\)/);
  assert.match(main, /data-learn-toggle-opponent/);
  assert.match(main, /Include computer mistakes/);
  assert.match(main, /includeLessonPly\(i, userColor, includeOpponentMistakes\)/);
  assert.match(main, /Computer played/);
  assert.match(main, /Computer mistakes · \$\{computerLessons\.length\}/);
});

test('completed scans repaint notation with move-quality annotations', () => {
  assert.match(main, /function markNotationAnalysisReady\(\)[\s\S]*?renderMoveList\(\)/);
  assert.match(main, /notationAnalysisReadyKey === currentMainlineAnalysisKey\(\)/);
  assert.match(main, /notationAnnotation\([\s\S]*?moverWinDrop/);
  assert.match(main, /class="mt-annotation" data-severity=/);
  assert.match(panels, /\.mt-annotation\[data-severity="inaccuracy"\]/);
  assert.match(panels, /\.mt-annotation\[data-severity="mistake"\]/);
  assert.match(panels, /\.mt-annotation\[data-severity="blunder"\]/);
});

test('Learn marks and previews the original error without replaying it', () => {
  assert.match(main, /inaccuracy:\s*\{ mark: '\?!'/);
  assert.match(main, /mistake:\s*\{ mark: '\?'/);
  assert.match(main, /blunder:\s*\{ mark: '\?\?'/);
  assert.match(main, /_learn\.originalSeverity = classifySeverityForPly\(prev, cur\)/);
  assert.match(main, /board\.goToPly\(targetPly - 1\)[\s\S]*?_drawLearnMistakeArrow\(\)/);
  assert.match(main, /id = 'learn-mistake-arrow'/);
  assert.match(main, /The red arrow shows that original move; it has <strong>not<\/strong> been replayed/);
  assert.match(panels, /\.learn-mistake-arrow line[\s\S]*?stroke:\s*#882020[\s\S]*?stroke-width:\s*1\.5625[\s\S]*?opacity:\s*\.38/);
  assert.match(panels, /\.learn-mistake-arrow marker path[\s\S]*?opacity:\s*\.48/);
});

test('View solution and Give up both reveal the best move through top-three comparison', () => {
  assert.match(main, /function _showSolution\(\)[\s\S]*?_giveUpAndShowSolution\(\)/);
  assert.match(main, /if \(_learn\.solutionRequested\) _revealLearnBestMove\(top\[0\]\)/);
  assert.match(main, /Solution revealed:/);
});

test('Learn comparison and board distinguish best, accepted try, and original error', () => {
  assert.match(main, /i === 0 \? 'BEST MOVE' : `Engine #\$\{i \+ 1\}`/);
  assert.match(panels, /\.learn-row-best[\s\S]*?font-size:\s*12\.5px[\s\S]*?font-weight:\s*800/);
  assert.match(main, /function _drawLearnFeedbackArrows[\s\S]*?board\.goToPly\(_learn\.targetPly - 1\)[\s\S]*?_drawLearnMistakeArrow\(\)/);
  assert.match(main, /_drawLearnFeedbackArrows\(top\[0\], \{ revealBest: true \}\)/);
  assert.match(main, /_drawLearnFeedbackArrows\(null, \{ revealBest: false \}\)/);
});

test('Learn holds the attempted move visibly before retracting and color-keys the table', () => {
  assert.match(main, /const LEARN_ATTEMPT_MIN_VISIBLE_MS = 1100/);
  assert.match(main, /_learn\.attemptShownAt = Date\.now\(\)[\s\S]*?board\.setInteractionLocked\?\.\(true\)[\s\S]*?_renderLearnPanel\('eval'\)/);
  assert.match(main, /function _completeLearnAttempt[\s\S]*?remainingHoldMs[\s\S]*?_drawLearnFeedbackArrows\(null, \{ revealBest: false \}\)[\s\S]*?setTimeout\(finish, remainingHoldMs\)/);
  assert.match(main, /show[\s\S]*?the alternatives automatically for both accepted and rejected tries[\s\S]*?_loadLearnComparison\(\)/);
  assert.match(main, /Your move <strong>\$\{escapeHtml\(_learn\.attemptSan/);
  assert.match(main, /Red · original mistake[\s\S]*?Yellow · your try[\s\S]*?White · engine choices/);
  assert.match(main, /Original mistake/);
  assert.match(main, /learn-row-attempt/);
  assert.match(main, /learn-row-engine/);
  assert.match(panels, /\.learn-row-original[\s\S]*?box-shadow:\s*inset 4px 0 #ff595f/);
  assert.match(panels, /\.learn-row-attempt[\s\S]*?box-shadow:\s*inset 4px 0 #f5c537/);
  assert.match(panels, /\.learn-row-engine[\s\S]*?box-shadow:\s*inset 4px 0 rgba\(255,255,255,\.82\)/);
});

test('every Learn attempt remains in notation as a side variation', () => {
  assert.doesNotMatch(main, /deleteAt\(trialPath\)/);
  assert.match(main, /Keep it there permanently as a notation[\s\S]*?including unsuccessful tries/);
  assert.match(main, /function _completeLearnAttempt[\s\S]*?_drawLearnFeedbackArrows\(null, \{ revealBest: false \}\)/);
  assert.match(main, /function _recordLearnBestVariation[\s\S]*?board\.tree\.addNode[\s\S]*?source: 'learn-best'/);
  assert.match(main, /if \(revealBest && bestUci\)[\s\S]*?_recordLearnBestVariation/);
});

test('notation scroll is contained without moving the sticky board or page', () => {
  assert.match(panels, /\.move-list-wrap\s*\{[\s\S]*?max-height:\s*min\(78vh, 780px\)[\s\S]*?min-height:\s*0/);
  assert.match(panels, /\.move-list-wrap > #move-list\s*\{[\s\S]*?overflow-y:\s*auto[\s\S]*?overscroll-behavior-y:\s*contain[\s\S]*?touch-action:\s*pan-y/);
  assert.match(layout, /body\.mobile-mode \.board-eval-wrap[\s\S]*?position:\s*sticky/);
});

test('Learn comparison labels visible evaluations as White POV', () => {
  assert.match(main, /<th>Eval \(White\)<\/th>/);
  assert.match(main, /Eval is always White POV, matching the main engine/);
});
