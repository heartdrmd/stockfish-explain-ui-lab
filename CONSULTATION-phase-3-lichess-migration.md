# Phase 3 — migrate default engine to @lichess-org/stockfish-web (SF18)

> **v4 — final, GPT-greenlit (2026-05-03).**
> Changes from v3: flavor renamed `sf-fast` → `lichess-full` (honest
> naming per GPT). Added `requiresBigNetForPractice: true` field on
> the spec so the boot path can read it directly instead of inferring
> from `externalNnue`.
>
> v3 changes from v2: bignet is the engine in FULL-THROTTLE mode;
> smallnet is at most a boot-warmup helper, never the active opponent.
> Ready blocks on the **big** NNUE. Crash policy clarified: after N
> consecutive Lichess-full crashes, surface a **visible user choice**
> rather than silently downgrading. Threads/hash/skill discipline
> spelled out (8–13 threads, 256–512 MB hash, skill 20, MultiPV 1).
>
> v2 changes from v1: corrected npm package + version, switched to SF18
> (not SF17.1), updated NNUE filenames, added Safari OOB caveat, added
> strict ready-gate sequence.

## TL;DR

Today's default engine (`flavor: 'full'`) is the **Chess.com / nmrugg
stockfish.js** distribution. We've now seen hard
`RuntimeError: memory access out of bounds` traps inside
`stockfish.wasm,worker` on Windows/Edge (Phase 1 consultation). Our
Phase 1 architecture *recovers* (worker.onerror → synthetic stuck-
bestmove → durable engine-turn replay → retry-same-flavor max 3),
but the underlying binary is the wrong one.

Phase 3 = swap that binary out for **`@lichess-org/stockfish-web`**
v0.3.0 on npm — specifically the **sf_18** build (Stockfish 18,
official release, `-O3 -DNDEBUG --closure=1`).

> **Caveat (GPT):** This is not a magic bullet. There is at least one
> recent lichess.org issue where Safari/macOS 26.2 hit
> `RuntimeError: Out of bounds memory access` on `sf171-79`. That
> looked Safari-specific, but it means lichess builds *can* trap too.
> Phase 1 recovery (retry-same-flavor max 3) stays as a backstop
> regardless of which binary is default.

This doc is a **plan + code sketch + question list**. Nothing is
implemented yet beyond the placeholder `lichess-full` flavor entry already
in `src/engine.js` (lines 13–22). The asset files
(`assets/stockfish-web/*`, `assets/nnue/*.nnue`) do **not** exist yet.

**FULL-THROTTLE policy (per user, reaffirmed by GPT):**

> "i want FULL always I dont want light.......no fall back to lite"

This means:

- The **big NNUE** is the active engine for all real searches in
  practice mode.
- Smallnet is OK only as an optional boot-loader (so the worker
  is alive and responsive while we fetch the big net), never as
  the opponent for a real game.
- Engine `ready` does **NOT** fire until the **big** NNUE buffer is
  confirmed loaded.
- On crash, retry the same Lichess full engine a small number of
  times. If it keeps crashing, we **surface a visible "Full engine
  crashed — switch to lite?" choice** to the user. We do NOT silently
  fall back to lite.

We want a sanity-check on:

1. Adapter architecture (Worker-shim wrapping the ESM factory).
2. Ready-gate sequence — engine.ready=true must NOT fire until BIG
   NNUE is loaded + readyok + prewarm done.
3. Threads/hash/skill discipline (8–13 threads, 256–512 MB hash,
   skill 20, MultiPV 1 for play, MultiPV 3 for analysis).
4. Repeated-crash UX: how many silent retries before the visible
   choice appears? GPT suggests "a small number" — we propose 3.
5. Whether to keep nmrugg flavors at all (custom-NNUE patched
   variants — yes, they have no lichess equivalent).

---

## Why this is Phase 3 (not Phase 2)

Phase 2 was "auto-fall back to lite when full crashes." User vetoed:

> "i want FULL always I dont want light.......no fall back to lite"

So Phase 3 keeps full strength but swaps to a binary that lichess.org
runs across millions of analyses a day. Not crash-immune (see Safari
caveat above) but a much better baseline than nmrugg + 108 MB
embedded NNUE.

