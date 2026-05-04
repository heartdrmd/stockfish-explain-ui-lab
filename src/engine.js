// engine.js — Stockfish WASM worker wrapper with UCI protocol parsing.
// Emits "thinking" and "bestmove" events. Tracks per-iteration history
// for confidence detection. Supports 3 engine flavors:
//   - lite-single: 7 MB, single-thread, works from file://
//   - lite:        7 MB, multi-thread (needs COOP/COEP headers)
//   - full:      108 MB, full NNUE, multi-thread (strongest)

export const ENGINE_FLAVORS = {
  // ─── Lichess Stockfish 18 — full bignet, FULL THROTTLE policy ───
  //
  // Wraps @lichess-org/stockfish-web@0.3.0 / sf_18 (the dual-net
  // build) behind a Worker shim that speaks the same UCI string
  // protocol as our nmrugg flavors. See:
  //
  //   assets/stockfish-web/lichess-shim.js     (~50 LOC adapter)
  //   CONSULTATION-phase-3-lichess-migration.md (v4, GPT-greenlit)
  //
  // requiresBigNetForPractice=true means engine.ready does NOT fire
  // until the big NNUE buffer is confirmed loaded. Smallnet boots in
  // parallel as a worker-warmup but never plays a real go in
  // practice mode. Per repeated user requirement: "i want FULL
  // always I dont want light".
  //
  // Cold-cache first-visit: ~0.7 MB wasm + 3.4 MB small + 104 MB
  // big = ~108 MB blocking. Subsequent visits hit disk cache → <1s.
  // We can show a one-time toast ("downloading engine brain — only
  // happens once").
  'lichess-full': {
    js: 'assets/stockfish-web/lichess-shim.js',
    label: 'Lichess Stockfish 18 Full',
    size: '~108 MB cold-cache · disk-cached after first visit',
    threaded: true,
    requiresBigNetForPractice: true,
    externalNnue: {
      small: 'assets/nnue/small.nnue',
      big:   'assets/nnue/big.nnue',
    },
  },

  // ─── Stock (no source patches) ───
  'lite-single': {
    js: 'assets/stockfish/stockfish-18-lite-single.js',
    label: 'Stock Lite (single-thread)',
    size: '7 MB',
    threaded: false,
  },
  'lite': {
    js: 'assets/stockfish/stockfish-18-lite.js',
    label: 'Stock Lite (multi-thread)',
    size: '7 MB',
    threaded: true,
  },
  'full': {
    js: 'assets/stockfish/stockfish-18.js',
    label: 'Stock Full (multi-thread)',
    size: '108 MB',
    threaded: true,
  },

  // ─── Lite (7 MB) variants with custom SEE values ───
  'kaufman-lite-single': {
    js: 'assets/stockfish/stockfish-kaufman-lite-single.js',
    label: 'Kaufman (lite) — P=208 N=676 B=676 R=1040 Q=2028',
    size: '7 MB', threaded: false, custom: true,
  },
  'classical-lite-single': {
    js: 'assets/stockfish/stockfish-classical-lite-single.js',
    label: 'Classical 1/3/3/5/9 (lite) — N=B=624 R=1040 Q=1872',
    size: '7 MB', threaded: false, custom: true,
  },
  'alphazero-lite-single': {
    js: 'assets/stockfish/stockfish-alphazero-lite-single.js',
    label: 'AlphaZero (lite) — N=634 B=693 R=1171 Q=1976',
    size: '7 MB', threaded: false, custom: true,
  },
  'avrukh-lite-single': {
    js: 'assets/stockfish/stockfish-avrukh-lite-single.js',
    label: 'Avrukh (lite) — bishops nudged (B=720)',
    size: '7 MB', threaded: false, custom: true,
  },
  'avrukhplus-lite-single': {
    js: 'assets/stockfish/stockfish-avrukhplus-lite-single.js',
    label: '★ Avrukh+ (lite, single) — Avrukh values + bishop-pair SEE patch',
    size: '7 MB', threaded: false, custom: true, patched: true,
  },
  'avrukhplus-lite': {
    js: 'assets/stockfish/stockfish-avrukhplus-lite.js',
    label: '★ Avrukh+ (lite, MULTI-THREAD) — Avrukh values + SEE patch',
    size: '7 MB', threaded: true, custom: true, patched: true,
  },

  // ─── Full (108 MB) variants ───
  'stock-single': {
    js: 'assets/stockfish/stockfish-stock-single.js',
    label: 'Stock Full (single-thread, file://-safe)',
    size: '108 MB', threaded: false, custom: true,
  },
  'kaufman-single': {
    js: 'assets/stockfish/stockfish-kaufman-single.js',
    label: 'Kaufman (full 108 MB) — P=208 N=676 B=676 R=1040 Q=2028',
    size: '108 MB', threaded: false, custom: true,
  },
  'classical-single': {
    js: 'assets/stockfish/stockfish-classical-single.js',
    label: 'Classical 1/3/3/5/9 (full 108 MB)',
    size: '108 MB', threaded: false, custom: true,
  },
  'alphazero-single': {
    js: 'assets/stockfish/stockfish-alphazero-single.js',
    label: 'AlphaZero (full 108 MB)',
    size: '108 MB', threaded: false, custom: true,
  },
  'avrukh-single': {
    js: 'assets/stockfish/stockfish-avrukh-single.js',
    label: 'Avrukh (full 108 MB) — bishops nudged',
    size: '108 MB', threaded: false, custom: true,
  },
  'avrukhplus-single': {
    js: 'assets/stockfish/stockfish-avrukhplus-single.js',
    label: '★ Avrukh+ (full 108 MB, single) — Avrukh values + SEE pair patch',
    size: '108 MB', threaded: false, custom: true, patched: true,
  },

  // ─── Full (108 MB) MULTI-THREADED variants — strongest possible ───
  'kaufman': {
    js: 'assets/stockfish/stockfish-kaufman.js',
    label: 'Kaufman (full 108 MB, MULTI-THREAD)',
    size: '108 MB', threaded: true, custom: true,
  },
  'classical': {
    js: 'assets/stockfish/stockfish-classical.js',
    label: 'Classical 1/3/3/5/9 (full 108 MB, MULTI-THREAD)',
    size: '108 MB', threaded: true, custom: true,
  },
  'alphazero': {
    js: 'assets/stockfish/stockfish-alphazero.js',
    label: 'AlphaZero (full 108 MB, MULTI-THREAD)',
    size: '108 MB', threaded: true, custom: true,
  },
  'avrukh': {
    js: 'assets/stockfish/stockfish-avrukh.js',
    label: 'Avrukh (full 108 MB, MULTI-THREAD) — bishops nudged',
    size: '108 MB', threaded: true, custom: true,
  },
  'avrukhplus': {
    js: 'assets/stockfish/stockfish-avrukhplus.js',
    label: '★ Avrukh+ (full 108 MB, MULTI-THREAD) — values + SEE pair patch',
    size: '108 MB', threaded: true, custom: true, patched: true,
  },
};

