import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('mobile Practice settings card cannot rubber-band horizontally', async () => {
  const css = await readFile(new URL('../styles/panels.css', import.meta.url), 'utf8');
  assert.match(css, /body\.mobile-mode\s+#practice-modal\s+\.modal-card\s*\{[\s\S]*?overflow-x:\s*hidden/);
  assert.match(css, /body\.mobile-mode\s+#practice-modal\s+\.modal-card\s*\{[\s\S]*?overscroll-behavior-x:\s*none/);
  const rule = css.match(/body\.mobile-mode\s+#practice-modal\s+\.modal-card\s*\{([\s\S]*?)\}/)?.[1] || '';
  assert.doesNotMatch(rule, /touch-action:\s*pan-y/);
});
