import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const main = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const layout = fs.readFileSync(new URL('../styles/layout.css', import.meta.url), 'utf8');
const panels = fs.readFileSync(new URL('../styles/panels.css', import.meta.url), 'utf8');

test('desktop engine panel cannot flex-shrink and clip selected PV lines', () => {
  assert.match(layout, /\.clock-below-scroll\) > \.ceval \{[\s\S]*?flex-shrink:\s*0/);
  assert.match(layout, /min-height:\s*min\(var\(--ceval-user-min-height, 0px\), 60dvh\)/);
  assert.match(
    layout,
    /body\.practice-mode:not\(\.practice-finished\):not\(\.mobile-mode\)[\s\S]*?min-height:\s*max\(200px, min\(var\(--ceval-user-min-height, 0px\), 60dvh\)\)/,
  );
  assert.match(layout, /body\.mobile-mode :is\(\.tools, \.clock-below-scroll\) > \.ceval \{[\s\S]*?flex-shrink:\s*0/);
});

test('engine analysis has one safe desktop-only persistent resize divider', () => {
  assert.match(html, /id="pv-lines"[\s\S]*?id="analysis-panel-resizer"[\s\S]*?role="separator"/);
  assert.match(panels, /\.analysis-panel-resizer \{ display: none; \}/);
  assert.match(panels, /body:not\(\.mobile-mode\) \.analysis-panel-resizer/);
  assert.match(main, /stockfish-explain\.ceval-min-height/);
  assert.match(main, /setPointerCapture[\s\S]*?pointermove[\s\S]*?releasePointerCapture/);
  assert.match(main, /moved:\s*false[\s\S]*?Math\.abs\(delta\) <= 2[\s\S]*?drag\.moved = true[\s\S]*?if \(completedDrag\.moved\)/);
  assert.match(main, /measuredBounds:\s*drag\.measuredBounds/);
  assert.match(main, /event\.key === 'ArrowUp'[\s\S]*?event\.key === 'ArrowDown'[\s\S]*?event\.key === 'Home'/);
  assert.match(main, /--ceval-user-min-height/);
});