---

## What ships in `@lichess-org/stockfish-web@0.3.0`

```text
package/                            (5.4 MB unpacked, deps: none)
├── package.json                    (type: "module", AGPL-3.0-or-later)
├── stockfishWeb.d.ts               (the entire public API)
├── README.md
├── LICENSE
├── sf_18.js              26 KB   ┐  Stockfish 18 — dual-net, full
├── sf_18.wasm           695 KB   ┘  Needs big + small NNUE both
├── sf_18_smallnet.js     26 KB   ┐  SF 18 + sscg13/threat-small patch
├── sf_18_smallnet.wasm  660 KB   ┘  Single small NNUE only
├── sf_18_relaxed-simd.js 26 KB   ┐  Relaxed-SIMD variant for newer
├── sf_18_relaxed-simd.wasm 695KB ┘  hardware (faster, narrower compat)
├── sf_18_smallnet_relaxed-simd.{js,wasm}
├── sf_dev.{js,wasm}      ~700 KB   Bleeding-edge dev build
├── sf_dev_relaxed-simd.{js,wasm}
└── fsf_14.{js,wasm}              Fairy-Stockfish 14 (variants — N/A)
```

NNUE files are **not** bundled. We host them ourselves. From
`README.md`:

| Build | NNUE files |
|---|---|
| `sf_18` | big = `nn-c288c895ea92.nnue`, small = `nn-37f18f62d772.nnue` |
| `sf_18_smallnet` | `nn-4ca89e4b3abf.nnue` |
| `sf_dev` | big = `nn-7e1657811c6d.nnue`, small = `nn-37f18f62d772.nnue` |

(All hosted at `https://tests.stockfishchess.org/api/nn/<filename>`.
We mirror to our static origin for determinism — see hosting section.)

### Public API (verbatim from `stockfishWeb.d.ts`)

```ts
declare module "@lichess-org/stockfish-web" {
  interface StockfishWeb {
    uci(command: string): void;          // send UCI line
    setNnueBuffer(data: Uint8Array, index?: number): void;
                                          // 0 = big, 1 = small
    getRecommendedNnue(index?: number): string;
                                          // bare filename
    listen: (data: string) => void;      // attach listener (ASSIGNMENT)
    onError: (msg: string) => void;      // attach error handler (ASSIGNMENT)
  }
  export default StockfishWeb;
}
```

That's the **whole** surface. No `terminate()`, no `postMessage`, no
events. Just five calls.

### How it actually loads

`sf_18.js` opens with the standard emscripten ES-module preamble —
exports a default async factory that resolves to a `StockfishWeb`
instance. Internally it spawns its own **pthread workers** (relies
on `import.meta.url` for child-worker URLs).

**Crucial:** The factory must be loaded as a real ES module from a
URL (not bundled into a non-module script). Because it spawns pthread
workers, the page **must be cross-origin isolated** (COOP/COEP — we
already are).

---

## Comparison: nmrugg vs lichess shapes

| | nmrugg/stockfish.js | @lichess-org/stockfish-web |
|---|---|---|
| Distribution | classic JS, `new Worker(url)` | ES module, `import` + factory |
| API | postMessage strings, onmessage events | `uci()`, `listen=`, `onError=` |
| NNUE | embedded in .wasm (108 MB binary) | external file, `setNnueBuffer()` |
| Threads | Internal pthread pool | Same |
| Errors | `worker.onerror` (we wrap as fatal) | `onError = (msg) => …` |
| Boot | `new Worker()` → `uci` | `await Sf18Web()` → `.uci('uci')` |
| Stop search | `worker.postMessage('stop')` | `inst.uci('stop')` |
| Terminate | `worker.terminate()` | **No public method** |
| Versioning | Stockfish 18 (their fork) | Stockfish 18 (official) |

Three architectural mismatches that drive the shim design:

1. **Different transport.** Today everything routes through
   `worker.postMessage` / `worker.onmessage`. lichess uses direct
   method calls on a Promise-resolved object.
2. **No `terminate()`.** We rely on this for crash recovery.
3. **External NNUE.** Adds a fetch + buffer-load step before engine
   is usable.

---

## Recommended approach — Worker-compatible adapter

