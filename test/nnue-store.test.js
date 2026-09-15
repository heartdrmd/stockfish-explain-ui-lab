import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import { createNnueStore, nnueDescriptor, NNUE_DIRECTORY } from '../assets/stockfish-web/nnue-store.js';

const origin = 'https://chess.test';
const hash = data => createHash('sha256').update(data).digest('hex');
const contents = text => new TextEncoder().encode(text);
function address(bytes, name = 'big') {
  return `/asset-cache/${hash(`assets/nnue/${name}.nnue\0${hash(bytes)}`)}/assets/nnue/${name}.nnue`;
}
const missing = () => new DOMException('Missing', 'NotFoundError');
function fixture() {
  const files = new Map(), queues = new Map(), calls = [], state = { failWrite: false, failStorage: false, failLock: false };
  const directory = {
    async getFileHandle(name, { create = false } = {}) {
      if (!files.has(name)) { if (!create) throw missing(); files.set(name, new Uint8Array()); }
      return {
        async getFile() { const bytes = files.get(name); return { size: bytes.byteLength, arrayBuffer: async () => bytes.slice().buffer }; },
        async createWritable() {
          let pending;
          return {
            async write(bytes) { if (state.failWrite) throw new DOMException('Disk full', 'QuotaExceededError'); pending = bytes.slice(); },
            async close() { files.set(name, pending); },
            async abort() {},
          };
        },
      };
    },
    async removeEntry(name) { files.delete(name); },
    async *entries() { for (const name of files.keys()) yield [name, { kind: 'file' }]; },
  };
  const storage = { async getDirectory() {
    if (state.failStorage) throw new DOMException('Not allowed', 'SecurityError');
    return { async getDirectoryHandle(name) { assert.equal(name, NNUE_DIRECTORY); return directory; } };
  } };
  const locks = { async request(name, options, action) {
    if (state.failLock) throw new DOMException('Not allowed', 'SecurityError');
    if (typeof options === 'function') action = options;
    const previous = queues.get(name) || Promise.resolve();
    const next = previous.then(() => { options?.signal?.throwIfAborted(); return action(); });
    queues.set(name, next.catch(() => {}));
    return next;
  } };
  const responses = new Map();
  const dependencies = { origin, crypto: webcrypto, storage, locks, async fetch(url, options) {
    calls.push({ url, options });
    options?.signal?.throwIfAborted();
    const value = responses.get(url);
    if (typeof value === 'function') return value(options);
    if (value instanceof Error) throw value;
    return new Response(value || 'not found', { status: value ? 200 : 404 });
  } };
  return { files, state, calls, responses, dependencies, store: createNnueStore(dependencies) };
}

test('persistent copies are independently verified and reusable by a fresh store instance', async () => {
  const f = fixture(), bytes = contents('full-strength neural network'), url = address(bytes), events = [];
  f.responses.set(url, bytes);
  assert.deepEqual(await f.store.load(url, { onProgress: e => events.push(e.phase) }), bytes);
  assert.deepEqual(events.filter(e => e.startsWith('cache')), ['cache-stored']);
  f.responses.clear();
  const second = createNnueStore(f.dependencies);
  assert.deepEqual(await second.load(url, { onProgress: e => events.push(e.phase) }), bytes);
  assert.equal(events.at(-1), 'cache-hit');
  assert.equal(f.calls.length, 1);
});

test('separate callers sharing the origin lock download once and receive separate buffers', async () => {
  const f = fixture(), bytes = contents('shared network'), url = address(bytes);
  f.responses.set(url, bytes);
  const [a, b] = await Promise.all([f.store.load(url), createNnueStore(f.dependencies).load(url)]);
  assert.equal(f.calls.length, 1);
  assert.notEqual(a.buffer, b.buffer);
  structuredClone(a, { transfer: [a.buffer] });
  assert.deepEqual(b, bytes, 'transferring one engine buffer cannot detach another engine buffer');
});

