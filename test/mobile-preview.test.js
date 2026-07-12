import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('mobile opening preview obeys hidden state without blocking setup previews', async () => {
  const css = await readFile(new URL('../styles/panels.css', import.meta.url), 'utf8');
  const js = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(css, /\.mobile-preview-bar\[hidden\][\s\S]*?display:\s*none\s*!important/);
  assert.doesNotMatch(css, /body\.practice-mode\s+\.mobile-preview-bar/);
  assert.match(js, /classList\.contains\('practice-mode'\)\) hideBar\(\)/);
  assert.match(js, /visualViewport[\s\S]*?--mobile-preview-viewport-bottom/);
});