Wrap `@lichess-org/stockfish-web` in a tiny ES-module **Worker entry**
that exposes the SAME `postMessage` / `onmessage` UCI string protocol
the rest of `engine.js` already uses. The 1500 lines of crash
handling, single-flight `start()`, durable turn queue, watchdog, etc.
continue to work unchanged. `worker.terminate()` on the shim kills
the underlying lichess instance + its pthread pool together.

```text
                  ┌─ engine.js (no changes) ─┐
                  │  worker.postMessage(uci)  │
                  │  worker.onmessage = …     │
                  └────────────┬──────────────┘
                               │ string UCI
            ┌──────────────────▼──────────────────────┐
            │ assets/stockfish-web/lichess-shim.js    │  ← new file
            │   import Sf18Web from './sf_18.js'       │
            │   const inst = await Sf18Web()           │
            │   inst.listen = (s) => postMessage(s)    │
            │   onmessage = (e) => inst.uci(e.data)    │
            │   inst.onError = (m) => postMessage(...) │
            │   // load BOTH nets before signalling    │
            │   //  ready upstream                     │
            └──────────────────┬──────────────────────┘
                               │ pthreads
                          (internal)
```

### Strict ready-gate sequence — FULL THROTTLE means BIGNET-blocked

> GPT v3: "Smallnet is okay only as a boot loader / warmup trick, not
> as the real opponent. In FULL THROTTLE mode, the app should wait
> for bignet before starting a practice game or making the first
> engine move."

Boot is **NOT** considered complete until the **big** NNUE is loaded.
Smallnet is OPTIONAL and only used as a transient warmup so the
worker is alive while we fetch the big net (50–75 MB on a fresh
browser cache):

```
1.  Shim factory resolves          (await Sf18Web())
2.  inst.uci('uci')  →  uciok       (drained by listen)
3.  setoption Threads / Hash / MultiPV / Skill
4.  SMALL NNUE fetched + setNnueBuffer(buf, 1)
       — OPTIONAL warmup. Lets the engine answer trivial UCI like
       'isready' while big is still in flight. Don't run any real
       go/depth on it.
5.  BIG  NNUE fetched + setNnueBuffer(buf, 0)   ← BLOCKING
       — without this, ready does NOT fire.
6.  inst.uci('isready')  →  readyok
7.  Prewarm: position startpos + go depth 1 → bestmove
       — runs with BIG net active, so first real move latency is
       baked into boot, not into the user's first practice move.
8.  inst.uci('ucinewgame') → isready → readyok
9.  ONLY NOW dispatch the ready event to engine.js
       — main.js can begin practice. fireAnalysis() is safe.
```

To make the bignet-blocking step work over the postMessage UCI
channel, the shim turns `__sfw_load_big <url>` into a
**synchronous-on-the-wire** command — it doesn't ack until the buffer
is loaded. Engine.js's `boot()` waits for an
`info string LSF_NNUE_LOADED index=0 …` line before sending the
prewarm `go depth 1`.

The smallnet step is an info-string ack too (`LSF_NNUE_LOADED
index=1`). Engine.js can fire it in parallel with the big fetch but
**must not** treat it as "ready" — the bignet ack is the only one
that gates the ready event.

Cost of this gate: cold-cache first-visit boot is ~75 MB download
before the user can play. That's accurate cost — no hidden
"start now, get stronger later" trick. Subsequent visits hit disk
cache → instant boot. We can show a one-time "downloading engine
brain (75 MB) — only happens once" toast.

### Code sketch — `assets/stockfish-web/lichess-shim.js`