export class Engine extends EventTarget {
  constructor() {
    super();
    this.worker     = null;
    this.ready      = false;
    this.searching  = false;
    this.scriptPath = null;
    this.flavor     = null;
    this.multipv    = 3;
    this.skill      = 20;
    this.threads    = 1;
    this.hashMB     = 256;      // transposition-table size, MB

    // Capture the UCI banner (`id name …`) so callers can prove which engine is loaded.
    this.uciId      = null;

    this.history    = [];
    this.topMoves   = new Map();
  }

  async boot({ flavor = 'auto' } = {}) {
    // Pick flavor
    const threadable = typeof SharedArrayBuffer !== 'undefined'
                    && typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated;
    // Default to Avrukh 108 MT (user-preferred) when threadable,
    // Avrukh-single otherwise. 'Strongest' without caveats is 'avrukh'
    // per user testing — the stock 'full' variant has been flaky for
    // this user. Falls back through the main.js chain on crash.
    if (flavor === 'auto') flavor = threadable ? 'avrukh' : 'avrukh-single';
    if (!ENGINE_FLAVORS[flavor]) throw new Error(`Unknown flavor ${flavor}`);
    const spec = ENGINE_FLAVORS[flavor];
    if (spec.threaded && !threadable) {
      throw new Error(`${spec.label} needs COOP/COEP headers (crossOriginIsolated). Use the Python dev server, or switch to Lite (single-thread).`);
    }

    this.flavor = flavor;
    this.scriptPath = spec.js;
    // Default: HALF the hardware cores (rounded down, min 1, capped at
    // the 32-thread WASM pthread pool ceiling). User-preferred rule —
    // keeps the UI thread responsive on every machine size:
    //   16 cores -> 8 threads
    //    8 cores -> 4 threads
    //    4 cores -> 2 threads
    //    2 cores -> 1 thread
    // User can still crank higher via the UI slider for pure analysis.
    //
    // Cap dropped 32 → 8 after a 64-core/Edge user reproduced
    // mid-search wedges with the 32-thread default. Stockfish WASM
    // running 32 worker threads on Windows/Edge appears to exhibit
    // a thread-pool instability that's not present at 8. For 3-second
    // practice moves the extra threads buy almost no Elo and a lot
    // of risk + heat. (GPT consultation feedback: cap at 4-8 for
    // practice, 12 max.) The slider can still be cranked manually
    // for pure analysis on a stable machine.
    const hw = navigator.hardwareConcurrency || 4;
    const WASM_THREAD_CAP = 8;
    this.threads = spec.threaded
      ? Math.max(1, Math.min(Math.floor(hw / 2), WASM_THREAD_CAP))
      : 1;

    try {
      // lichess-org/stockfish-web ships an ES module (uses import.meta).
      // Our custom-built variants are classic scripts. Match the worker
      // type to the flavor — sf-fast (and any future external-NNUE
      // flavor) goes through as type:'module'.
      const workerOpts = spec.externalNnue ? { type: 'module' } : undefined;
      this.worker = workerOpts
        ? new Worker(this.scriptPath, workerOpts)
        : new Worker(this.scriptPath);
    } catch (err) {
      console.error('Engine worker failed to start:', err);
      throw err;
    }

    // Strict lifecycle flags (lichess pattern):
    //   uciokReceived — gates _send(); anything before uciok is dropped
    //   stopRequested — set by stop(); info lines from the old search
    //                   are ignored until bestmove arrives to re-arm.
    // Violating either of these is the documented cause of Stockfish
    // WASM "RuntimeError: unreachable" (assertion failure).
    this.uciokReceived = false;
    this.stopRequested = false;
    // Fresh worker → fresh UCI option state. Reset the memo so the
    // next setoption call actually reaches the engine (even if the
    // value is the same as the last worker had).
    this._resetSentOptions();
    // Track the identity of the current "game" — used to skip
    // redundant `ucinewgame` (lila-style). Cleared on new worker.
    this._lastGameId = null;

    this.worker.onmessage = (e) => this._handleLine(e.data);
    // RUNTIME worker.onerror handler — fatal for the worker.
    //
    // We've seen `RuntimeError: memory access out of bounds` traps
    // INSIDE stockfish.wasm,worker (Phase 1 consultation, GPT review).
    // The worker thread crashes silently — main thread never sees a
    // bestmove again, and our stall detector only catches it 6 s
    // later. By then, board events may have already routed work to
    // a dead worker.
    //
    // Treat the FIRST runtime onerror as fatal: terminate, mark not
    // ready, fire any awaited synthetic-stuck so the UI unfreezes,
    // then dispatch an `engine-crashed` event so main.js can route
    // to recovery (one-way fallback to a safer flavor).
    //
    // The bootCrashHandler below replaces this during boot to reject
    // the boot promise instead of going through the runtime path.
    this.worker.onerror = (e) => this._handleWorkerCrash(e);

    // Capture the 'id name' line during UCI handshake for later display
    const idCapture = (ev) => {
      const line = ev.data;
      if (typeof line === 'string' && line.startsWith('id name')) {
        this.uciId = line.slice(8).trim();
      }
    };
    this.worker.addEventListener('message', idCapture);

    this._send('uci');
    // Enforce a hard 15-second boot timeout. If the WASM never initialises
    // (e.g. bad build, browser incompat), surface a clear error instead of
    // leaving the UI stuck on "booting…".
    const bootTimeoutMs = 15000;
    let timedOut = false;
    const waitPromise = this._waitFor('uciok');
    const timeoutPromise = new Promise((_r, rej) => {
      setTimeout(() => { timedOut = true; rej(new Error(`UCI handshake timed out after ${bootTimeoutMs/1000}s — variant may be broken`)); }, bootTimeoutMs);
    });
    // Reject boot IMMEDIATELY on a worker-level crash (WASM unreachable,
    // bad bytes, etc.) instead of waiting out the full timeout. Lets
    // main.js's auto-fallback kick in within milliseconds.
    const crashPromise = new Promise((_r, rej) => {
      const prev = this.worker.onerror;
      this.worker.onerror = (e) => {
        if (typeof prev === 'function') prev(e);
        const msg = (e && (e.message || e.error?.message)) || 'Stockfish worker crashed';
        rej(new Error(`Engine '${flavor}' crashed: ${msg}`));
      };
    });
    try {
      await Promise.race([waitPromise, timeoutPromise, crashPromise]);
    } finally {
      this.worker.removeEventListener('message', idCapture);
    }
    if (timedOut) { this.terminate(); throw new Error(`Engine '${flavor}' failed to boot within ${bootTimeoutMs/1000}s`); }
    this._send(`setoption name MultiPV value ${this.multipv}`);
    this._send(`setoption name Threads value ${this.threads}`);
    this._send(`setoption name Hash value ${this.hashMB}`);  // transposition-table size
    this._send(`setoption name Skill Level value ${this.skill}`);
    // Dropped: 'setoption name UCI_AnalyseMode value true' and
    // 'setoption name Use NNUE value true'. Neither option exists in
    // Stockfish 17+ (confirmed by reading src/engine.cpp option list).
    // They were no-ops; removing cleans up the log.
    // Defensive stop: any refresh/crash remnants cleared before the
    // first real search. Safe — if no search is running, stop is a
    // no-op. If one IS running (e.g. user refreshed mid-analysis and
    // the OPFS-backed NNUE cache warmed a ghost state), this drains it.
    this._send('stop');

    // External-NNUE flavors (lichess-full): the worker is the
    // lichess-shim.js adapter — it doesn't accept UCI 'EvalFile'.
    // Instead it understands two meta-commands which we ack via
    // info-string lines:
    //
    //   __sfw_load_small <url>  →  info string LSF_NNUE_LOADED index=1
    //   __sfw_load_big   <url>  →  info string LSF_NNUE_LOADED index=0
    //
    // FULL THROTTLE policy (Phase 3 consultation v4):
    //   • Big NNUE is the engine. Ready BLOCKS on its ack.
    //   • Small NNUE is fired in parallel as a worker-warmup so
    //     `isready` answers fast, but it never becomes the active
    //     opponent in practice mode.
    //   • If small fetch fails: we don't care, log + proceed.
    //   • If big fetch fails: fatal boot error → Phase 1 retry-same-
    //     flavor kicks in.
    if (spec.externalNnue) {
      // Fire both fetches inside the shim, in parallel.
      this._send('__sfw_load_small ' + spec.externalNnue.small);
      this._send('__sfw_load_big '   + spec.externalNnue.big);
      // BLOCKING wait for the BIG net ack. requiresBigNetForPractice.
      await this._waitForInfoString('LSF_NNUE_LOADED index=0', 120_000);
      this.activeNet = 'big';
    }

    this._send('isready');
    await this._waitFor('readyok');

    // ── PREWARM (per GPT consultation) ────────────────────────────
    // First-move latency was significantly worse than subsequent
    // moves — pthread workers are created on first search, NNUE
    // pages get touched, hash is initialized. Burn that cost HERE
    // with a depth-1 dummy search so the user's first real move
    // feels as snappy as the second.
    //   1. position startpos + go depth 1   →  forces pthread creation
    //                                          + NNUE warm + hash alloc
    //   2. await bestmove
    //   3. ucinewgame                        →  clears the hash for the
    //                                          real game-start state
    //   4. isready / readyok                 →  drain ucinewgame before
    //                                          we tell main.js we're ready
    try {
      const prewarmDone = new Promise((resolve) => {
        const onMsg = (e) => {
          const line = typeof e.data === 'string' ? e.data : '';
          if (line.startsWith('bestmove')) {
            this.worker.removeEventListener('message', onMsg);
            resolve();
          }
        };
        this.worker.addEventListener('message', onMsg);
      });
      this._send('position startpos');
      this._send('go depth 1');
      // Bound the wait so a flaky engine doesn't block boot forever.
      await Promise.race([
        prewarmDone,
        new Promise(r => setTimeout(r, 5000)),
      ]);
      this._send('ucinewgame');
      this._send('isready');
      await Promise.race([
        this._waitFor('readyok'),
        new Promise(r => setTimeout(r, 3000)),
      ]);
      console.log('[engine] prewarm complete');
    } catch (err) {
      console.warn('[engine] prewarm step failed (continuing anyway)', err);
    }

    this.ready = true;
    this.dispatchEvent(new CustomEvent('ready', {
      detail: { flavor, threaded: spec.threaded, threads: this.threads, activeNet: this.activeNet || null }
    }));
    return { flavor, threaded: spec.threaded, threads: this.threads };
  }

