import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [html, main, layout, panels] = await Promise.all([
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
  readFile(new URL('../src/main.js', import.meta.url), 'utf8'),
  readFile(new URL('../styles/layout.css', import.meta.url), 'utf8'),
  readFile(new URL('../styles/panels.css', import.meta.url), 'utf8'),
]);

test('eval bar has an independent persistent toggle without resizing the board', () => {
  assert.match(html, /id="eval-gauge-control"[\s\S]*?id="eval-gauge"[\s\S]*?id="eval-gauge-toggle"/);
  assert.match(main, /stockfish-explain\.eval-gauge-hidden/);
  assert.match(main, /classList\.toggle\('eval-gauge-hidden', hidden\)/);
  assert.match(panels, /eval-gauge-hidden \.eval-gauge[\s\S]*?visibility:\s*hidden/);
  assert.match(layout, /\.uniboard \.eval-gauge-control[\s\S]*?grid-area:\s*gauge/);
  assert.match(layout, /\.uniboard \.eval-gauge-control[\s\S]*?align-self:\s*start/);
  assert.match(layout, /\.uniboard \.eval-gauge \{[\s\S]*?flex:\s*0 0 auto/);
  assert.match(layout, /body:not\(\.mobile-mode\) \.uniboard \.eval-gauge-control[\s\S]*?position:\s*sticky/);
  assert.match(layout, /\.uniboard\.board-sticky-oversized \.eval-gauge-control[\s\S]*?position:\s*relative/);
  assert.match(layout, /body\.mobile-mode \.board-eval-wrap \.eval-gauge \{[\s\S]*?flex:\s*0 0 auto/);
  assert.match(main, /boardUnitHeight > usableHeight/);
});

test('engine arrows have an independent quick toggle directly below E', () => {
  assert.match(html, /id="eval-gauge-toggle"[\s\S]*?id="engine-arrows-toggle"/);
  assert.match(html, /id="select-arrow-mode"[\s\S]*?value="lichess"/);
  assert.match(main, /stockfish-explain\.arrow-last-mode/);
  assert.match(main, /engine-arrows-toggle[\s\S]*?applyArrowMode/);
  assert.match(main, /applyArrowMode[\s\S]*?__learnOwnsEngine \|\| window\.__practiceHintOwnsEngine/);
  assert.match(main, /learnEngineControlIds[\s\S]*?'engine-arrows-toggle', 'select-arrow-mode'/);
  assert.match(main, /value === 'off'[\s\S]*?!document\.body\.classList\.contains\('learn-active'\)/);
  assert.match(panels, /engine-arrows-toggle\[aria-pressed="true"\]/);
});

test('move-accuracy eye toggle never hides the eval bar', () => {
  assert.match(html, /id="nav-hide-panels"[^>]*title="Hide move accuracy colors"/);
  assert.match(main, /btn\.title = hidden \? 'Show move accuracy colors' : 'Hide move accuracy colors'/);
  assert.doesNotMatch(main, /gaugeControl\.classList\.toggle\('panels-hidden'/);
  assert.doesNotMatch(panels, /\.eval-gauge-control\.panels-hidden/);
});

test('desktop and mobile analysis can select one, two, or three engine lines directly', () => {
  assert.match(html, /id="analysis-lines-control"[\s\S]*?data-analysis-lines="1"[\s\S]*?data-analysis-lines="2"[\s\S]*?data-analysis-lines="3"/);
  assert.match(html, /class="ceval-score-cluster"[\s\S]*?id="score-pearl"[\s\S]*?id="analysis-lines-control"[\s\S]*?class="ceval-meta"/);
  assert.match(main, /stockfish-explain\.analysis-lines/);
  assert.match(main, /applyAnalysisLineCount\(Number\(button\.dataset\.analysisLines\)\)/);
  assert.match(main, /engine\.setMultiPV\(normalized\)[\s\S]*?fireAnalysis\(\)/);
  assert.match(main, /function _closeLearnPanel\(\)[\s\S]*?applyAnalysisLineCount\(\+ui\.rangeMultipv\.value, \{ persist: false, restart: false \}\)[\s\S]*?fireAnalysis\(\)/);
  assert.match(panels, /\.analysis-lines-control \{[\s\S]*?justify-content:\s*flex-start[\s\S]*?flex:\s*0 0 auto/);
  assert.match(panels, /body\.mobile-mode \.analysis-lines-btn[\s\S]*?min-width:\s*34px/);
  assert.match(panels, /body\.practice-mode:not\(\.practice-finished\) \.analysis-lines-control/);
  assert.match(panels, /body\.learn-active:not\(\.learn-exploring\) \.analysis-lines-control/);
});

test('desktop side columns scroll without moving or restructuring the board', () => {
  assert.match(layout, /body:not\(\.mobile-mode\) \.uniboard \.tools \{[\s\S]*?max-height:[\s\S]*?overflow-y:\s*auto[\s\S]*?overscroll-behavior-y:\s*contain/);
  assert.match(layout, /@media \(min-width: 1260px\)[\s\S]*?body:not\(\.mobile-mode\) \.uniboard \.side \{[\s\S]*?overflow-y:\s*auto/);
  assert.match(layout, /\.tools > \.engine-power-row \{ top:\s*0; \}/);
  assert.match(layout, /\.tools > \.ceval \{ top:\s*56px; \}/);
  assert.doesNotMatch(main, /function fitBoardSizeForSticky\(size\)/);
  assert.match(layout, /\.uniboard \.tools::\-webkit-scrollbar \{[\s\S]*?width:\s*16px/);
  assert.match(layout, /\.move-list-wrap > #move-list::\-webkit-scrollbar \{[\s\S]*?width:\s*12px/);
});

test('desktop notation keeps a protected internal scroller above the graph', () => {
  assert.match(layout, /body:not\(\.mobile-mode\) \.uniboard \.move-list-wrap \{[\s\S]*?max-height:\s*none/);
  assert.match(layout, /\.move-list-wrap > #move-list \{[\s\S]*?flex:\s*0 0 clamp\(220px, 36vh, 380px\)/);
  assert.match(layout, /\.move-list-wrap > #move-list \{[\s\S]*?min-height:\s*220px[\s\S]*?overflow-y:\s*auto/);
  assert.match(html, /id="move-list"[\s\S]*?id="notation-graph-slot"/);
  assert.match(main, /ui\.moveList\?\.addEventListener\('wheel'[\s\S]*?ui\.moveList\.scrollTop \+=/);
  assert.match(main, /moveListWrap\?\.addEventListener\('wheel'[\s\S]*?rightTools\.scrollTop \+=/);
  assert.match(main, /event\.target\?\.closest\?\.\('#move-list'\)/);
});

test('a hidden loaded-game graph reopens below the board', () => {
  assert.match(main, /function restoreReviewGraphDock\(\)[\s\S]*?classList\.contains\('review-mode'\)[\s\S]*?getElementById\('board-below-slot'\)[\s\S]*?boardSlot\.appendChild\(card\)/);
  assert.match(main, /if \(card\.hidden\) \{[\s\S]*?show\(\);[\s\S]*?if \(!restoreReviewGraphDock\(\)\) relocateForSidebar\(\)/);
  assert.doesNotMatch(main, /if \(card\.hidden\) \{\s*exitReviewMode\(\);\s*show\(\);\s*relocateForSidebar\(\)/);
});

test('double-click or double-tap launches favourites with their saved side', () => {
  assert.match(main, /double-click \/ double-tap to start/);
  assert.match(main, /const startFavouriteNow = \(key\)/);
  assert.match(main, /const savedSide = loadFavs\(\)\[key\]/);
  assert.match(main, /savedSide === 'both'[\s\S]*?Math\.random\(\)/);
  assert.match(main, /now - lastFavouriteTapAt <= 500/);
  assert.match(main, /startFavouriteNow\(leafKey\)/);
});

test('stale favourite keys are resolved tolerantly or stopped explicitly', () => {
  assert.match(main, /index\.set\(resolved\.selectorKey, resolved\)/);
  assert.match(main, /const nameKey = `\$\{group\.group\}\/\/\$\{opening\.name\}`/);
  assert.match(main, /const customKey = `custom:\/\/\$\{group\.group\}\/\$\{opening\.name\}`/);
  assert.match(main, /const pickedPracticeOpening = \(\) => resolvePracticeOpeningKey\(pSel\.value\)\?\.opening \|\| null/);
  assert.match(main, /Object\.keys\(favs\)\.filter\(key => !!resolvePracticeOpeningKey\(key\)\)/);
  assert.match(main, /if \(!op && !useCurrent\)[\s\S]*?Practice was not started[\s\S]*?return/);
  assert.match(main, /pSel\.value = '';[\s\S]*?updatePMoves\(\)/);

  const pickerBlock = main.slice(
    main.indexOf('const pickedPracticeOpening = () =>'),
    main.indexOf('// ─── Last-settings persistence', main.indexOf('const pickedPracticeOpening = () =>')),
  );
  assert.doesNotMatch(pickerBlock, /OPENINGS\[0\]\.items\[0\]/);
});

test('both-side favourites always resolve to a valid launch color', () => {
  assert.match(main, /const resolveFavouritePlaySide = \(side\) => side === 'both'[\s\S]*?Math\.random\(\)[\s\S]*?'black' : 'white'/);
  assert.match(main, /pColor\.value = resolveFavouritePlaySide\(favs\[pickedKey\]\)/);
});
