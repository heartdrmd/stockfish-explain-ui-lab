import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');

test('mobile archived-game review keeps Learn controls with the graph', () => {
  assert.match(main, /const mobileReview = card\.classList\.contains\('review-mode'\)[\s\S]*?classList\.contains\('mobile-mode'\)/);
  assert.match(main, /\(!card\.classList\.contains\('review-mode'\) \|\| mobileReview\)[\s\S]*?card\.appendChild\(statsWrap\)/);
  assert.match(main, /function placeReviewCta\(cta\)[\s\S]*?classList\.contains\('mobile-mode'\)[\s\S]*?statsWrap\.prepend\(cta\)/);
});

test('archived-game Learn controls survive graph refreshes', () => {
  assert.match(main, /function findReviewCta\(\)[\s\S]*?reviewLearnSlot\?\.querySelector\('\.live-graph-cta'\)[\s\S]*?statsWrap\.querySelector\('\.live-graph-cta'\)/);
  assert.match(main, /const existingReviewCta = findReviewCta\(\)[\s\S]*?placeReviewCta\(existingReviewCta\)/);
});

test('desktop archived-game Learn controls live outside the scrolling stats pane', () => {
  assert.match(main, /function placeReviewCta\(cta\)[\s\S]*?reviewLearnSlot\.appendChild\(cta\)/);
  assert.match(main, /findReviewCta\(\)\?\.remove\(\)[\s\S]*?classList\.remove\('review-mode'\)/);
});