  // Note: _swapToBignetWhenReady / _actuallySwapToBig were removed in
  // Phase 3a — they were the nmrugg `setoption name EvalFile value …`
  // hot-swap path. The lichess-shim build uses setNnueBuffer() and
  // loads BOTH nets at boot (ready blocks on big), so there's nothing
  // to swap mid-session. If we ever add a non-blocking smallnet-first
  // mode for `?fastboot=1`, that lives in the shim, not here.

  /** Tear down the worker — for switching engine flavor. */
  terminate() {
    this.stop();
    // Cancel any pending timers so they don't fire AFTER the worker
    // is gone (would either be a no-op or could surface a synthetic-
    // stuck event from a dead instance).
    if (this._watchdogId)    { clearTimeout(this._watchdogId);    this._watchdogId = 0; }
    if (this._healthCheckId) { clearTimeout(this._healthCheckId); this._healthCheckId = 0; }
    if (this._stallTimer)    { clearTimeout(this._stallTimer);    this._stallTimer = 0; }
    this._bestmoveAwaited = false;
    this._pendingRequest = null;
    if (this.worker) { this.worker.terminate(); this.worker = null; }
    this.ready = false;
  }

  // Option setters: NEVER send setoption while a search is in flight.
  // Per lichess protocol.ts research — options are only safe to mutate
  // between searches (in the idle transition). If the engine is
  // currently searching, we queue the option and flush it in the next
  // bestmove handler. Eliminates mid-search UCI protocol violations.
  //
  // MEMOIZATION (lila-style): we track the last value sent for each
  // UCI option in this._sentOptions so we skip redundant
  // `setoption` sends when the value hasn't changed. Clears on worker
  // (re)creation via _resetSentOptions.
  _setOptionMemo(name, value) {
    if (!this._sentOptions) this._sentOptions = new Map();
    const prev = this._sentOptions.get(name);
    if (prev === String(value)) return;                // same value → skip
    this._sentOptions.set(name, String(value));
    this._send(`setoption name ${name} value ${value}`);
  }
  _resetSentOptions() {
    // Called when the worker is (re)booted — engine forgets all options,
    // so our memo must also forget or we'll skip necessary setoption
    // sends on the fresh worker.
    this._sentOptions = new Map();
  }
  _applyPending() {
    if (!this._pendingOpts) return;
    const p = this._pendingOpts;
    this._pendingOpts = null;
    if (p.multipv  != null) this._setOptionMemo('MultiPV',     p.multipv);
    if (p.skill    != null) this._setOptionMemo('Skill Level', p.skill);
    if (p.threads  != null) this._setOptionMemo('Threads',     p.threads);
    if (p.hashMB   != null) this._setOptionMemo('Hash',        p.hashMB);
  }
  _queueOrApply(kv) {
    if (!this.ready) return;
    if (this.searching) {
      this._pendingOpts = { ...(this._pendingOpts || {}), ...kv };
    } else {
      if (kv.multipv  != null) this._setOptionMemo('MultiPV',     kv.multipv);
      if (kv.skill    != null) this._setOptionMemo('Skill Level', kv.skill);
      if (kv.threads  != null) this._setOptionMemo('Threads',     kv.threads);
      if (kv.hashMB   != null) this._setOptionMemo('Hash',        kv.hashMB);
    }
  }