```js
// ES-module Worker. Loaded via:
//   new Worker('assets/stockfish-web/lichess-shim.js', { type: 'module' })
//
// Bridges the postMessage/onmessage UCI-string protocol that
// engine.js expects to @lichess-org/stockfish-web's direct method API.

import Sf18Web from './sf_18.js';

let inst = null;
const inbox = [];   // UCI lines received before factory resolves

self.onmessage = (e) => {
  const line = typeof e.data === 'string' ? e.data : '';
  if (!inst) { inbox.push(line); return; }
  // Meta-commands (not real UCI). The shim ack's via info string so
  // engine.js can sequence them into its boot/ready handshake.
  if (line.startsWith('__sfw_load_small ')) return loadNnue(line.slice(17), 1);
  if (line.startsWith('__sfw_load_big ')) return loadNnue(line.slice(15), 0);
  inst.uci(line);
};

(async () => {
  try {
    inst = await Sf18Web();
    inst.listen  = (s)   => self.postMessage(s);
    inst.onError = (msg) => {
      // Fatal: re-throw so the parent's worker.onerror fires and
      // engine.js's crash handler (Phase 1) takes over.
      self.postMessage('info string LSF_ERROR ' + msg);
      setTimeout(() => { throw new Error('lichess SF onError: ' + msg); }, 0);
    };
    self.postMessage('info string LSF_SHIM_READY');
    for (const line of inbox.splice(0)) {
      if (line.startsWith('__sfw_load_small ')) loadNnue(line.slice(17), 1);
      else if (line.startsWith('__sfw_load_big ')) loadNnue(line.slice(15), 0);
      else inst.uci(line);
    }
  } catch (err) {
    // Boot failure → throw so worker.onerror fires upstream.
    setTimeout(() => { throw err; }, 0);
  }
})();

async function loadNnue(url, index /* 0=big, 1=small */) {
  try {
    const resp = await fetch(url, { credentials: 'omit' });
    if (!resp.ok) throw new Error('NNUE fetch ' + resp.status);
    const buf = new Uint8Array(await resp.arrayBuffer());
    inst.setNnueBuffer(buf, index);
    self.postMessage(
      `info string LSF_NNUE_LOADED index=${index} bytes=${buf.length}`
    );
  } catch (err) {
    self.postMessage('info string LSF_NNUE_FAIL index=' + index +
                     ' ' + (err?.message || err));
  }
}
```

### Wiring in `engine.js`

The existing `lichess-full` entry already sets `workerOpts = { type:
'module' }` for `externalNnue` flavors (line 201). What changes:

```js
// engine.js — ENGINE_FLAVORS (replace the existing lichess-full stub)
'lichess-full': {
  js: 'assets/stockfish-web/lichess-shim.js',
  label: 'Lichess Stockfish 18 Full',
  size: '~75 MB cold-cache boot · disk-cached after first visit',
  threaded: true,
  requiresBigNetForPractice: true,    // ← FULL THROTTLE flag (per GPT v4)
  externalNnue: {
    small: 'assets/stockfish-web/nn-37f18f62d772.nnue',
    big:   'assets/stockfish-web/nn-c288c895ea92.nnue',
  },
},
```

And in `boot()`, AFTER `uciok` but BEFORE the ready event (replacing
today's `setoption name EvalFile value …` block, which won't work —
lichess uses `setNnueBuffer`, not the EvalFile UCI option):

```js
if (spec.externalNnue) {
  // FULL THROTTLE: ready blocks on the BIG NNUE. Smallnet is fired
  // in parallel as a warmup so 'isready' answers fast, but it never
  // becomes the active opponent — engine.ready won't fire until the
  // big buffer is confirmed loaded.
  this._send('__sfw_load_small ' + spec.externalNnue.small);
  this._send('__sfw_load_big '   + spec.externalNnue.big);
  // (Both fetches kick off in parallel inside the shim.)
  await this._waitForInfoString('LSF_NNUE_LOADED index=0'); // big
  this.activeNet = 'big';
  // Smallnet ack arrives whenever — captured opportunistically by
  // _handleLine but not awaited. If the small fetch fails we don't
  // care; bignet alone is the spec.
}
// then continue: isready → readyok → prewarm → ready event
```

A new helper `_waitForInfoString(prefix)` is needed — about 8 lines
similar to the existing `_waitFor(token)`. Strips `info string ` and
prefix-matches the rest.

This keeps **everything else** in engine.js identical: single-flight,
watchdog, durable turn queue, `worker.onerror`-as-fatal, retry-same-
flavor — all work because the shim *is* a Worker.

### Make it the default

```js
// engine.js boot()
if (flavor === 'auto') flavor = threadable ? 'lichess-full' : 'lite-single';
//                                            ^^^^^^^ was 'avrukh'
```

