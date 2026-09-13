import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import express from 'express';
import { createAssetCatalog, installAssetCache, injectAssetCatalog } from '../src/server/asset-cache.js';
import { engineDownloadUrls, ENGINE_FLAVORS } from '../src/engine.js';

async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'chess-assets-'));
  const put = async (name, body) => { await mkdir(path.dirname(path.join(root, name)), { recursive: true }); await writeFile(path.join(root, name), body); };
  await put('index.html', '<!doctype html><html><head><title>Chess</title></head><body>Play</body></html>');
  await put('zagreb/index.html', '<html><head></head><body>3D</body></html>');
  await put('zagreb/models/queen.glb', 'queen-v1');
  await put('zagreb/models/pawn.glb', 'pawn-v1');
  await put('zagreb/engine/clock.js', 'fetch(new URL("clock.wasm", self.location));');
  await put('zagreb/engine/clock.wasm', 'wasm-v1');
  await put('assets/stockfish-web/lichess-shim.js', 'import "./sf_18.js";');
  await put('assets/stockfish-web/sf_18.js', '/* engine */');
  await put('assets/stockfish-web/sf_18.wasm', 'full-v1');
  await put('assets/nnue/big.nnue', 'brain-v1');
  await put('src/main.js', '/* mutable app */');
  await put('zagreb/assets/index-aBcD1234.js', '/* hashed bundle */');
  await put('private.env', 'DO NOT SERVE');
  t.after(() => rm(root, { recursive: true, force: true }));
  return { root, put };
}
async function serve(t, root) {
  const app = express();
  app.use((req, res, next) => { res.set('Cache-Control', 'no-cache'); next(); });
  app.get('/api/settings', (req, res) => res.set('Cache-Control', 'no-store').json({ private: true }));
  const catalog = await installAssetCache(app, root);
  app.use(express.static(root));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  return { catalog, url: `http://127.0.0.1:${server.address().port}` };
}
test('content versions survive deployment timestamps; only changed models get new URLs', async t => {
  const { root, put } = await fixture(t), before = await createAssetCatalog(root);
  await utimes(path.join(root, 'zagreb/models/queen.glb'), new Date(), new Date('2030-01-01'));
  assert.deepEqual((await createAssetCatalog(root)).urls, before.urls);
  await put('zagreb/models/queen.glb', 'queen-v2');
  const after = await createAssetCatalog(root);
  assert.notEqual(after.urls['/zagreb/models/queen.glb'], before.urls['/zagreb/models/queen.glb']);
  assert.equal(after.urls['/zagreb/models/pawn.glb'], before.urls['/zagreb/models/pawn.glb']);
  assert.equal(after.urls['/assets/nnue/big.nnue'], before.urls['/assets/nnue/big.nnue']);
});
test('engine relative imports and WASM share one version, including when only WASM changes', async t => {
  const { root, put } = await fixture(t), before = await createAssetCatalog(root);
  const js = before.urls['/assets/stockfish-web/lichess-shim.js'];
  assert.equal(new URL('./sf_18.js', 'https://test'+js).pathname, before.urls['/assets/stockfish-web/sf_18.js']);
  assert.equal(new URL('./sf_18.wasm', 'https://test'+js).pathname, before.urls['/assets/stockfish-web/sf_18.wasm']);
  await put('assets/stockfish-web/sf_18.wasm', 'full-v2');
  const after = await createAssetCatalog(root);
  assert.notEqual(after.urls['/assets/stockfish-web/lichess-shim.js'], js);
  assert.equal(after.urls['/zagreb/engine/clock.js'], before.urls['/zagreb/engine/clock.js']);
});
test('real HTTP responses cache exact bytes; HTML refresh discovers a corrected model', async t => {
  const { root, put } = await fixture(t), first = await serve(t, root);
  const oldPath = first.catalog.urls['/zagreb/models/queen.glb'];
  const response = await fetch(first.url+oldPath);
  assert.equal(await response.text(), 'queen-v1');
  assert.match(response.headers.get('cache-control'), /max-age=31536000, immutable/);
  const cached = await fetch(first.url+oldPath, { headers: { 'If-None-Match': response.headers.get('etag'), 'Cache-Control': 'max-age=0' } });
  assert.equal(cached.status, 304); assert.equal((await cached.arrayBuffer()).byteLength, 0);
  const partial = await fetch(first.url+oldPath, { headers: { Range: 'bytes=0-3' } });
  assert.equal(partial.status, 206); assert.equal(await partial.text(), 'quee');
  await put('zagreb/models/queen.glb', 'queen-v2');
  const stale = await fetch(first.url+oldPath);
  assert.equal(stale.status, 410); assert.equal(stale.headers.get('cache-control'), 'no-store');
  const next = await serve(t, root), page = await fetch(next.url+'/zagreb/');
  const html = await page.text();
  assert.equal(page.headers.get('cache-control'), 'no-cache');
  const urls = JSON.parse(html.match(/id="asset-catalog" type="application\/json">(.*?)<\/script>/)[1]);
  assert.notEqual(urls['/zagreb/models/queen.glb'], oldPath);
  assert.equal(await (await fetch(next.url+urls['/zagreb/models/queen.glb'])).text(), 'queen-v2');
  const obsolete = await fetch(next.url+oldPath);
  assert.equal(obsolete.status, 404); assert.equal(obsolete.headers.get('cache-control'), 'no-store');
});
test('long caching is limited to known assets; mutable code and private APIs keep their policy', async t => {
  const { root } = await fixture(t), { url, catalog } = await serve(t, root);
  assert.equal(catalog.urls['/src/main.js'], undefined);
  assert.equal(catalog.urls['/private.env'], undefined);
  assert.equal((await fetch(url+'/api/settings')).headers.get('cache-control'), 'no-store');
  assert.equal((await fetch(url+'/src/main.js')).headers.get('cache-control'), 'no-cache');
  assert.match((await fetch(url+'/zagreb/assets/index-aBcD1234.js')).headers.get('cache-control'), /immutable/);
  assert.doesNotMatch((await fetch(url+'/zagreb/assets/missing-aBcD1234.js')).headers.get('cache-control') || '', /immutable/);
  const bad = await fetch(url+'/asset-cache/'+'a'.repeat(64)+'/private.env');
  assert.equal(bad.status, 404); assert.equal(bad.headers.get('cache-control'), 'no-store');
  const wasm = await fetch(url+catalog.urls['/zagreb/engine/clock.wasm']);
  assert.match(wasm.headers.get('content-type'), /application\/wasm/);
  assert.equal(wasm.headers.get('cross-origin-resource-policy'), 'cross-origin');
  assert.ok(injectAssetCatalog('<head></head>', { a: '</script>' }).includes('\\u003c/script>'));
});
test('explicit preload uses the actual full-engine dependencies, without a nonexistent shim.wasm', () => {
  const urls = engineDownloadUrls(ENGINE_FLAVORS['lichess-full']);
  assert.ok(urls.includes('assets/stockfish-web/sf_18.wasm'));
  assert.ok(urls.includes('/assets/nnue/big.nnue'));
  assert.ok(!urls.some(url => url.includes('lichess-shim.wasm')));
});