  setMultiPV(n) {
    this.multipv = n;
    this._queueOrApply({ multipv: n });
  }

  setSkill(level) {
    this.skill = level;
    this._queueOrApply({ skill: level });
  }

  setThreads(n) {
    this.threads = n;
    this._queueOrApply({ threads: n });
  }

  /** Resize Stockfish's transposition table ("hash"). Unit = MB. */
  setHash(mb) {
    this.hashMB = Math.max(1, +mb | 0);
    this._queueOrApply({ hashMB: this.hashMB });
  }

  /** Clear the transposition table — forgets all previously-analysed
   *  positions. Sent as UCI `ucinewgame` which Stockfish treats as
   *  "new game, wipe cache". Unconditional — always clears. */
  clearHash() {
    if (!this.ready) return;
    this._lastGameId = null;
    this._send('ucinewgame');
    this._send('isready');
  }

  /** Signal a new game context to Stockfish. If the gameId matches
   *  the last one we already signalled, this is a no-op — preserves
   *  the transposition-table warmth across repeated analyses of the
   *  same game (huge hash-hit speedup). Caller is responsible for
   *  picking a gameId that UNIQUELY identifies "this game" (e.g.,
   *  startingFen + flavor). Any change triggers ucinewgame.
   *  Lila-style port from ui/lib/src/ceval/protocol.ts. */
  noteGameId(gameId) {
    if (!this.ready) return;
    if (this._lastGameId === gameId) return;
    this._lastGameId = gameId;
    this._send('ucinewgame');
  }

