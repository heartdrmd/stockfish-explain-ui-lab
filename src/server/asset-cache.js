import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

const PREFIX = '/asset-cache/';
const IMMUTABLE = 'public, max-age=31536000, immutable';
const hash = value => createHash('sha256').update(value).digest('hex');
async function hashFile(file) {
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(file)) digest.update(chunk);
  return digest.digest('hex');
}
async function filesIn(root, dir) {
  const result = [];
  let entries;
  try { entries = await readdir(path.join(root, dir), { withFileTypes: true }); }
  catch (error) { if (error.code === 'ENOENT') return result; throw error; }
  for (const entry of entries) {
    const name = `${dir}/${entry.name}`;
    if (entry.isDirectory()) result.push(...await filesIn(root, name));
    else if (entry.isFile()) result.push(name); // Never follow symlinks outside the allowlist.
  }
  return result.sort();
}

// Only these public binary assets are eligible. APIs, account settings, HTML,
// and mutable application modules never acquire immutable caching here.
export async function createAssetCatalog(root) {
  const groups = new Map();
  for (const dir of ['zagreb/models', 'zagreb/clocks', 'zagreb/engine', 'assets/stockfish', 'assets/stockfish-web', 'assets/nnue']) {
    for (const name of await filesIn(root, dir)) {
      if (!/\.(glb|js|wasm|nnue)$/.test(name)) continue;
      // Workers resolve WASM and helper imports relative to their own URL.
      // Keep each engine family in one versioned directory, preserving names.
      const group = dir === 'zagreb/engine' || dir === 'assets/stockfish-web' ? dir
        : dir === 'assets/stockfish' ? name.replace(/\.(js|wasm)$/, '') : name;
      if (!groups.has(group)) groups.set(group, []);
      const file = path.join(root, name), info = await stat(file);
      groups.get(group).push({ name, file, digest: await hashFile(file), size: info.size, mtime: info.mtimeMs });
    }
  }
  const urls = Object.create(null), entries = new Map();
  for (const assets of groups.values()) {
    const version = hash(assets.map(a => `${a.name}\0${a.digest}`).join('\n'));
    for (const asset of assets) {
      const url = `${PREFIX}${version}/${asset.name}`;
      urls[`/${asset.name}`] = url;
      entries.set(url, asset);
    }
  }
  return { urls, entries };
}

export function injectAssetCatalog(html, urls) {
  const json = JSON.stringify(urls).replace(/</g, '\\u003c');
  return html.replace(/<head\b[^>]*>/i, head => `${head}<script id="asset-catalog" type="application/json">${json}</script>`);
}

export async function installAssetCache(app, root) {
  const catalog = await createAssetCatalog(root);
  const bundles = new Set((await filesIn(root, 'zagreb/assets')).map(name => '/' + name));
  const pages = new Map();
  for (const [file, routes] of [
    ['index.html', ['/', '/index.html']],
    ['zagreb/index.html', ['/zagreb/', '/zagreb/index.html']],
    ['zagreb/settings.html', ['/zagreb/settings.html']],
  ]) {
    try {
      const html = injectAssetCatalog(await readFile(path.join(root, file), 'utf8'), catalog.urls);
      for (const route of routes) pages.set(route, html);
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  app.use(async (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    if (pages.has(req.path)) return res.set('Cache-Control', 'no-cache').type('html').send(pages.get(req.path));
    if (bundles.has(req.path) && /^\/zagreb\/assets\/[^/]+-[\w-]{8,}\.(js|css|woff2|webp)$/.test(req.path)) {
      res.set('Cache-Control', IMMUTABLE);
      return next();
    }
    if (!req.path.startsWith(PREFIX)) return next();
    const asset = catalog.entries.get(req.path);
    if (!asset) return res.set('Cache-Control', 'no-store').status(404).send('Asset version unavailable. Reload to get the current version.');
    try {
      // A local file edit must never serve changed bytes under an old hash.
      const current = await stat(asset.file);
      if (current.size !== asset.size || current.mtimeMs !== asset.mtime) {
        if (await hashFile(asset.file) !== asset.digest)
          return res.set('Cache-Control', 'no-store').status(410).send('Asset changed. Restart the server and reload.');
        asset.size = current.size; asset.mtime = current.mtimeMs;
      }
      res.set('Cache-Control', IMMUTABLE);
      res.set('ETag', `"${asset.digest}"`);
      res.set('Cross-Origin-Resource-Policy', 'cross-origin');
      if (asset.name.endsWith('.wasm')) res.type('application/wasm');
      res.sendFile(asset.file, { lastModified: false }, error => {
        if (error && !res.headersSent) { res.set('Cache-Control', 'no-store'); next(error); }
      });
    } catch (error) { next(error); }
  });
  return catalog;
}
