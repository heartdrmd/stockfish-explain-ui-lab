import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('mobile opening preview obeys hidden state without blocking setup previews', async () => {
  const css = await readFile(new URL('../styles/panels.css', import.meta.url), 'utf8');
  const js = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(css, /\.mobile-preview-bar\[hidden\][\s\S]*?display:\s*none\s*!important/);
  assert.doesNotMatch(css, /body\.practice-mode\s+\.mobile-preview-bar/);
  assert.match(css, /body\.mobile-mode\s+#practice-modal\s*\{[\s\S]*?height:\s*100dvh/);
  assert.match(css, /body\.mobile-mode\s+\.mobile-preview-bar\s*\{[\s\S]*?position:\s*absolute/);
  assert.match(css, /body:not\(\.mobile-mode\)\s+\.mobile-preview-bar\s*\{\s*display:\s*none\s*!important/);
  assert.match(html, /id="practice-modal"[\s\S]*?id="mobile-preview-bar"[\s\S]*?<!-- Save-as-practice-opening modal/);
  assert.match(js, /classList\.contains\('practice-mode'\)\) hideBar\(\)/);
  assert.match(js, /const vh = window\.visualViewport\?\.height \|\| window\.innerHeight/);
  assert.doesNotMatch(js, /--mobile-preview-viewport-bottom/);
});
