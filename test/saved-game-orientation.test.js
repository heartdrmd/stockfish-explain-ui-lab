import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');

test('all saved-game loaders orient the board to the recorded user side', () => {
  assert.match(main, /function orientBoardForSavedGame\(userColor\)/);
  assert.match(main, /orientBoardForSavedGame\(g\.userColor\)/);
  assert.match(main, /orientBoardForSavedGame\(game\?\.user_color\)/);
  assert.match(main, /if \(desired && board\.orientation !== desired\)[\s\S]*?board\.flipBoard\(\)/);
});

test('Learn preserves the saved user orientation on mobile and desktop', () => {
  assert.match(main, /const lessonOrientation = _learn\.reviewColor \|\| practiceColor/);
  assert.match(main, /if \(board\.orientation !== lessonOrientation\)/);
});