`main.js` retry-same-flavor logic is unchanged — it picks up
`crashedFlavor` and retries it, so flipping the default automatically
makes recovery loop on `lichess-full`.

---

## NNUE hosting + caching

### Where the files live

For SF18 we vendor at build time:

```text
assets/stockfish-web/
├── lichess-shim.js                  (~60 LOC, our shim)
├── sf_18.js                         (26 KB, vendored)
├── sf_18.wasm                       (695 KB)
├── nn-37f18f62d772.nnue             (6 MB,  small)
└── nn-c288c895ea92.nnue             (75 MB, big)
```

Add a postinstall script:

```js
// scripts/copy-stockfish-web.js
import { copyFileSync } from 'node:fs';
const src = 'node_modules/@lichess-org/stockfish-web/';
const dst = 'assets/stockfish-web/';
['sf_18.js', 'sf_18.wasm'].forEach(f => copyFileSync(src + f, dst + f));
// NNUE files: download from tests.stockfishchess.org (one-shot,
// only if not already present) — they're not in the npm package.
```

For NNUE, fetch once at install time from the official source and
cache in the repo's `assets/` (or in a build step that fetches into
the dist dir). They never change for a given filename — the hash is
the content hash.

### Cache headers (Render static)

```
Cache-Control: public, max-age=31536000, immutable
```

Filenames are content-hashed, so `immutable` is safe.

### Smallnet vs bignet — what `sf_18` actually does

`sf_18` is a **dual-net** build. You give it both NNUE buffers via
`setNnueBuffer(buf, 0)` (big) and `setNnueBuffer(buf, 1)` (small).
Stockfish itself decides per-position which net to evaluate with —
small for tactical / unbalanced positions, big for quiet / endgame.

We DON'T "swap" between binaries, and we DON'T toggle nets via UCI.
Both buffers stay loaded once they arrive.

**FULL THROTTLE policy.** The user has stated repeatedly that they
do NOT want the practice-mode engine to play with smallnet alone.
Even though Stockfish 18 can run on small-only, smallnet is ~50–100
Elo weaker (rough rule of thumb — depends on time control). For
practice-mode coaching that's a meaningful drop.

So load order is:

| Buffer | Fetch | Blocks ready? | Active for play? |
|---|---|---|---|
| small | parallel with big | NO | NO (warmup only) |
| big | parallel with small | **YES** | YES — required |

Smallnet exists so the worker can answer `isready` while big is in
flight — keeps the watchdog calm. It is NEVER the basis for an
actual `go` command in practice mode. (For analysis mode, it doesn't
matter — the user can re-trigger when bignet arrives.)

Open question: does `setNnueBuffer` invalidate any internal eval
cache when called mid-session? Lila's source has the answer in
`ui/ceval/src/worker/stockfishWebWorker.ts`. Worth double-checking
before we ship.

---

## Engine-options discipline (FULL THROTTLE ≠ uncapped)

> GPT v3: "full throttle does not mean 64 threads in browser WASM.
> That can be weaker and crashier. Full throttle should mean
> strongest **stable** browser setting."

Today's caps in `engine.js` were already tightened after the 32-core
/ Edge wedge incident (Phase 1 consultation): `Math.min(hw/2, 8)`
for threaded builds. GPT wants us to formally test 8 / 12 / 13 on
the lichess build before deciding.

| UCI option | Practice-mode value | Analysis-mode value | Rationale |
|---|---|---|---|
| `Threads` | `min(floor(hw/2), 12)` | `min(floor(hw/2), 13)` | 12 is the documented Lichess sweet spot; 13 is a max for users with 26+ cores who have headroom |
| `Hash` | `256` MB | `512` MB | 256 covers practice depths fine; analysis can use more |
| `MultiPV` | `1` | `3` | Single-PV is faster + Stockfish's natural mode for play |
| `Skill Level` | `20` | `20` | Always max — user already chose practice difficulty via `movetime` |
| `UCI_Elo` | (unset) | (unset) | We don't downgrade strength via this option |

A test plan goes alongside Phase 3a: boot lichess-full on each thread
count, run 100 sequential `go movetime 3000` searches from random
opening positions, log any crash + final nps. Pick the count that
balances strength (nps) and stability (zero crashes).

