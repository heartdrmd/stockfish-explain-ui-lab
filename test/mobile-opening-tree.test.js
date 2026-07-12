import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('mobile opening browser is vertical-only and long names can shrink', async () => {
  const css = await readFile(new URL('../styles/panels.css', import.meta.url), 'utf8');
  assert.match(css, /body\.mobile-mode\s+\.practice-opening-tree\s*\{[\s\S]*?overflow-x:\s*hidden/);
  assert.match(css, /body\.mobile-mode\s+\.practice-opening-tree\s*\{[\s\S]*?touch-action:\s*pan-y/);
  assert.match(css, /body\.mobile-mode\s+\.practice-opening-tree\s+\.tree-leaf-name\s*\{[\s\S]*?min-width:\s*0/);
  assert.match(css, /body\.mobile-mode\s+\.practice-opening-tree\s+\.tree-leaf-name\s*\{[\s\S]*?-webkit-line-clamp:\s*2/);
});
