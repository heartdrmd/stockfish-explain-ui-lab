import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [main, css, html] = await Promise.all([
  readFile(new URL('../src/main.js', import.meta.url), 'utf8'),
  readFile(new URL('../styles/layout.css', import.meta.url), 'utf8'),
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
]);

test('mobile sign-in opens as a fixed visible overlay', () => {
  assert.match(css, /\.modal-backdrop\s*\{[\s\S]*?position:\s*fixed[\s\S]*?inset:\s*0[\s\S]*?z-index:\s*10000/);
  assert.match(css, /\.modal-backdrop\[hidden\]\s*\{\s*display:\s*none\s*!important/);
  assert.match(main, /authModal\.hidden = false;[\s\S]*?authModal\.scrollTop = 0/);
});

test('mobile authenticated header says Log out and invokes logout', () => {
  assert.match(main, /mobileHeader \? '↪ Log out' : '👤 Sign in'/);
  assert.match(main, /if \(window\.__currentUser\) logoutCurrentUser\(\)/);
  assert.match(html, /id="btn-logout"[^>]*>Log out<\/button>/);
});