The thread cap can stay user-overridable via the existing slider —
but `auto` should pick the conservative default.

---

## Crash policy — visible user choice, not silent downgrade

> GPT v3: "On crash, reboot same Lichess full engine a limited
> number of times. Only after repeated full-engine crashes show a
> visible 'Full engine crashed' choice, not silent lite fallback."

Three-tier escalation:

```
Tier 1: silent retry of lichess-full (the lichess full engine)
   max 3 attempts, with engine_crashes telemetry per attempt
   - covers 'memory access out of bounds' transient + Safari quirks
   - user sees nothing if recovery succeeds

Tier 2: VISIBLE banner — "Full engine crashed 3 times"
   shown ONLY after 3 consecutive lichess-full crashes
   text: "The strongest engine kept crashing on this device.
          [Switch to lite engine]  [Try full again]"
   - user makes the call; we don't downgrade automatically
   - whichever they pick is remembered for the session

Tier 3: persistent preference (cross-session)
   if they pick 'Switch to lite' AND it crashed 3+ times in this
   session, store the preference in localStorage so next visit
   defaults to lite. With a "switch back to full" link in
   settings.
```

Today's `main.js` already implements Tier 1 (retry-same-flavor max
3, commit `7c8e7be`). Phase 3 adds Tier 2:

```js
// main.js — switchEngineFlavor (sketch)
if (crashedFlavor === 'lichess-full' && retryCount >= 3) {
  // STOP silent retry. Surface the choice.
  showFullEngineCrashedBanner({
    onPickLite: () => switchEngineFlavor('lite'),    // user-driven
    onPickRetry: () => switchEngineFlavor('lichess-full'), // reset count
  });
  return;  // do NOT auto-switch
}
```

The banner UI is a new piece — slot it in the existing engine-mode
strip, similar to the engine-crash count pill. Engine_crashes
telemetry continues firing on every Tier-1 retry so we have data
on whether Tier 2 fires often enough to matter.

---

## Migration scope

**In scope (Phase 3):**
- `lichess-full` becomes the default for `flavor: 'auto'`, replacing the
  nmrugg `full` build for threaded environments.
- Existing `full`/`lite`/`lite-single` (nmrugg) stay as **selectable
  options** in the dropdown but no longer auto-selected.

**Out of scope:**
- The 13 custom-NNUE patched flavors (avrukh+, classical, kaufman,
  alphazero, etc.). They have *patched* SEE values baked into the
  .wasm and there's no lichess equivalent. They keep using nmrugg.
- `sf_dev`. We pin to the stable `sf_18` build.
- `sf_18_smallnet` as a separate flavor — unless we discover the
  dual-net `sf_18` is too slow to boot even with smallnet-first
  loading. Then we add it as a *second* lichess-full variant.
- `sf_18_relaxed-simd`. Optional follow-up — autodetect support and
  prefer it. Phase 3.5.

---

## Risks

### 1. Pre-1.0 package version

`@lichess-org/stockfish-web@0.3.0` is still 0.x. Pin the exact version
in package.json. Vendor the files into `assets/` so a bad upstream
release can't break us. AGPL-3.0-or-later — already compatible
with our public-source GitHub repo.

### 2. No `terminate()` — does worker.terminate() really kill children?

Today's recovery path calls `this.worker.terminate()`. The shim IS a
Worker, so terminating the shim should kill the lichess factory
instance AND its pthread children (browser-level Worker disposal
cascades). Need to **verify with a leak test**: boot 100 times in a
row, watch heap usage.

> GPT verdict: this is the single most important correctness check
> before we flip the default. If it leaks, we add an explicit
> teardown protocol to the shim (close ports, drop refs, request
> child-worker termination by message) before `self.close()`.

### 3. NNUE fetch failure at boot

In FULL THROTTLE mode the **big** net is required. So:

- **big-net fetch fails** → fatal boot error. Phase 1 retry-same-
  flavor logic catches it (3 retries). After 3 fails, the Tier-2
  banner appears: "Engine couldn't download brain. Switch to lite?"
- **small-net fetch fails** → ignored. We don't need it; smallnet
  was only a warmup. Engine.js logs the
  `info string LSF_NNUE_FAIL index=1` and proceeds.

