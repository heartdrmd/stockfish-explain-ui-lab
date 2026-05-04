# Phase 3 — migrate default engine to lichess-org/stockfish-web

## TL;DR

Today's default engine (`flavor: 'full'`) is the **Chess.com / nmrugg
stockfish.js** distribution running embedded NNUE. We've now seen
hard `RuntimeError: memory access out of bounds` traps inside
`stockfish.wasm,worker` on at least Windows/Edge (Phase 1
consultation). Our Phase 1 architecture *recovers* (worker.onerror →
synthetic stuck-bestmove → durable engine-turn replay → retry-same-
flavor max 3), but the underlying binary is still the wrong one.

Phase 3 = swap that binary out for **lichess-org / stockfish-web**
(`lila-stockfish-web` v0.0.11 on npm), specifically the **sf171-79**
build (Stockfish 17.1, official release, `-O3 -DNDEBUG`).

This doc is a **plan + code sketch + question list for GPT review**.
Nothing has been implemented yet on disk beyond the placeholder
`sf-fast` flavor entry already in `src/engine.js` (lines 13–22). The
asset files (`assets/stockfish-web/sf_18.js`, `assets/nnue/*.nnue`)
do **not** exist yet.

We want GPT's read on:

1. Adapter architecture (Worker-shim vs. main-thread vs. polymorphic
   backend in the `Engine` class).
2. NNUE hosting + smallnet→bignet hot-swap correctness.
3. ESM-module-as-Worker pitfalls + COOP/COEP requirements.
4. Whether to keep the nmrugg flavors at all, and how to phase it.

---

## Why this is Phase 3 (not Phase 2)

Phase 2 was "auto-fall back to lite when full crashes." User vetoed:

> "i want FULL always I dont want light.......no fall back to lite"

So Phase 3 keeps full strength but swaps to a binary that doesn't
trap. lichess.org runs this on millions of analyses a day. We've
not seen a single user-reported `memory access out of bounds` trap
attributed to it.

---

## What ships in `lila-stockfish-web@0.0.11`

```text
package/
├── package.json          (type: "module", main types: stockfishWeb.d.ts)
├── stockfishWeb.d.ts     (the entire public API — see below)
├── README.md
├── LICENSE               (AGPL-3.0-or-later)
├── sf16-7.js     27 KB   ┐  Stockfish 16 linrock build
├── sf16-7.wasm  423 KB   ┘
├── sf171-79.js   27 KB   ┐  Stockfish 17.1 official release ← what we want
├── sf171-79.wasm 516 KB  ┘
├── fsf14.js      27 KB   ┐  Fairy-Stockfish 14 (variants — not relevant here)
└── fsf14.wasm   790 KB   ┘
```

NNUE files are **not** bundled. We host them ourselves. From README:

```text
sf171-79
  big nnue:   nn-1c0000000000.nnue   (~75 MB)
  small nnue: nn-37f18f62d772.nnue   (~6 MB)
```

(README has a typo'd "nn-1111cefa1111.nnue" link; the actual filename
returned by `getRecommendedNnue(0)` is `nn-1c0000000000.nnue`.)

### Public API (verbatim from `stockfishWeb.d.ts`)

```ts
declare module 'lila-stockfish-web' {
  interface StockfishWeb {
    uci(command: string): void;          // send UCI line
    listen: (data: string) => void;      // attach listener (ASSIGNMENT)
    setNnueBuffer(data: Uint8Array, index?: number): void;
                                          // 0 = big, 1 = small
    getRecommendedNnue(index?: number): string;
                                          // bare filename
    onError: (msg: string) => void;      // attach error handler (ASSIGNMENT)
  }
  export default StockfishWeb;
}
```

That's the **whole** surface. No `terminate()`, no `postMessage`, no
events. Just four calls.

### How it actually loads

`sf171-79.js` opens with:

```js
var Sf17179Web = (() => {
  var _scriptName = import.meta.url;
  ...
})();
export default Sf17179Web;
```

So it's an **ES module that exports an async factory function**. You
call `Sf17179Web()` (or with options) and get back a Promise that
resolves to a `StockfishWeb` object. Internally it spawns its own
**pthread workers** (6 references to `Worker` / `importScripts`
inside the bundle), so we don't need to put it in a Worker ourselves
— it already is one underneath.

