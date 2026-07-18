import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const main = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');

test('save-opening modal survives the opening tap and only closes deliberately', () => {
  const block = main.match(
    /\/\/ ────────── Save current position as a custom practice opening[\s\S]*?\/\/ ────────── Tournament \(engine vs engine\)/,
  )?.[0] || '';

  assert.match(block, /let backdropDismissArmed = false/);
  assert.match(block, /sModal\.hidden = false;[\s\S]*?setTimeout\(\(\) => \{[\s\S]*?backdropDismissArmed = true;[\s\S]*?\}, 500\)/);
  assert.match(block, /sClose\.addEventListener\('click', closeSaveModal\)/);
  assert.match(block, /e\.target === sModal && backdropDismissArmed/);
  assert.match(block, /sSubmit\.addEventListener\('click',[\s\S]*?closeSaveModal\(\)/);
});