This is a behavioral departure from v2 of the doc, which would have
launched on smallnet alone. Per FULL THROTTLE policy, that's not
allowed.

### 4. ESM module-Worker browser support

We're cross-origin isolated, served over HTTPS, modern Chromium /
Firefox / Safari. Module workers need Chrome 80+ / FF 114+ / Safari
15+. **Untested:** old Edge, in-app browsers (TikTok, Instagram),
some corp proxies that strip COOP. nmrugg (classic worker, no
COOP/COEP needed) works there; the shim might not.

**Mitigation:** keep `lite-single` (nmrugg, classic worker) as the
fallback in `flavor: 'auto'` when `threadable` is false. The Phase 1
retry-same-flavor logic catches a module-worker boot failure the
same way it catches any other boot failure.

### 5. Bundle size / first-paint

Cold-cache cost on first visit: ~750 KB (`sf_18.wasm`) + 6 MB (small
NNUE, fired in parallel as warmup) + **75 MB big NNUE blocking
ready**. That's a ~75 MB blocking download before the user can play
on a fresh browser.

Mitigations:
- One-time toast: "Downloading engine brain (75 MB). Only happens
  on the first visit." Sits over the board, dismissible.
- Cache-Control: `public, max-age=31536000, immutable` so subsequent
  visits boot from disk in <1 s.
- For users who *really* want the old smallnet-launches-instantly
  model, expose a `?fastboot=1` URL parameter that flips the ready
  gate to smallnet instead of bignet. Off by default. Documented as
  "boots in 5 s but plays at smallnet strength until bignet finishes
  downloading."

Net: first visit is heavier than today (current nmrugg ships 7 MB
lite; full was 108 MB embedded but most users were on lite). All
subsequent visits are equal or better.

### 6. AGPL-3.0 license

Same exposure profile as today (we already ship Stockfish, GPL-3).
AGPL adds the "network use = source disclosure" clause but our app
source is already public. Note in README that the dependency is
AGPL-3.0-or-later.

### 7. Safari/macOS 26.2 OOB on lichess builds

GPT: "I found a recent Lichess issue where Safari/macOS 26.2 hit
`RuntimeError: Out of bounds memory access` on `sf171-79`."

Implication: lichess builds CAN trap, just less often than nmrugg
in our tests. **Phase 1 architecture (worker.onerror=fatal +
synthetic stuck + durable turn queue + retry-same-flavor max 3)
stays.** It catches lichess traps the same way it catches nmrugg
traps. Engine_crashes telemetry will tell us if Safari is a
material risk for our user base.

---

## Phased rollout

```text
Phase 3a (2-3 hr work, behind a flag)
  - Vendor sf_18.js + sf_18.wasm + 2 NNUE files into
    assets/stockfish-web/
  - Add postinstall script for vendoring
  - Write lichess-shim.js (~60 LOC)
  - Replace the lichess-full stub with real wiring + BIGNET-blocking
    ready-gate
  - URL flag: ?engine=lichess-full lets us test without flipping default
  - Threads-cap test pass: run 8/12/13 in a 100-search burst, pick
    the strongest count with 0 crashes
  - Land on dev, dogfood for a week with engine_crashes telemetry

Phase 3b (flip default + Tier 2 UI)
  - 'auto' picks lichess-full for threaded environments
  - Add "Full engine crashed 3 times" banner with [Switch to lite]
    [Try full again] buttons
  - Watch engine_crashes/stats for a week
  - Compare lichess crash rate vs the prior nmrugg baseline
  - Roll back via 1-line revert if rate is worse

Phase 3c (cleanup, optional, gated on 3b stability)
  - Drop the stock 'full' multi-thread nmrugg flavor from the
    dropdown (keep custom-NNUE patched flavors)
  - Reduces shipped binary by ~108 MB

Phase 3.5 (optional follow-up)
  - Detect relaxed-SIMD support, prefer sf_18_relaxed-simd when
    available. Probably small Elo gain on modern CPUs.
```

---

## Open questions

1. **`worker.terminate()` cascade:** Does terminating the shim Worker
   reliably tear down lichess's internal pthread pool? Memory leak
   test: boot+terminate 100x, sample heap. If it leaks, add explicit
   teardown protocol.