**Crucial:** `import.meta.url` means it must be loaded as a real ES
module from a URL (not bundled into a non-module script). And because
it spawns pthread workers, the page **must be cross-origin isolated**
(COOP/COEP — we already are).

---

## Comparison: nmrugg vs lichess shapes

| | nmrugg/stockfish.js | lila-stockfish-web |
|---|---|---|
| Distribution | classic JS, `new Worker(url)` | ES module, `import` + factory |
| API | postMessage strings, onmessage events | `uci()`, `listen=`, `onError=` |
| NNUE | embedded in .wasm (108 MB binary) | external file, `setNnueBuffer()` |
| Threads | Internal pthread pool | Same |
| Errors | `worker.onerror` (we wrap this) | `onError = (msg) => …` |
| Boot | `new Worker()` → send `uci` | `await Sf17179Web()` → `.uci('uci')` |
| Stop search | `worker.postMessage('stop')` | `inst.uci('stop')` |
| Terminate | `worker.terminate()` | **No public method** (see below) |

The big architectural mismatches:

1. **Different transport.** Today everything routes through
   `worker.postMessage` / `worker.onmessage`. lichess uses direct
   method calls.
2. **No `terminate()`.** We rely on this for crash recovery. lichess
   has no documented teardown — we'd have to drop references and let
   GC handle it, or shim a Worker-shaped wrapper that owns the
   instance and can be replaced.
3. **External NNUE.** Adds a fetch + cache step. Already scaffolded
   in `engine.js` lines 295–302 but never exercised.

---

## Two implementation approaches

### Approach A — Worker-compatible adapter (RECOMMENDED)

Wrap `lila-stockfish-web` in a tiny ES-module **Worker entry** that
exposes the SAME `postMessage` / `onmessage` UCI string protocol the
rest of `engine.js` already uses. The 1500 lines of crash handling,
single-flight `start()`, durable turn queue, watchdog, etc. continue
to work unchanged.

Diagram:

```text
                  ┌─ engine.js (no changes) ─┐
                  │  worker.postMessage(uci)  │
                  │  worker.onmessage = …     │
                  └────────────┬──────────────┘
                               │ string UCI
            ┌──────────────────▼────────────────────┐
            │ assets/stockfish-web/lichess-shim.js  │  ← new file (worker)
            │   import Sf17179Web from './sf171-79' │
            │   const inst = await Sf17179Web()     │
            │   inst.listen = (s) => postMessage(s) │
            │   onmessage = (e) => inst.uci(e.data) │
            │   inst.onError = (m) => …             │
            │   // load NNUE on first 'isready'     │
            └──────────────────┬────────────────────┘
                               │ pthreads
                          (internal)
```

#### Code sketch — `assets/stockfish-web/lichess-shim.js`

```js
// ES-module Worker. Loaded via:
//   new Worker('assets/stockfish-web/lichess-shim.js', { type: 'module' })
//
// Bridges the postMessage/onmessage UCI-string protocol that
// engine.js expects to lila-stockfish-web's direct method API.

import Sf17179Web from './sf171-79.js';

let inst = null;
let nnueBig = null;     // Uint8Array, big net (lazy)
let nnueSmall = null;   // Uint8Array, small net (loaded on boot)
let pendingBigSwap = false;

// Inbound queue: any UCI lines we receive before the factory resolves
// get buffered and replayed once `inst` is live. Mirrors lichess's own
// "drop pre-uciok" pattern but inverted — we BUFFER pre-init.
const inbox = [];

self.onmessage = (e) => {
  const line = typeof e.data === 'string' ? e.data : '';
  if (!inst) { inbox.push(line); return; }
  // Special meta-commands the host can send:
  //   __sfw_load_small <url>   — fetch + setNnueBuffer(small)
  //   __sfw_load_big   <url>   — fetch + setNnueBuffer(big)
  if (line.startsWith('__sfw_load_small ')) return loadNnue(line.slice(17), 1);
  if (line.startsWith('__sfw_load_big '))   return loadNnue(line.slice(15), 0);
  inst.uci(line);
};

(async () => {
  try {
    inst = await Sf17179Web();
    inst.listen  = (s)   => self.postMessage(s);
    inst.onError = (msg) => self.postMessage('info string LSF_ERROR ' + msg);
    // Drain anything queued during init.
    for (const line of inbox.splice(0)) inst.uci(line);
  } catch (err) {
    // Surface boot failures the same way runtime crashes surface —
    // engine.js's worker.onerror handler treats this as fatal.
    setTimeout(() => { throw err; }, 0);
  }
})();

async function loadNnue(url, index /* 0=big, 1=small */) {
  try {
    const resp = await fetch(url, { credentials: 'omit' });
    if (!resp.ok) throw new Error('NNUE fetch ' + resp.status);
    const buf = new Uint8Array(await resp.arrayBuffer());
    inst.setNnueBuffer(buf, index);
    self.postMessage(`info string LSF_NNUE_LOADED index=${index} bytes=${buf.length}`);
  } catch (err) {
    self.postMessage('info string LSF_NNUE_FAIL ' + (err?.message || err));
  }
}
```

