import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');

test('mobile archived-game review keeps Learn controls with the graph', () => {
  assert.match(main, /const mobileReview = card\.classList\.contains\('review-mode'\)[\s\S]*?classList\.contains\('mobile-mode'\)/);
  assert.match(main, /\(!card\.classList\.contains\('review-mode'\) \|\| mobileReview\)[\s\S]*?card\.appendChild\(statsWrap\)/);
  assert.match(main, /classList\.contains\('mobile-mode'\)\) statsWrap\.prepend\(cta\)/);
});

test('archived-game Learn controls survive graph refreshes', () => {
  assert.match(main, /existingReviewCta = statsWrap\.querySelector\('\.live-graph-cta'\)/);
  assert.match(main, /statsWrap\.prepend\(existingReviewCta\)/);
});