2. **`setNnueBuffer` mid-session safety:** Does calling it while a
   search is *not* active leave any stale eval cache? Need to check
   lila ceval source.

3. **Inbox during boot:** Shim queues UCI lines until the factory
   resolves. Any UCI command order-sensitive across that boundary?
   (e.g., `setoption Threads N` arriving before `uciok` — Stockfish
   typically requires options before `position`/`go`, not before
   `uci`, so we're probably fine.)

4. **Hijacking the UCI channel for `__sfw_load_*`:** Functional but
   slightly gross. Alternatives: separate MessageChannel,
   sub-prefixed UCI command (`info string sfw load ...`), reserved
   namespace. Worth a quick polish pass after it works.

5. **Should we just port more of lila ceval directly?** Lichess's
   own client has 1000+ lines of stockfish-web orchestration. Are
   we reinventing? Probably some — but their orchestration assumes
   their UI and ceval state. Our `Engine` class has a different
   shape. Port selectively.

6. **Threads cap on lichess build:** GPT recommends testing 8/12/13
   on `sf_18` and picking the strongest one with zero crashes in a
   100-search burst. Lichess's lila uses 12 as the practical cap.
   Worth confirming our nmrugg-derived cap of 8 isn't leaving
   strength on the table.

7. **Tier 2 banner threshold:** Is 3 consecutive crashes the right
   number before showing the visible "Switch to lite?" choice? Too
   low → annoying for transient glitches; too high → user thinks
   the app is just broken. 3 matches our existing retry budget so
   it's a natural fit, but we could weight it (3 in 5 minutes vs.
   3 across a whole session).

8. **`fastboot=1` URL flag:** Lets users opt out of the bignet
   ready-gate for instant smallnet boot. Worth shipping as a
   one-time-toast option or just a hidden URL param? GPT's strict
   "FULL THROTTLE = bignet only" implies hidden — surface it only
   for users who explicitly ask.

---

## Files to be added/changed

```text
NEW   assets/stockfish-web/lichess-shim.js             (~60 LOC)
NEW   assets/stockfish-web/sf_18.js                    (vendored, 26 KB)
NEW   assets/stockfish-web/sf_18.wasm                  (vendored, 695 KB)
NEW   assets/stockfish-web/nn-37f18f62d772.nnue        (6 MB, small)
NEW   assets/stockfish-web/nn-c288c895ea92.nnue        (75 MB, big)
NEW   scripts/copy-stockfish-web.js                    (postinstall vendor)
EDIT  src/engine.js
        - lichess-full entry: js path → lichess-shim.js
        - replace `setoption EvalFile` block with __sfw_load_*
        - add _waitForInfoString helper
        - block ready-event on LSF_NNUE_LOADED index=0 (BIG net)
        - 'auto' → 'lichess-full' (Phase 3b only)
        - Hash 256 (practice) / 512 (analysis), Threads cap 12-13
EDIT  src/main.js
        - Tier 2 banner UI when lichess-full crashes 3x consecutively
        - "[Switch to lite] [Try full again]" buttons
        - Persist user pick for the session
EDIT  package.json
        - dependencies: "@lichess-org/stockfish-web": "0.3.0"
        - scripts.postinstall: node scripts/copy-stockfish-web.js
EDIT  README.md
        - Note AGPL-3.0-or-later dependency
EDIT  .gitignore (or commit the vendored binaries — ~80 MB; either
        is fine, but committing them avoids fetch on cold deploy)
```

Total: ~1 new shim file (~60 LOC) + ~30 LOC of edits to engine.js +
build-time vendor step. The crash machinery, durable queue,
watchdog, retry — **all unchanged**.

---

## What stays the same

- Phase 1 architecture (`worker.onerror` fatal + synthetic stuck +
  durable turn queue + retry-same-flavor max 3) — all of it.
- engine_crashes telemetry table + dashboard pill.
- All ECO grouping, opening/library, cloud-save game features.
- All custom-NNUE patched flavors (avrukh+, kaufman, etc.).

This is purely a swap of the **default engine binary**. Everything
upstream and downstream is unaffected.