  _send(cmd) {
    if (!this.worker) return;
    // Pre-uciok gate: was blocking LEGITIMATE commands in practice when
    // a clear uciok-reset path exists. The narrower, safer guard: drop
    // only commands issued before we've even posted 'uci' (worker not
    // yet attempting handshake). Once 'uci' has been sent, Stockfish's
    // own handshake handles queued commands fine.
    if (this.uciSent && !this.uciokReceived && cmd !== 'uci') {
      // Worker is still in the narrow handshake window. It's safe to
      // queue setoption/position/go — Stockfish buffers them and
      // processes after uciok. Only block 'stop' which can actually
      // trip an assertion if received mid-init.
      if (cmd === 'stop') { console.log('[engine] dropped pre-uciok stop'); return; }
    }
    if (cmd === 'uci') this.uciSent = true;
    this.worker.postMessage(cmd);
  }

  _waitFor(token) {
    return new Promise((resolve) => {
      const wrapped = (e) => {
        const line = e.data;
        if (typeof line === 'string' && line.includes(token)) {
          this.worker.removeEventListener('message', wrapped);
          resolve();
        }
      };
      this.worker.addEventListener('message', wrapped);
    });
  }

  /**
   * Wait for an `info string <prefix>…` line from the Worker.
   *
   * Used by the lichess-full boot path to await the
   *   info string LSF_NNUE_LOADED index=0
   * ack from lichess-shim.js before signalling engine.ready.
   *
   * Times out (rejects) after `timeoutMs` so a stuck NNUE fetch can't
   * silently freeze boot — engine.js's existing 15s boot timeout would
   * then fire too late if we used it. Default 120s covers a slow
   * mobile network downloading the 100 MB big NNUE.
   */
  _waitForInfoString(prefix, timeoutMs = 120_000) {
    // Capture the worker reference at promise-creation time. If main.js's
    // boot timeout fires earlier than ours and calls terminate(), this.worker
    // becomes null. The setTimeout below would then call null.removeEventListener
    // and throw an uncaught TypeError. Holding our own reference guarantees
    // cleanup never references a null worker.
    const w = this.worker;
    return new Promise((resolve, reject) => {
      let settled = false;
      const wrapped = (e) => {
        const line = e.data;
        if (typeof line !== 'string') return;
        // Match `info string <prefix>` (the rest of the line is data
        // — bytes, error message, etc.).
        if (line.startsWith('info string ' + prefix) ||
            // tolerate exact match too (some shim outputs may not have data)
            line === 'info string ' + prefix) {
          cleanup();
          resolve(line);
        }
      };
      const t = setTimeout(() => {
        cleanup();
        reject(new Error(`timeout waiting for "info string ${prefix}" after ${timeoutMs}ms`));
      }, timeoutMs);
      const cleanup = () => {
        if (settled) return;
        settled = true;
        clearTimeout(t);
        // Guard with optional chaining + try — w may have been terminated
        // (and its event-target methods torn down) between then and now.
        try { w?.removeEventListener?.('message', wrapped); } catch {}
      };
      w.addEventListener('message', wrapped);
    });
  }

  /**
   * @param {string} fen
   * @param {{depth?:number, movetime?:number, searchmoves?:string[]}} opts
   */
  start(fen, opts = {}) {
    if (!this.ready) {
      console.log('[engine] start() ignored — engine not ready yet');
      return;
    }
    // ── SINGLE-FLIGHT POLICY (per GPT consultation) ────────────────
    // Stockfish.js (nmrugg distribution) does NOT queue `position`
    // commands while a search is alive. Sending stop+position+go on
    // the same tick can mutate the position before the previous
    // search has cleanly ended — primary suspect for the mid-search
    // wedges we kept seeing. Fix: never send a new position+go
    // until the previous bestmove has arrived (or the worker is
    // terminated). Only the LATEST request is queued; rapid starts
    // collapse to the most recent target FEN.
    //
    // Flow:
    //   * Engine idle    → execute immediately (_doStart).
    //   * Engine searching → store {fen, opts} in _pendingRequest;
    //                        send `stop`. The bestmove handler's
    //                        drain step runs the queued request.
    //   * Engine wedged  → the inflight-stall watchdog terminates
    //                      and reboots the worker; on next ready it
    //                      drains _pendingRequest.
    if (this.searching) {
      const overwrote = !!this._pendingRequest;
      this._pendingRequest = { fen, opts };
      console.log('[engine] start() while searching — queued', {
        searchId: this._searchId,
        overwrote,
        targetFen: fen.slice(0, 30) + '…',
      });
      // Tell the engine to wrap up so its bestmove fires soon.
      // _pendingGos is NOT bumped here — there's no new `go` yet.
      this._send('stop');
      return;
    }
    this._pendingGos = (this._pendingGos || 0) + 1;
    this._doStart(fen, opts);
  }

