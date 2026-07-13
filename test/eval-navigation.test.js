import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [main, engine, explain] = await Promise.all([
  readFile(new URL('../src/main.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/engine.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/explain.js', import.meta.url), 'utf8'),
]);

test('undo and history navigation immediately replace the old position evaluation', () => {
  assert.match(main, /function syncDisplayedEvalToFen\(fen/);
  assert.match(main, /explainer\.showPositionEval\(fenEvalCache\.get\(fen\) \|\| null\)/);
  assert.match(main, /board\.addEventListener\('undo',[\s\S]*?fireAnalysis\(\)/);
  assert.match(main, /board\.addEventListener\('nav',[\s\S]*?syncDisplayedEvalToFen\(fen\)/);
  assert.match(explain, /gaugeBlack\.style\.height = '50%'/);
});

test('engine UI ignores stopped-search output from a different FEN', () => {
  assert.match(engine, /fen: this\.currentFen/);
  assert.match(engine, /searchId: this\._searchId/);
  assert.match(explain, /e\.detail\?\.fen && e\.detail\.fen !== this\.currentFen/);
});
