import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = name => readFile(new URL(`../${name}`, import.meta.url), 'utf8');

test('UI lab is isolated and loads its presentation layer last', async () => {
  const [html, yaml] = await Promise.all([read('index.html'), read('render.yaml')]);
  assert.match(html, /styles\/my-games\.css[\s\S]*styles\/ui-lab\.css/);
  assert.match(html, /src\/main\.js[\s\S]*src\/ui-lab\.js/);
  assert.match(html, /Stockfish\.explain · UI Lab/);
  assert.match(html, /github\.com\/heartdrmd\/stockfish-explain-ui-lab/);
  assert.match(yaml, /name:\s*stockfish-explain-ui-lab/);
  assert.match(yaml, /fetch-lichess-stockfish\.sh/);
  assert.doesNotMatch(yaml, /fetch-full-wasms\.sh/);
  assert.doesNotMatch(yaml, /^databases:/m);
  assert.doesNotMatch(yaml, /^\s*-\s*key:\s*(?:DATABASE_URL|ANTHROPIC_API_KEY)\s*$/m);
});

test('mobile primary header cannot be covered by the paid-AI control', async () => {
  const css = await read('styles/ui-lab.css');
  assert.match(css, /#global-ai-spend-lock\s*\{[\s\S]*?position:\s*static/);
  assert.match(css, /mobile-mode #auth-area\s*\{[\s\S]*?display:\s*inline-flex !important/);
  assert.match(css, /nav-collapsed #global-ai-spend-lock[\s\S]*?display:\s*none !important/);
});

test('phone landscape assigns the tools drawer to a real grid column', async () => {
  const css = await read('styles/ui-lab.css');
  assert.match(css, /orientation:\s*landscape[\s\S]*?grid-template-areas:[\s\S]*?mobile-board mobile-analysis/);
  assert.match(css, /mobile-mode \.tools,[\s\S]*?grid-area:\s*mobile-analysis[\s\S]*?position:\s*sticky/);
  assert.match(css, /mobile-drawer-collapsed \.tools,[\s\S]*?max-height:\s*48px/);
});

test('Practice uses a scrolling body and non-overlapping footer', async () => {
  const [css, js] = await Promise.all([read('styles/ui-lab.css'), read('src/ui-lab.js')]);
  assert.match(css, /#practice-modal \.tournament-setup\s*\{[\s\S]*?overflow-y:\s*auto/);
  assert.match(css, /#practice-modal \.tournament-actions\s*\{[\s\S]*?position:\s*static/);
  assert.match(js, /Choose an opening/);
  assert.match(js, /Choose your side and opponent/);
  assert.match(js, /Choose the pace/);
  assert.match(js, /quickPractice\.addEventListener\('click'/);
});