  // Internal: dispatch a synthetic stuck-bestmove so the UI unfreezes
  // when the worker stops responding. Idempotent — repeated calls
  // while _bestmoveAwaited is already false do nothing. The dispatched
  // event has stuck:true so consumers (main.js practice handler) can
  // route to auto-recovery (terminate + flavor reboot) instead of
  // playing best=null onto the board.
  _fireStuckSynthetic(reason) {
    if (!this._bestmoveAwaited) return false;
    console.error(`[engine] worker wedged (${reason}) — emitting synthetic bestmove`);
    this._bestmoveAwaited = false;
    this.searching = false;
    if (this._stallTimer)    { clearTimeout(this._stallTimer);    this._stallTimer = 0; }
    if (this._healthCheckId) { clearTimeout(this._healthCheckId); this._healthCheckId = 0; }
    if (this._watchdogId)    { clearTimeout(this._watchdogId);    this._watchdogId = 0; }
    this.dispatchEvent(new CustomEvent('bestmove', {
      detail: { best: null, ponder: null, topMoves: [], history: this.history, stuck: true }
    }));
    // ALSO dispatch engine-crashed so the main.js telemetry pipeline
    // counts it. Without this, "responsive-but-frozen" wedges (which
    // never trigger worker.onerror because the WASM didn't throw —
    // it just stopped responding to stop) were going un-counted in
    // engine_crashes, undercounting the Phase-3-decision data.
    // Skip when reason starts with 'worker crashed:' — that path
    // already dispatches engine-crashed via _handleWorkerCrash.
    if (!String(reason).startsWith('worker crashed:')) {
      this.dispatchEvent(new CustomEvent('engine-crashed', {
        detail: { flavor: this.flavor, message: 'wedge: ' + reason },
      }));
    }
    return true;
  }

  // Runtime worker.onerror handler. Treats any post-boot worker
  // crash (memory OOB, null function, Aborted(), etc.) as fatal for
  // this Engine instance:
  //   * mark not ready
  //   * fire synthetic stuck-bestmove if one was awaited (UI unfreeze)
  //   * terminate the worker
  //   * emit `engine-crashed` so main.js routes to recovery
  // Idempotent — once we've crashed and emitted, further worker
  // errors are ignored (stops the log flood we saw — 102 instances
  // of the same memory-OOB in the same millisecond).
  _handleWorkerCrash(errEvent) {
    if (this._crashed) return;     // already handled
    this._crashed = true;
    const msg = (errEvent && (errEvent.message || errEvent.error?.message))
      || 'Stockfish worker crashed (no message)';
    console.error('[engine] runtime worker crash — terminating', { msg, flavor: this.flavor });
    // Mark not ready BEFORE dispatching events so listeners checking
    // engine.ready see false.
    this.ready = false;
    // Cancel timers + fire synthetic stuck so the UI unfreezes.
    this._fireStuckSynthetic('worker crashed: ' + msg);
    // Tear down the worker. terminate() also clears its own timers
    // and resets _bestmoveAwaited / _pendingRequest.
    try { this.terminate(); } catch {}
    // Tell main.js: route to one-way fallback (full → lite, etc.).
    this.dispatchEvent(new CustomEvent('engine-crashed', {
      detail: { flavor: this.flavor, message: msg },
    }));
  }

  // Internal: drain a queued request after the current search ends.
  // Called from the bestmove handler. Only fires the latest request,
  // discarding any older ones that were overwritten while searching.
  _drainPendingRequest() {
    if (!this._pendingRequest) return;
    if (this.searching) return;   // shouldn't happen, defensive
    const { fen, opts } = this._pendingRequest;
    this._pendingRequest = null;
    console.log('[engine] draining pending request', { fen: fen.slice(0, 30) + '…', opts });
    this._pendingGos = (this._pendingGos || 0) + 1;
    this._doStart(fen, opts);
  }

