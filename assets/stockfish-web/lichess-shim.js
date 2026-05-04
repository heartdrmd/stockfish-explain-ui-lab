// lichess-shim.js — ES-module Worker that bridges
// @lichess-org/stockfish-web's direct method API to the
// postMessage/onmessage UCI string protocol that the rest of
// engine.js was written against (originally for nmrugg/stockfish.js).
//
// Loaded via:
//   new Worker('assets/stockfish-web/lichess-shim.js', { type: 'module' })
//
// What this gives us:
//
//   • All of engine.js's crash-recovery machinery (worker.onerror=fatal,
//     watchdog, durable turn queue, retry-same-flavor) keeps working
//     unchanged because the SHIM is a Worker. terminate()ing the shim
//     kills the underlying lila instance + its pthread workers in one
//     browser-level cascade.
//
//   • lila's StockfishWeb has no terminate() method. We don't need one
//     here for the same reason — the parent calls worker.terminate() on
//     us, browser cleans up.
//
//   • lila uses setNnueBuffer(buf, index) instead of UCI 'EvalFile'.
//     We expose two meta-commands on the UCI channel:
//
//        __sfw_load_small <url>   — fetch + setNnueBuffer(buf, 1)
//        __sfw_load_big   <url>   — fetch + setNnueBuffer(buf, 0)
//
//     and ack each with `info string LSF_NNUE_LOADED index=<n> bytes=<n>`
//     so engine.js can sequence the bignet-blocking ready gate.
//
// Per Phase 3 consult v4 (FULL THROTTLE policy):
//   • Bignet (index 0) is the engine — engine.js blocks ready on its ack.
//   • Smallnet (index 1) is fired in parallel as a worker-warmup; its
//     ack is informational only.
//   • setNnueBuffer takes ownership of the buffer (zero-copy via
//     transferable). Don't reuse the Uint8Array after passing.

import Sf18Web from './sf_18.js';

let inst = null;

// UCI lines received before the factory resolves get buffered and
// drained in arrival order once the instance is live. (Only meaningful
// if engine.js races a 'uci' send before our async boot — which it
// shouldn't, but be defensive.)
const inbox = [];

function dispatch(line) {
  if (!line) return;
  if (line.startsWith('__sfw_load_small ')) return loadNnue(line.slice(17), 1);
  if (line.startsWith('__sfw_load_big '))   return loadNnue(line.slice(15), 0);
  inst.uci(line);
}

self.onmessage = (e) => {
  const line = typeof e.data === 'string' ? e.data : '';
  if (!inst) { inbox.push(line); return; }
  dispatch(line);
};

(async () => {
  try {
    inst = await Sf18Web();
    inst.listen  = (s)   => self.postMessage(s);
    inst.onError = (msg) => {
      // Surface lila's runtime errors to engine.js. Throwing on the
      // microtask queue triggers self.onerror, which propagates as a
      // worker.onerror up to engine.js's crash handler (Phase 1).
      self.postMessage('info string LSF_ERROR ' + msg);
      setTimeout(() => { throw new Error('lichess SF onError: ' + msg); }, 0);
    };
    self.postMessage('info string LSF_SHIM_READY');
    // Drain anything queued during async boot.
    for (const line of inbox.splice(0)) dispatch(line);
  } catch (err) {
    // Boot failure — re-throw so worker.onerror fires upstream and
    // engine.js's _handleWorkerCrash treats it as fatal (then Phase 1
    // retry-same-flavor takes over).
    setTimeout(() => { throw err; }, 0);
  }
})();

// fetch + setNnueBuffer + ack via info string.
//
// Streams the response body so we can post progress events while
// the (large) NNUE files download. main.js listens for these and
// renders a progress bar — without them, the user sees a stalled
// "booting…" pill for 30-60+ s on cold-cache first visits.
//
// Progress events:
//   info string LSF_NNUE_PROGRESS index=<n> received=<bytes> total=<bytes>
//
// total may be 0 if the server doesn't send Content-Length (then
// main.js falls back to indeterminate spinner).
async function loadNnue(url, index /* 0=big, 1=small */) {
  try {
    const resp = await fetch(url, { credentials: 'omit' });
    if (!resp.ok) throw new Error('NNUE fetch ' + resp.status + ' ' + url);
    const total = +(resp.headers.get('content-length') || 0);
    self.postMessage(
      `info string LSF_NNUE_FETCH_START index=${index} total=${total} url=${url}`
    );

    // Stream the body so we can track progress. arrayBuffer() blocks
    // until the whole download completes, hiding progress entirely.
    const reader = resp.body?.getReader?.();
    let buf;
    if (reader) {
      const chunks = [];
      let received = 0;
      let lastReport = 0;
      // Throttle progress to one event per 250 ms or every 1 MB,
      // whichever first — keeps the postMessage stream light.
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.length;
        const now = Date.now();
        if (now - lastReport > 250 || received - lastReport > 1_048_576) {
          self.postMessage(
            `info string LSF_NNUE_PROGRESS index=${index} received=${received} total=${total}`
          );
          lastReport = now;
        }
      }
      // Concatenate into one Uint8Array — setNnueBuffer expects
      // contiguous memory.
      buf = new Uint8Array(received);
      let offset = 0;
      for (const c of chunks) { buf.set(c, offset); offset += c.length; }
    } else {
      // No streaming reader (very old browser?) — fall back to
      // arrayBuffer with no progress.
      buf = new Uint8Array(await resp.arrayBuffer());
    }

    inst.setNnueBuffer(buf, index);
    self.postMessage(
      `info string LSF_NNUE_LOADED index=${index} bytes=${buf.length}`
    );
  } catch (err) {
    self.postMessage(
      `info string LSF_NNUE_FAIL index=${index} ${err?.message || err}`
    );
  }
}
