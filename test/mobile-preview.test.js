import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('mobile opening preview obeys hidden state and cannot cover a live game', async () => {
  const css = await readFile(new URL('../styles/panels.css', import.meta.url), 'utf8');
  assert.match(css, /\.mobile-preview-bar\[hidden\][\s\S]*?display:\s*none\s*!important/);
  assert.match(css, /body\.practice-mode\s+\.mobile-preview-bar[\s\S]*?display:\s*none\s*!important/);
});
