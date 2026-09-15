// A private, verified store for external NNUE files only. No service worker,
// WASM interception, account data or application settings are involved.
export const NNUE_DIRECTORY = 'stockfish-nnue-v1';
const MAX_BYTES = 512 * 1024 * 1024;
const lockName = name => `${NNUE_DIRECTORY}:${name}`;

// asset-cache.js versions a single NNUE as SHA256(path + NUL + SHA256(bytes)).
// Unversioned/local-file launches retain ordinary HTTP loading; their URL
// cannot prove which network version it represents.
export function nnueDescriptor(input, origin) {
  try {
    const url = new URL(input, origin);
    const match = /^\/asset-cache\/([a-f0-9]{64})\/(assets\/nnue\/(big|small)\.nnue)$/.exec(url.pathname);
    if (!match || url.origin !== origin || !/^https?:$/.test(url.protocol)) return null;
    return { version: match[1], path: match[2], name: match[3], file: `${match[3]}-${match[1]}.nnue` };
  } catch { return null; }
}

class IntegrityError extends Error {}
const hex = buffer => Array.from(new Uint8Array(buffer), b => b.toString(16).padStart(2, '0')).join('');

export function createNnueStore({
  storage = globalThis.navigator?.storage,
  locks = globalThis.navigator?.locks,
  crypto = globalThis.crypto,
  fetch = globalThis.fetch?.bind(globalThis),
  origin = globalThis.location?.origin,
} = {}) {
  async function verify(bytes, descriptor) {
    if (!bytes.byteLength || bytes.byteLength > MAX_BYTES) throw new IntegrityError('Invalid NNUE length');
    if (!descriptor || !crypto?.subtle) return;
    const digest = hex(await crypto.subtle.digest('SHA-256', bytes));
    const version = hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${descriptor.path}\0${digest}`)));
    if (version !== descriptor.version) throw new IntegrityError('NNUE content does not match its version');
  }

  async function download(url, descriptor, { signal, onProgress }, retry = false) {
    const response = await fetch(url, { credentials: 'omit', signal, ...(retry ? { cache: 'reload' } : {}) });
    if (!response.ok) throw new Error(`NNUE fetch ${response.status} ${url}`);
    const total = Number(response.headers.get('content-length')) || 0;
    onProgress({ phase: 'fetch-start', total, received: 0 });
    const reader = response.body?.getReader?.();
    let bytes;
    if (reader) {
      const chunks = [];
      let received = 0, lastTime = 0, lastBytes = 0;
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          received += value.byteLength;
          if (received > MAX_BYTES) throw new IntegrityError('NNUE exceeds size limit');
          chunks.push(value);
          const now = Date.now();
          if (now - lastTime >= 250 || received - lastBytes >= 1048576) {
            onProgress({ phase: 'progress', received, total });
            lastTime = now; lastBytes = received;
          }
        }
      } catch (error) {
        await reader.cancel().catch(() => {});
        throw error;
      } finally { reader.releaseLock(); }
      bytes = new Uint8Array(received);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    } else bytes = new Uint8Array(await response.arrayBuffer());
    try { await verify(bytes, descriptor); }
    catch (error) {
      // A poisoned HTTP cache gets one fresh attempt. Never store or hand an
      // invalid network to Stockfish, and never retry ordinary network errors.
      if (error instanceof IntegrityError && !retry) {
        onProgress({ phase: 'cache-retry' });
        return download(url, descriptor, { signal, onProgress }, true);
      }
      throw error;
    }
    return bytes;
  }

  async function load(url, { signal, onProgress = () => {} } = {}) {
    const descriptor = nnueDescriptor(url, origin);
    const options = { signal, onProgress };
    const canStore = descriptor && crypto?.subtle && storage?.getDirectory && locks?.request;
    if (!canStore) return download(url, descriptor, options);

    let entered = false;
    try {
      // Shared by tabs and workers. A terminated worker releases its lock;
      // followers recheck disk before fetching. Every caller owns its buffer.
      return await locks.request(lockName(descriptor.name), { signal }, async () => {
        entered = true;
        let directory;
        try {
          directory = await (await storage.getDirectory()).getDirectoryHandle(NNUE_DIRECTORY, { create: true });
          const file = await (await directory.getFileHandle(descriptor.file)).getFile();
          if (!file.size || file.size > MAX_BYTES) throw new IntegrityError('Invalid saved NNUE length');
          const bytes = new Uint8Array(await file.arrayBuffer());
          await verify(bytes, descriptor);
          onProgress({ phase: 'cache-hit', received: bytes.byteLength, total: bytes.byteLength });
          return bytes;
        } catch (error) {
          if (error instanceof IntegrityError) {
            onProgress({ phase: 'cache-corrupt' });
            await directory?.removeEntry(descriptor.file).catch(() => {});
          } else if (error.name !== 'NotFoundError') onProgress({ phase: 'cache-unavailable' });
        }

        const bytes = await download(url, descriptor, options);
        signal?.throwIfAborted();
        if (directory) {
          let writer;
          try {
            const handle = await directory.getFileHandle(descriptor.file, { create: true });
            writer = await handle.createWritable();
            await writer.write(bytes);
            signal?.throwIfAborted();
            // createWritable commits atomically on close. Interrupted writes
            // never count as hits; every subsequent read verifies the digest.
            await writer.close();
            writer = null;
            onProgress({ phase: 'cache-stored', received: bytes.byteLength });
            // Retain only the version just verified, for this network name.
            // The same per-name lock also protects cleanup and explicit Clear.
            for await (const [name] of directory.entries()) {
              if (new RegExp(`^${descriptor.name}-[a-f0-9]{64}\\.nnue$`).test(name) && name !== descriptor.file)
                await directory.removeEntry(name).catch(() => {});
            }
          } catch {
            await writer?.abort().catch(() => {});
            onProgress({ phase: 'cache-unavailable' });
            // Storage/quota failure must not trigger a second download or
            // prevent the already-verified buffer from starting the engine.
          }
        }
        signal?.throwIfAborted();
        return bytes;
      });
    } catch (error) {
      if (entered || signal?.aborted) throw error;
      // Lock APIs can exist but be denied in an embedded/private context.
      onProgress({ phase: 'cache-unavailable' });
      return download(url, descriptor, options);
    }
  }

  async function clear() {
    if (!storage?.getDirectory || !locks?.request) return;
    // Leave the directory itself, and all unrelated site data, untouched.
    for (const network of ['big', 'small']) {
      await locks.request(lockName(network), async () => {
        let directory;
        try { directory = await (await storage.getDirectory()).getDirectoryHandle(NNUE_DIRECTORY); }
        catch (error) { if (error.name === 'NotFoundError') return; throw error; }
        for await (const [name] of directory.entries()) {
          if (new RegExp(`^${network}-[a-f0-9]{64}\\.nnue$`).test(name)) await directory.removeEntry(name);
        }
      });
    }
  }
  return { load, clear };
}

const store = createNnueStore();
export const loadNnueBytes = (url, options) => store.load(url, options);
export const clearNnueStore = () => store.clear();
