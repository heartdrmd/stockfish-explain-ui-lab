import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  aiSpendPasswordDayCT,
  aiSpendStampCT,
  expectedAISpendPassword,
  hasCurrentAISpendCookie,
} from '../src/server/ai-spend-lock.js';
import * as AICoach from '../src/ai-coach.js';

test('paid-AI password uses the two-digit Central-Time day five days ahead', () => {
  const august9 = new Date('2026-08-09T18:00:00Z');
  assert.equal(aiSpendPasswordDayCT(august9), '14');
  assert.equal(expectedAISpendPassword('example-prefix-', august9), 'example-prefix-14');

  const monthEnd = new Date('2026-08-29T18:00:00Z');
  assert.equal(aiSpendPasswordDayCT(monthEnd), '03', 'must wrap into the next month');

  const leapYear = new Date('2028-02-25T18:00:00Z');
  assert.equal(aiSpendPasswordDayCT(leapYear), '01', 'must wrap across leap day');
});

test('paid-AI cookie is tied to the full current Central calendar date', () => {
  const now = new Date('2026-08-09T18:00:00Z');
  assert.equal(aiSpendStampCT(now), '2026-08-09');
  assert.equal(hasCurrentAISpendCookie('2026-08-09', now), true);
  assert.equal(hasCurrentAISpendCookie('2026-07-09', now), false);
  assert.equal(hasCurrentAISpendCookie('09', now), false);
});

test('the application AI client fails closed before constructing a paid request', async () => {
  await AICoach.refreshPaidAILock(); // Node/direct mode always resets locked.
  assert.equal(AICoach.isPaidAIUnlocked(), false);
  await assert.rejects(
    AICoach.askCoach({ fen: '8/8/8/8/8/8/8/K6k w - - 0 1' }),
    /AI_SPEND_LOCKED/,
  );
});

test('server and every paid UI entry point are guarded by the master lock', async () => {
  const server = await readFile(new URL('../server.js', import.meta.url), 'utf8');
  const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');

  const routeStart = server.indexOf("app.post('/api/ai'");
  const lockCheck = server.indexOf('if (!isPaidAIUnlocked(req))', routeStart);
  const upstreamFetch = server.indexOf("fetch('https://api.anthropic.com", routeStart);
  assert.ok(routeStart >= 0 && lockCheck > routeStart, 'API route must contain the lock check');
  assert.ok(upstreamFetch > lockCheck, 'lock check must run before the Anthropic fetch');
  assert.match(server, /status\(423\)[\s\S]*?AI_SPEND_LOCKED/);
  assert.match(server, /AI_SPEND_PW_PREFIX/);

  for (const id of ['combined-ai-btn', 'position-ai-btn', 'coach-ai-btn', 'tactics-ai-btn']) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
    assert.match(main, new RegExp(`'${id}'`));
  }
  assert.match(main, /await wirePaidAILockEarly\(\)[\s\S]*?wireAiButtonsEarly\(\)/);
  assert.match(main, /if \(!AICoach\.isPaidAIUnlocked\(\)\)[\s\S]*?renderPaidAILocked/);
});