#### Wiring in `engine.js`

The existing `sf-fast` entry already sets `workerOpts = { type:
'module' }` for `externalNnue` flavors (line 201). What changes:

```js
// engine.js — ENGINE_FLAVORS (replace the existing sf-fast stub)
'sf-fast': {
  js: 'assets/stockfish-web/lichess-shim.js',   // ← shim, not sf171-79.js
  label: '★ Lichess SF 17.1 (smallnet → bignet)',
  size: '~6 MB boot, +75 MB after warm-up',
  threaded: true,
  externalNnue: {
    small: 'assets/stockfish-web/nn-37f18f62d772.nnue',
    big:   'assets/stockfish-web/nn-1c0000000000.nnue',
  },
},
```

And in `boot()` after `uciok` arrives (replacing today's `setoption
name EvalFile value …` block, which won't work — lichess uses
`setNnueBuffer` not EvalFile):

```js
if (spec.externalNnue) {
  // Send meta-commands to the shim. The shim fetches + setNnueBuffer().
  this._send('__sfw_load_small ' + spec.externalNnue.small);
  this.activeNet = 'small';
  // Background: kick off the big NNUE fetch on a delay so it doesn't
  // contend with the first user search.
  setTimeout(() => {
    this._send('__sfw_load_big ' + spec.externalNnue.big);
    this.activeNet = 'big';
  }, 3000);
}
```

This keeps **all** the rest of engine.js identical. Single-flight
start, watchdog, durable turn queue, `worker.onerror`-as-fatal, retry-
same-flavor — all work because the shim *is* a Worker.

#### Make it the default

```js
// engine.js boot()
if (flavor === 'auto') flavor = threadable ? 'sf-fast' : 'lite-single';
//                                            ^^^^^^^ was 'avrukh'
```

Plus update the auto-recovery path in `main.js` so retries stay on
`sf-fast` (it currently retries `crashedFlavor` so this is automatic
once the default flips).

---

### Approach B — Polymorphic backend in `Engine`

Make `Engine` an interface; add a `LichessBackend` and `NmruggBackend`.
Each implements `_send(line)`, `_handleLine(cb)`, `terminate()`.

**Pro:** "cleaner" OO.
**Con:** ~1500 lines of `engine.js` are written assuming a Worker.
Refactoring all the watchdog/queue/onerror code to dispatch through
two backends doubles the surface and the test matrix. We'd lose the
guarantee that the Phase 1 fixes apply identically.

**Recommendation:** Skip B. The shim in A gives us polymorphism for
free at the transport layer, with zero changes to the recovery
machinery.

---

## NNUE hosting + caching

### Where the files live

Two `.nnue` files, total ~81 MB, served from our own origin under
`assets/stockfish-web/`:

```text
assets/stockfish-web/
├── lichess-shim.js                  (~1 KB, our shim)
├── sf171-79.js                      (27 KB, vendored from npm)
├── sf171-79.wasm                    (516 KB)
├── nn-37f18f62d772.nnue             (6 MB,  small)
└── nn-1c0000000000.nnue             (75 MB, big)
```

Vendor at build time (copy from `node_modules/lila-stockfish-web/`).
Don't refer to a CDN — we want determinism, no third-party outages,
and the same COOP/COEP isolation for the .wasm and .nnue fetches.

### Cache headers (Render static)

```text
Cache-Control: public, max-age=31536000, immutable
```

Filenames are content-hashed, so `immutable` is safe. First-load gets
the 6 MB small net; subsequent visits in the same browser hit
disk-cache instantly.

### Smallnet → bignet hot-swap

Already implemented in spirit at `engine.js:_swapToBignetWhenReady`
(line 360). Adapt to the shim's meta-command:

1. Boot → `__sfw_load_small <url>` → engine usable in ~1 s.
2. After 3 s of idle → `__sfw_load_big <url>` (fire-and-forget fetch
   inside the shim).
3. Engine swaps networks mid-session. From the user's perspective:
   first move snappy with smallnet (-50 Elo vs bignet, irrelevant for
   coaching), later moves get full strength.

Open question for GPT: lichess does this swap **per-search** (call
`setNnueBuffer` between `go` commands). We'd be doing it
*during* idle. Does `setNnueBuffer` mid-session cause any state
leak (eval cache, history heuristics)? Lichess's `lila` source has
the answer somewhere in `ui/ceval/src/worker/stockfishWebWorker.ts`.

---

## Migration scope

**In scope (Phase 3):**
- `sf-fast` becomes the default, replacing `full` for `auto` boot.
- Existing `full`/`lite`/`lite-single` flavors stay as **fallback
  options** in the dropdown but are no longer auto-selected.
- The 13 custom-NNUE flavors (avrukh+, classical, etc.) stay on
  nmrugg — they have *patched* SEE values baked into the .wasm and
  there's no equivalent on the lichess build.

**Out of scope:**
- Custom-NNUE patched flavors. They keep using nmrugg. If a user
  picks "avrukh+" the old crash machinery is what catches them.
- Stockfish 18. lichess hasn't published an sf18 build yet
  (sf171-79 is the latest). This is fine — 17.1 is recent.
- Server-side change. NNUE files served as static assets — no API
  changes needed.

---

## Risks

### 1. `lila-stockfish-web@0.0.11` — pre-1.0 version

Semver-wise, anything goes between 0.0.x releases. Pin exact version,
vendor the files into our repo, don't auto-update. If lichess ships
a breaking change in 0.0.12, we won't be surprised mid-game.

### 2. No `terminate()`

Today's recovery path calls `this.worker.terminate()`. The shim CAN
terminate itself (Worker close), but the underlying lila instance
keeps its pthread pool alive until GC. We may leak a pool per crash.

**Mitigation:** the shim *is* a Worker, so when engine.js calls
`worker.terminate()` on the shim, the whole module — including the
lila instance and all its pthreads — gets killed by the browser. No
leak. (Confirm with GPT — this is the single most important
correctness question.)

### 3. NNUE fetch failure mid-session

If the bignet fetch fails (offline, 502, etc.), we're stuck on
smallnet forever. Acceptable degradation: log it, show a one-time
toast, keep playing. The shim already emits
`info string LSF_NNUE_FAIL` so engine.js can listen for it.

### 4. ESM + pthread + COOP/COEP combo on quirky browsers

We're cross-origin isolated, served over HTTPS, modern Chromium/
Firefox/Safari. **Untested:** old Edge, in-app browsers (TikTok,
Instagram), some corp proxies that strip COOP. nmrugg works there
(no module worker); the shim doesn't (module workers needed Chrome
80+ / FF 114+ / Safari 15+).

**Mitigation:** keep `lite-single` (nmrugg, classic worker, no
COOP/COEP needed) as the fallback for `flavor: 'auto'` when the
module-worker boot fails. The same retry-same-flavor logic that
catches WASM traps catches a module-worker boot failure.

### 5. Bundle size / first-paint

NNUE small (6 MB) is a big first-paint cost vs nmrugg's 7 MB lite
binary. **Net same**. Bignet is background-fetched. No regression.

### 6. AGPL-3.0 license

`lila-stockfish-web` is AGPL. We already ship Stockfish (GPL-3) so
this isn't new exposure, but: AGPL adds the "network use = source
disclosure" trigger. Our app source is already public on GitHub —
fine. Note in README that this dependency is AGPL.

---

## Phased rollout

```text
Phase 3a (1-2 hr work, behind a flag)
  - Vendor sf171-79.* + 2 NNUE files into assets/stockfish-web/
  - Write lichess-shim.js
  - Replace the sf-fast stub with real wiring
  - URL flag: ?engine=sf-fast lets us test without flipping default
  - Land on dev, dogfood for a week with engine_crashes telemetry

Phase 3b (flip default — 1 line change)
  - 'auto' picks sf-fast for threaded environments
  - Watch engine_crashes telemetry for a week
  - If lichess crash rate < nmrugg crash rate, declare success

Phase 3c (cleanup, optional)
  - Drop the stock 'full' multi-thread nmrugg flavor from the
    dropdown (keep custom-NNUE flavors)
  - Reduces shipped binary by ~108 MB
```

---

## Specific questions for GPT review

1. **Worker-shim correctness:** Does `worker.terminate()` on the shim
   reliably tear down the lila pthread pool? Or is there a real leak?
   (Specifically: lila spawns pthread workers via
   `new Worker(import.meta.url, { type: 'module' })`. When the
   parent shim Worker is terminated, do its child Workers die too?)

2. **NNUE swap timing:** Is calling `inst.setNnueBuffer()` while a
   search is *not* active the right way to hot-swap? Or do we need
   `inst.uci('stop')` first / `ucinewgame` after?

3. **Module-Worker fallback:** Browser support for `new Worker(url,
   { type: 'module' })` — any production browser that *can* run
   pthread WASM but *can't* run module workers? (i.e., would lite +
   nmrugg work where sf-fast wouldn't?)

4. **Inbox during boot:** The shim queues UCI lines until the factory
   resolves. Is there ANY UCI command that's order-sensitive across
   the boot boundary? (e.g., `setoption Threads N` arriving before
   `uci`/`uciok`.)

5. **`__sfw_load_*` meta commands:** Hijacking the UCI channel for
   non-UCI control messages feels gross but keeps the shim
   single-channel. Better idea? (e.g., a separate MessageChannel?)

6. **Should we just port more of lila ceval directly?** Lichess's own
   client has 1000+ lines of stockfish-web orchestration. Are we
   reinventing things they already solved?

7. **AGPL + closed deployment:** We're public-source, but if anyone
   forks this dev app into something closed-source, AGPL bites them.
   Anything we should put in the README?

8. **Threads cap (8) — same on lichess build?** Our nmrugg cap of 8
   was set after a 32-core/Edge user reproduced wedges at 32 threads.
   Does lila's build have its own internal cap, or do we keep the
   `Math.min(hw/2, 8)` rule?

---

## Files to be added/changed

```text
NEW   assets/stockfish-web/lichess-shim.js             (~50 lines)
NEW   assets/stockfish-web/sf171-79.js                 (vendored)
NEW   assets/stockfish-web/sf171-79.wasm               (vendored, 516 KB)
NEW   assets/stockfish-web/nn-37f18f62d772.nnue        (vendored, 6 MB)
NEW   assets/stockfish-web/nn-1c0000000000.nnue        (vendored, 75 MB)
EDIT  src/engine.js
        - sf-fast entry: js path → lichess-shim.js
        - replace `setoption name EvalFile` block with __sfw_load_*
        - default 'auto' → 'sf-fast' (Phase 3b)
EDIT  package.json
        - devDependencies: lila-stockfish-web@0.0.11 (for build-time
          copy; not bundled at runtime)
EDIT  scripts/copy-stockfish-web.{js,sh}                (NEW)
        - Postinstall: copy node_modules → assets/stockfish-web/
EDIT  README.md
        - Note AGPL-3 dependency
```

Total: ~1 new file (~50 LOC) + ~30 LOC of edits to engine.js +
build-time vendor step. The crash machinery, durable queue,
watchdog, retry — **all unchanged**.

---

## What stays the same

- Phase 1 architecture (`worker.onerror` fatal + synthetic stuck +
  durable turn queue + retry-same-flavor max 3) — all of it.
- engine_crashes telemetry table + dashboard pill.
- All the ECO grouping, opening/library, cloud-save game features.
- All custom-NNUE patched flavors (kaufman, avrukh+, etc.).

This is purely a swap of the **default engine binary**. Everything
upstream and downstream is unaffected.