  _doStart(fen, opts = {}) {

    this.history  = [];
    this.topMoves = new Map();
    this.searching = true;
    this.stopRequested = false;
    this.currentFen = fen;
    // Separate from `searching` because stop() sets searching=false
    // immediately on the JS side while the worker may still owe us a
    // bestmove. The synthetic-bestmove backup in the watchdog checks
    // THIS flag so it actually fires when the worker really is wedged.
    this._bestmoveAwaited = true;

    // ───── Mismatch detector ─────
    // Track per-search diagnostics so we can catch the "engine should
    // be analyzing, nothing appearing" state.
    this._searchId = (this._searchId || 0) + 1;
    const myId = this._searchId;
    this._infoReceived = 0;
    this._infoDropped = 0;
    this._infoDispatched = 0;
    this._lastInfoAt = 0;

    console.log('[engine] _doStart', {
      searchId: myId,
      fen: fen.slice(0, 40) + '…',
      opts,
      uciokReceived: this.uciokReceived,
      workerAlive: !!this.worker,
    });

    // Health check 2 seconds after _doStart: if the engine is still
    // marked as searching but produced nothing (or everything got
    // dropped), scream loud so the next log file tells us exactly
    // which code path broke.
    if (this._healthCheckId) clearTimeout(this._healthCheckId);
    this._healthCheckId = setTimeout(() => {
      this._healthCheckId = 0;
      if (this._searchId !== myId) return; // superseded
      if (!this.searching) return; // completed naturally
      const state = {
        searchId: myId,
        elapsed_ms: 2000,
        infoReceived: this._infoReceived,
        infoDropped: this._infoDropped,
        infoDispatched: this._infoDispatched,
        stopRequested: this.stopRequested,
        uciokReceived: this.uciokReceived,
        workerAlive: !!this.worker,
        lastInfoAgo_ms: this._lastInfoAt ? Date.now() - this._lastInfoAt : null,
      };
      if (this._infoReceived === 0) {
        console.error('[engine] ⚠ MISMATCH: 2 s passed, _doStart fired, but worker emitted ZERO info lines. Worker may be wedged or command gate dropped position/go.', state);
        // Fire a window event so main.js's reactive auto-recovery
        // can pick it up and run the flavor-switch ritual.
        try { window.dispatchEvent(new CustomEvent('engine-silent-detected', { detail: state })); } catch {}
      } else if (this._infoDispatched === 0 && this._infoDropped > 0) {
        console.error('[engine] ⚠ MISMATCH: info lines arriving BUT all dropped by stopRequested guard. Flag stuck true.', state);
      } else {
        console.log('[engine] health check OK', state);
      }
    }, 2000);

    // Bestmove watchdog (lichess lacks this — see lila #11373 stuck-
    // engine reports). If bestmove doesn't arrive in a reasonable
    // window, take action so downstream callers don't hang forever.
    //
    // Two-tier policy (refined after a "stuck on practice start"
    // false-positive report):
    //   1. WATCHDOG TIMEOUT — at budget. Always force a stop().
    //      If the engine has been responding (info lines received),
    //      the stop forces it to flush its current best. We DO NOT
    //      emit a synthetic stuck-bestmove in that case — the engine
    //      isn't stuck, just slow. The stop-elicited bestmove arrives
    //      naturally and clears _bestmoveAwaited.
    //   2. SYNTHETIC EMIT — only if the engine never sent a single
    //      info line (truly silent / wedged at boot). This is the
    //      one signal we can trust to mean "the worker is dead".
    //
    // Budget bumped 3x → 5x movetime to give legitimately slow boots
    // (108 MB net cold-cache, mobile Safari) plenty of room to complete
    // before the watchdog even fires.
    if (this._watchdogId) clearTimeout(this._watchdogId);
    const budget = opts.movetime
      ? Math.max(5000, opts.movetime * 5)
      : (opts.depth ? 60_000 : 60_000);
    this._watchdogId = setTimeout(() => {
      if (!this._bestmoveAwaited) return;
      const responsive = (this._infoReceived || 0) > 0;
      console.warn('[engine] bestmove watchdog fired — forcing stop', {
        responsive, infoReceived: this._infoReceived || 0,
      });
      this.stop();
      // Two-stage post-stop check (cf. _fireStuckSynthetic helper):
      //   t+1.5s — silent at boot? declare wedged immediately.
      //   t+5s   — hard backstop. responsive engines must answer
      //            stop within 5 s. If they haven't by then, the
      //            worker is genuinely stuck — fire synthetic so
      //            the UI unfreezes + main.js routes to recovery.
      setTimeout(() => {
        if (!this._bestmoveAwaited) return;
        if (responsive) {
          console.warn('[engine] watchdog: responsive engine still owes bestmove after stop — waiting up to 5 s more');
          return;
        }
        this._fireStuckSynthetic('silent');
      }, 1500);
      setTimeout(() => {
        this._fireStuckSynthetic('responsive but stop ignored');
      }, 5000);
    }, budget);

    this._send(`position fen ${fen}`);

    const bits = ['go'];
    if (opts.infinite) {
      bits.push('infinite');
    } else {
      if (opts.depth)    bits.push('depth', String(opts.depth));
      if (opts.movetime) bits.push('movetime', String(opts.movetime));
      if (!opts.depth && !opts.movetime) bits.push('depth', '18');
    }
    if (opts.searchmoves && opts.searchmoves.length)
      bits.push('searchmoves', ...opts.searchmoves);
    this._send(bits.join(' '));
  }

  stop() {
    if (!this.worker) return;
    if (this.searching) {
      const caller = (new Error().stack || '').split('\n').slice(2, 4).map(s => s.trim()).join(' ← ');
      console.log('[engine] stop() called', {
        wasSearching: true,
        caller,
        searchId: this._searchId,
        infoReceivedSoFar: this._infoReceived,
        infoDispatchedSoFar: this._infoDispatched,
      });
      this.stopRequested = true;
    }
    this._send('stop');
    this.searching = false;
  }

  /** Analyse one specific move. Used for the "why not X?" feature. */
  analyseMove(fen, uciMove, depth = 14) {
    return new Promise((resolve) => {
      if (!this.ready) return resolve(null);
      if (this.searching) this.stop();

      const originalMultiPV = this.multipv;
      this._send('setoption name MultiPV value 1');

      this.topMoves = new Map();
      this.history  = [];
      this.searching = true;

      const onBest = (ev) => {
        this.removeEventListener('bestmove', onBest);
        this._send(`setoption name MultiPV value ${originalMultiPV}`);
        resolve(ev.detail);
      };
      this.addEventListener('bestmove', onBest);

      this._send(`position fen ${fen}`);
      this._send(`go depth ${depth} searchmoves ${uciMove}`);
    });
  }

