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

test('move-accuracy eye toggle never hides the eval bar', () => {
  assert.match(html, /id="nav-hide-panels"[^>]*title="Hide move accuracy colors"/);
  assert.match(main, /btn\.title = hidden \? 'Show move accuracy colors' : 'Hide move accuracy colors'/);
  assert.doesNotMatch(main, /gaugeControl\.classList\.toggle\('panels-hidden'/);
  assert.doesNotMatch(panels, /\.eval-gauge-control\.panels-hidden/);
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

test('double-click or double-tap launches favourites with their saved side', () => {
  assert.match(main, /double-click \/ double-tap to start/);
  assert.match(main, /const startFavouriteNow = \(key\)/);
  assert.match(main, /const savedSide = loadFavs\(\)\[key\]/);
  assert.match(main, /savedSide === 'both'[\s\S]*?Math\.random\(\)/);
  assert.match(main, /now - lastFavouriteTapAt <= 500/);
  assert.match(main, /startFavouriteNow\(leafKey\)/);
});