test('same-size corruption and interrupted empty files are replaced before use', async () => {
  for (const corrupt of [contents('xxxxxxxx'), new Uint8Array()]) {
    const f = fixture(), bytes = contents('abcdefgh'), url = address(bytes), descriptor = nnueDescriptor(url, origin), events = [];
    f.files.set(descriptor.file, corrupt); f.responses.set(url, bytes);
    assert.deepEqual(await f.store.load(url, { onProgress: e => events.push(e.phase) }), bytes);
    assert.ok(events.includes('cache-corrupt'));
    assert.deepEqual(f.files.get(descriptor.file), bytes);
    assert.equal(f.calls.length, 1);
  }
});

test('version changes load new bytes, clean only obsolete same-network files, and keep other data', async () => {
  const f = fixture(), old = contents('old'), current = contents('new'), small = contents('small');
  for (const [bytes, name] of [[old, 'big'], [small, 'small'], [current, 'big']]) {
    const url = address(bytes, name); f.responses.set(url, bytes); await f.store.load(url);
  }
  assert.ok(!f.files.has(nnueDescriptor(address(old), origin).file));
  assert.deepEqual(f.files.get(nnueDescriptor(address(current), origin).file), current);
  assert.deepEqual(f.files.get(nnueDescriptor(address(small, 'small'), origin).file), small);
  f.files.set('user-notes', contents('leave this alone'));
  await f.store.clear();
  assert.deepEqual([...f.files.keys()], ['user-notes']);
});

test('missing/denied storage, unavailable locks and quota failure use one normal download', async () => {
  for (const failure of ['failStorage', 'failLock', 'failWrite', 'noStorage', 'noLocks']) {
    const f = fixture(), bytes = contents('valid network'), url = address(bytes);
    f.responses.set(url, bytes); f.state[failure] = true;
    const dependencies = { ...f.dependencies };
    if (failure === 'noStorage') dependencies.storage = null;
    if (failure === 'noLocks') dependencies.locks = null;
    assert.deepEqual(await createNnueStore(dependencies).load(url), bytes, failure);
    assert.equal(f.calls.length, 1, failure);
    assert.ok(![...f.files.values()].some(value => value.byteLength > 0), failure);
  }
});

test('an invalid HTTP-cached response is retried once with reload, then verified before storing', async () => {
  const f = fixture(), bytes = contents('correct bytes'), url = address(bytes);
  f.responses.set(url, options => new Response(options.cache === 'reload' ? bytes : contents('wrong bytes')));
  assert.deepEqual(await f.store.load(url), bytes);
  assert.equal(f.calls.length, 2);
  assert.equal(f.calls[1].options.cache, 'reload');
});

test('repeated integrity failure and network errors never become saved networks', async () => {
  for (const fail of [contents('corrupt'), new TypeError('Network offline')]) {
    const f = fixture(), bytes = contents('expected'), url = address(bytes);
    f.responses.set(url, fail);
    await assert.rejects(f.store.load(url), fail instanceof Error ? /offline/ : /does not match/);
    assert.equal(f.files.size, 0);
    assert.equal(f.calls.length, fail instanceof Error ? 1 : 2);
  }
});

test('aborted downloads leave no usable cached file and release the lock for a later start', async () => {
  const f = fixture(), bytes = contents('complete'), url = address(bytes), controller = new AbortController();
  f.responses.set(url, () => { controller.abort(); throw new DOMException('Aborted', 'AbortError'); });
  await assert.rejects(f.store.load(url, { signal: controller.signal }), /Aborted/);
  assert.equal(f.files.size, 0);
  f.responses.set(url, bytes);
  assert.deepEqual(await f.store.load(url), bytes);
});

test('mutable and foreign URLs bypass OPFS; a lookalike path cannot select local files', async () => {
  const f = fixture(), bytes = contents('raw fallback');
  for (const url of ['/assets/nnue/big.nnue', 'https://other.test' + address(bytes), '/asset-cache/' + 'a'.repeat(64) + '/private/settings.json']) {
    assert.equal(nnueDescriptor(url, origin), null);
    f.responses.set(url, bytes);
    assert.deepEqual(await f.store.load(url), bytes);
  }
  assert.equal(f.files.size, 0);
});