  _handleLine(line) {
    if (typeof line !== 'string') return;

    // First, latch uciok as early as possible so subsequent _send()
    // calls stop being blocked by the pre-uciok gate.
    if (line.startsWith('uciok')) this.uciokReceived = true;

    // Lichess-shim NNUE download progress. Forward as a structured
    // event so main.js can render a progress bar during cold-cache
    // boot (without this, "booting…" stays visible 30-60+ s with no
    // hint that anything is happening).
    if (line.startsWith('info string LSF_NNUE_FETCH_START ')) {
      // index=<n> total=<bytes> url=<url>
      const m = /index=(\d+)\s+total=(\d+)/.exec(line);
      if (m) this.dispatchEvent(new CustomEvent('boot-progress', {
        detail: { phase: 'fetch-start', index: +m[1], total: +m[2], received: 0 },
      }));
    } else if (line.startsWith('info string LSF_NNUE_PROGRESS ')) {
      const m = /index=(\d+)\s+received=(\d+)\s+total=(\d+)/.exec(line);
      if (m) this.dispatchEvent(new CustomEvent('boot-progress', {
        detail: { phase: 'progress', index: +m[1], received: +m[2], total: +m[3] },
      }));
    } else if (line.startsWith('info string LSF_NNUE_LOADED ')) {
      const m = /index=(\d+)\s+bytes=(\d+)/.exec(line);
      if (m) this.dispatchEvent(new CustomEvent('boot-progress', {
        detail: { phase: 'loaded', index: +m[1], received: +m[2], total: +m[2] },
      }));
    } else if (line.startsWith('info string LSF_NNUE_FAIL ')) {
      const m = /index=(\d+)/.exec(line);
      if (m) this.dispatchEvent(new CustomEvent('boot-progress', {
        detail: { phase: 'fail', index: +m[1] },
      }));
    }

    if (line.startsWith('info')) {
      // Drop info lines that arrive AFTER we've asked to stop. They
      // belong to the old search; using them mutates state under a
      // position the UI has moved on from.
      this._infoReceived = (this._infoReceived || 0) + 1;
      this._lastInfoAt = Date.now();
      // Reset the stall watchdog (per GPT consultation): if info
      // stops flowing for STALL_MS while we're still searching, the
      // worker is wedged — fire a synthetic stuck-bestmove and let
      // main.js auto-recover via switchEngineFlavor.
      if (this._stallTimer) clearTimeout(this._stallTimer);
      this._stallTimer = setTimeout(() => {
        if (!this._bestmoveAwaited) return;
        console.error('[engine] STALL: no info for 6s during search — declaring wedged', {
          searchId: this._searchId,
          infoReceived: this._infoReceived,
        });
        this._fireStuckSynthetic('stalled — no info 6s');
      }, 6000);
      if (this.stopRequested) {
        this._infoDropped = (this._infoDropped || 0) + 1;
        return;
      }
      const info = parseInfo(line);
      if (!info || info.pv == null) return;
      this._infoDispatched = (this._infoDispatched || 0) + 1;

      this.topMoves.set(info.multipv, info);

      if (info.multipv === 1) {
        this.history.push({
          depth:     info.depth,
          score:     info.score,
          scoreKind: info.scoreKind,
          best:      info.pv[0],
          pv:        info.pv,
          time:      info.time,
          nodes:     info.nodes,
          nps:       info.nps,
        });
      }

      this.dispatchEvent(new CustomEvent('thinking', {
        detail: {
          info,
          topMoves: Array.from(this.topMoves.values())
                         .sort((a, b) => a.multipv - b.multipv),
          history:  this.history,
        }
      }));
    }
    else if (line.startsWith('bestmove')) {
      // Each `go` produces exactly one bestmove. If we've queued more
      // gos than bestmoves received, this one is stale — a later go
      // is still pending and will emit the REAL bestmove. Drop.
      this._pendingGos = Math.max(0, (this._pendingGos || 1) - 1);
      if (this._pendingGos > 0) {
        console.log('[engine] suppressed stale bestmove (still expecting ' + this._pendingGos + ' more)', line);
        return;
      }
      this.searching = false;
      this._bestmoveAwaited = false;
      this.stopRequested = false;
      if (this._healthCheckId) { clearTimeout(this._healthCheckId); this._healthCheckId = 0; }
      if (this._watchdogId)    { clearTimeout(this._watchdogId);    this._watchdogId = 0; }
      if (this._stallTimer)    { clearTimeout(this._stallTimer);    this._stallTimer = 0; }
      this._applyPending();
      const m = line.match(/^bestmove\s+(\S+)(?:\s+ponder\s+(\S+))?/);
      const detail = {
        best:     m ? m[1] : null,
        ponder:   m ? m[2] : null,
        topMoves: Array.from(this.topMoves.values())
                       .sort((a, b) => a.multipv - b.multipv),
        history:  this.history,
      };
      console.log('[engine] bestmove', {
        best: detail.best,
        searchId: this._searchId,
        infoReceived: this._infoReceived,
        infoDropped: this._infoDropped,
        infoDispatched: this._infoDispatched,
      });
      this.dispatchEvent(new CustomEvent('bestmove', { detail }));
      // Single-flight drain: if start() was called during the search
      // that just ended, fire the queued request now.
      try { this._drainPendingRequest(); } catch (err) {
        console.warn('[engine] drainPendingRequest failed', err);
      }
    }
  }
}

export function parseInfo(line) {
  const tokens = line.split(/\s+/);
  if (tokens[0] !== 'info') return null;

  const out = {
    depth: 0, seldepth: 0, multipv: 1,
    score: 0, scoreKind: 'cp',
    nodes: 0, nps: 0, time: 0, pv: null,
  };

  for (let i = 1; i < tokens.length; i++) {
    const t = tokens[i];
    switch (t) {
      case 'depth':     out.depth    = +tokens[++i]; break;
      case 'seldepth':  out.seldepth = +tokens[++i]; break;
      case 'multipv':   out.multipv  = +tokens[++i]; break;
      case 'nodes':     out.nodes    = +tokens[++i]; break;
      case 'nps':       out.nps      = +tokens[++i]; break;
      case 'time':      out.time     = +tokens[++i]; break;
      case 'hashfull':  out.hashfull = +tokens[++i]; break;
      case 'tbhits':    out.tbhits   = +tokens[++i]; break;
      case 'score':
        out.scoreKind = tokens[++i];
        out.score     = +tokens[++i];
        if (tokens[i+1] === 'lowerbound' || tokens[i+1] === 'upperbound') {
          out.bound = tokens[++i];
        }
        break;
      case 'pv':
        out.pv = tokens.slice(i + 1);
        i = tokens.length;
        break;
    }
  }

  if (!out.pv) return null;
  return out;
}
