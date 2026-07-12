// board.js — chessground + chess.js + move-history navigation.

import { Chessground } from '../vendor/chessground/chessground.js';
import { Chess }       from '../vendor/chess.js/chess.js';
import { showPromotion } from './promotion.js';
import { GameTree }     from './tree.js';

export class BoardController extends EventTarget {
  constructor(rootEl, overlayEl) {
    super();
    this.rootEl    = rootEl;
    this.overlayEl = overlayEl;

    // `chess` always holds the position currently DISPLAYED. `livePath`
    // is the durable tree path that represents the active end position;
    // `viewPly` is null only while currentPath === livePath. Keeping the
    // path explicitly avoids the old circular `viewPly >= history.length`
    // test, which incorrectly called every variation "live".
    this.chess = new Chess();
    this.startingFen = this.chess.fen();
    this.viewPly = null;
    this.cg = null;
    this.orientation = 'white';
    this.playerColor = 'both';
    // Variation tree — mirrors every move played into a branching
    // structure so the user can explore sidelines without losing the
    // mainline. `tree.currentPath` is the path of the currently-viewed
    // node. Mainline = children[0] at every level.
    this.tree = new GameTree(this.startingFen);
    this.livePath = '';
  }

  init() {
    const self = this;
    this.cg = Chessground(this.rootEl, {
      fen: this.chess.fen(),
      orientation: this.orientation,
      turnColor: 'white',
      highlight: { lastMove: true, check: true },
      // Shorter slide — 120 ms feels snappy while still visible. Long
      // animations exaggerate main-thread hiccups during the slide.
      animation: { enabled: true, duration: 120 },
      movable: {
        free: false,
        color: 'both',                       // either side can move
        dests: toDests(this.chess),
        showDests: true,
        events: { after: (orig, dest, meta) => self._onUserMove(orig, dest, { ...meta, via: 'chessground-after' }) },
      },
      draggable: { enabled: true, showGhost: true },
      selectable: { enabled: true },
      drawable: { enabled: true, defaultSnapToValidMove: true, eraseOnClick: false },
      premovable: { enabled: false },
      // Any chessground-native select or move invalidates our
      // target-first pending state — otherwise leftover highlights /
      // _pendingTargetSources can trigger a spurious 'which piece?'
      // on the user's next click.
      events: {
        move:   (orig, dest, meta) => {
          console.log('[cg] move fired', { orig, dest, capture: meta?.captured || null });
          self._clearTargetFirst();
        },
        select: (key) => {
          console.log('[cg] select fired', { key, cgSelectedAfter: self.cg?.state?.selected });
          self._clearTargetFirst();
        },
      },
    });

    this.rootEl.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const key = this._coordsToKey(e.clientX, e.clientY);
      if (!key) return;
      self._onRightClickSquare(key, e);
    });

    // Keep chessground's cached bounds fresh when the board element
    // itself resizes — chessground only listens for window resize +
    // document scroll, so CSS-driven reflows (panel show/hide, flex
    // reorder, board-resize handle) can leave stale bounds. Observing
    // rootEl covers all those cases.
    try {
      if (typeof ResizeObserver === 'function') {
        const ro = new ResizeObserver(() => {
          try { self.cg?.state?.dom?.bounds?.clear?.(); } catch {}
        });
        ro.observe(this.rootEl);
        this._boundsObserver = ro;
      }
    } catch {}

    // Target-first input. Two modes:
    //  (a) pointerdown on empty/enemy square → start tracking. On pointerup,
    //      if released on a legal source square (i.e. user "dragged back"
    //      from target to a piece), execute that move. This is the
    //      "target-drag" input method.
    //  (b) If pointer didn't move much (still a click), fall through to
    //      click-target-first: if one legal source exists, play; otherwise
    //      highlight candidates, next click picks source.
    this.rootEl.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      // Chessground caches its board bounds via util.memo and only
      // invalidates on scroll/resize events. Any layout shift that
      // moves the board without either (panel show/hide, flex reorder,
      // toolbar toggle, etc.) leaves chessground with STALE bounds —
      // clicks map to squares 1-2 ranks off from where the user
      // actually clicked. Invalidate the cache every pointerdown so
      // the next bounds() call reads fresh. Cheap — one rect lookup.
      try { this.cg?.state?.dom?.bounds?.clear?.(); } catch {}
      const target = this._coordsToKey(e.clientX, e.clientY);
      if (!target) {
        console.log('[move-input] pointerdown off-board', { x: e.clientX, y: e.clientY });
        return;
      }
      const snapshot = {
        target,
        pieceAtTarget: this.chess.get(target) || null,
        turn: this.chess.turn(),
        cgSelected: this.cg?.state?.selected || null,
        viewPly: this.viewPly,
        pendingTarget: this._pendingTarget,
        pendingCount: this._pendingTargetSources?.length || 0,
      };
      console.log('[move-input] pointerdown', snapshot);

      // DEFER TO CHESSGROUND when a piece is already selected. If the
      // user clicked one of their own pieces first, cg.state.selected
      // holds that square — chessground will handle the next click as
      // the destination natively. Our target-first logic used to cut in
      // and show a "which piece?" candidates prompt when more than one
      // of the user's pieces could reach the target, overriding the
      // selection they'd already made.
      if (this.cg && this.cg.state && this.cg.state.selected) {
        console.log('[move-input] → bail: already-selected (chessground will handle)', { selected: this.cg.state.selected, target });
        this._logInputPath('bail:already-selected', target);
        return;
      }

      const effectiveChess = (!this.isAtLive() && this._historicalChess)
        ? this._historicalChess
        : this.chess;

      // PENDING-SOURCE RESOLUTION must run BEFORE any ownership-based
      // bail (near-miss / own-piece). Otherwise a user clicking an
      // own-piece that's ALSO a legal source for the armed target-
      // first gets swallowed by the ownership check — which the log
      // showed on Nf6 / b7 clicks.
      if (this._pendingTargetSources && this._pendingTargetSources.includes(target)) {
        const prevTarget = this._pendingTarget;
        console.log('[move-input] → resolve pending target-first', { source: target, target: prevTarget });
        this._clearTargetFirst();
        self._onUserMove(target, prevTarget, { via: 'pending-source' });
        this._logInputPath('resolve:pending-source', `${target}→${prevTarget}`);
        return;
      }

      // NEAR-MISS GUARD: if the click landed within one-third of a
      // square of a movable piece CENTRE but NOT on that square itself,
      // treat it as a piece-click intent and skip target-first. Covers
      // the "tapped king, finger on adjacent empty square" case.
      //
      // BUT (audit B6): only when the clicked square is NOT itself a
      // legal destination. If some piece can legally move there, the
      // user clearly meant target-first — bailing would make clicks
      // near your own pieces silently dead (e.g. clicking d4 next to
      // your e3 pawn did nothing).
      const targetIsLegalDest = (() => {
        try { return effectiveChess.moves({ verbose: true }).some(m => m.to === target); }
        catch { return false; }
      })();
      if (!targetIsLegalDest &&
          this._nearMissOwnPiece(e.clientX, e.clientY, effectiveChess, target)) {
        console.log('[move-input] → bail: near-miss-own-piece (treating as click on nearby piece)', { target });
        this._logInputPath('bail:near-miss-own-piece', target);
        return;
      }

      // If stale pending state exists (armed from a prior interaction
      // but the user has clicked somewhere unrelated now) — clear it.
      if (this._pendingTargetSources) {
        console.log('[move-input] clearing stale pending target-first state');
        this._clearTargetFirst();
      }

      const p = effectiveChess.get(target);
      // If our piece is on this square, chessground handles its own drag.
      if (p && p.color === effectiveChess.turn()) {
        console.log('[move-input] → bail: own-piece on target (chessground will select it)', { piece: p, target });
        this._logInputPath('bail:own-piece', target);
        return;
      }

      // Collect legal sources that can reach this target.
      let legalSources = [];
      try {
        legalSources = effectiveChess.moves({ verbose: true })
                                     .filter(m => m.to === target)
                                     .map(m => m.from);
      } catch (err) {
        console.warn('[move-input] chess.moves threw', err);
        return;
      }
      if (!legalSources.length) {
        console.log('[move-input] no legal moves to target → target-first aborted', { target });
        return;
      }
      // OFF-TURN GUARD: when playerColor is set to 'white' or 'black'
      // (practice mode, not analysis), target-first must NOT accept
      // moves whose side-to-move is different from the user's color.
      // Without this guard, user in a practice game (black) can click
      // a target square during engine's (white's) turn, target-first
      // finds legal WHITE moves to that square, and plays one for the
      // engine. That's how Bxh6 got played accidentally during the
      // engine's variation-fork search — user's click overrode the
      // engine's still-thinking answer.
      if (this.playerColor === 'white' || this.playerColor === 'black') {
        const turnLetter = effectiveChess.turn();         // 'w' | 'b'
        const userLetter = this.playerColor[0];
        if (turnLetter !== userLetter) {
          console.log('[move-input] target-first off-turn: not your move to make', {
            target, turn: turnLetter, user: userLetter,
          });
          return;
        }
      }
      // Multi-source policy:
      //   - CLICK (no drag)   → bail silently; the 'which piece?'
      //                         prompt was confusing. User picks the
      //                         piece first (chessground flow).
      //   - DRAG from target  → still supported: dragging TO a legal
      //                         source disambiguates, so we let it
      //                         through via the onUp handler below.
      // Single-source path keeps the candidate highlight so the user
      // sees which piece will move.
      const isSingleSource = legalSources.length === 1;
      if (isSingleSource) {
        console.log('[move-input] target-first: lighting up candidate', { target, sources: legalSources });
        this._highlightCandidates(legalSources);
      } else {
        console.log('[move-input] target-first: multi-source, drag enabled but no click prompt', { target, candidateCount: legalSources.length });
        // Highlights kept off — would have looked like the old
        // confusing "which piece?" prompt. Drag still tracks below.
      }

      const startX = e.clientX, startY = e.clientY;
      let dragged = false;
      const MOVE_THRESHOLD = 5;  // px

      const onMove = (mv) => {
        if (!dragged) {
          const dx = mv.clientX - startX, dy = mv.clientY - startY;
          if (dx*dx + dy*dy > MOVE_THRESHOLD * MOVE_THRESHOLD) dragged = true;
        }
      };
      const onUp = (ue) => {
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        const releasedOn = this._coordsToKey(ue.clientX, ue.clientY);
        console.log('[move-input] pointerup', { target, releasedOn, dragged });

        if (dragged) {
          // Target-drag path — did we release on a legal source?
          const src = this._coordsToKey(ue.clientX, ue.clientY);
          this._clearTargetFirst();
          if (src && legalSources.includes(src)) {
            console.log('[move-input] target-drag → playing', { src, target });
            self._onUserMove(src, target, { via: 'target-drag' });
          } else {
            console.log('[move-input] target-drag released on non-source, cancelled', { releasedOn: src, target });
          }
          return;
        }

        // Click path — target-first click resolution.
        if (legalSources.length === 1) {
          console.log('[move-input] target-first: single source → playing', { source: legalSources[0], target });
          this._clearTargetFirst();
          self._onUserMove(legalSources[0], target, { via: 'target-first-single' });
        } else {
          // Multi-source CLICK (no drag): arm pending state so the
          // user's NEXT click on a legal source resolves the move.
          // Highlights are intentionally left off to avoid the old
          // "which piece?" visual — but the pending-source pathway
          // in pointerdown will still pick up the next click silently.
          console.log('[move-input] target-first: multi-source click, arming pending', { target, sources: legalSources });
          self._pendingTarget = target;
          self._pendingTargetSources = legalSources;
        }
      };
      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp, { once: true });
    });

    return this;
  }

  _legalMove(from, to) {
    try {
      return this.chess.moves({ verbose: true }).some(m => m.from === from && m.to === to);
    } catch { return false; }
  }

  _highlightCandidates(squares) {
    // Use chessground auto-shapes as circles on candidate sources
    this.cg.setAutoShapes(squares.map(sq => ({ orig: sq, brush: 'yellow' })));
  }

  _clearTargetFirst() {
    this._pendingTarget = null;
    this._pendingTargetSources = null;
    // Restore auto-shapes (engine arrows come back on next `thinking` event)
  }

  // ──────── navigation ────────

  isAtLive()   { return !!this.tree && this.tree.currentPath === this.livePath; }
  totalPlies() { return this.tree?.nodesAlong?.(this.livePath || '').length || 0; }

  /** Sync tree.currentPath to match the first `n` plies of chess.history
   *  along the tree's mainline. Called during navigation. */
  _syncTreePathToPly(n) {
    // Walk down children[0] at each level to ply n (or as far as tree allows).
    let path = '';
    let node = this.tree.root;
    const target = n == null ? this.chess.history().length : n;
    for (let i = 0; i < target; i++) {
      if (!node.children.length) break;
      const child = node.children[0];
      path += child.id;
      node = child;
    }
    this.tree.currentPath = path;
  }

  goToPly(n /* int or null for live */) {
    this._clearTargetFirst();   // audit B5 — see _navigateTo
    // `null` means the durable live path, which may be a variation after
    // post-game exploration. The previous implementation always walked
    // children[0] and could strand the user on the original mainline.
    if (n == null) {
      this._navigateTo(this.livePath || '');
      return;
    }
    // Rebuild from the TREE mainline, not chess.history. If the user
    // had made a non-mainline exploratory move earlier, chess.history
    // contains that branch instead of the original game's moves — so
    // replaying from chess.history would desync the board position
    // from the mainline tree.currentPath and, over time, effectively
    // erase the original PGN from the user's perspective.
    //
    // CRITICAL: `total` must come from the MAINLINE length, NOT from
    // this.chess.history(). After the user plays a side-variation
    // move, chess.history is on that branch (shorter than mainline)
    // — callers like learn-mode asking to navigate to mainline ply 16
    // would previously get CLAMPED to chess.history.length (e.g. 15),
    // silently landing one ply earlier than requested.
    let mainlineLen = 0;
    {
      let c = this.tree.root;
      while (c.children.length) { c = c.children[0]; mainlineLen++; }
    }
    const total = mainlineLen;
    const targetN = (n == null || n >= total)
      ? total
      : Math.max(0, n);
    // Walk mainline (children[0] chain) to collect nodes up to targetN.
    const pathNodes = [];
    let path = '';
    let cur = this.tree.root;
    for (let i = 0; i < targetN; i++) {
      if (!cur.children.length) break;
      const child = cur.children[0];
      path += child.id;
      pathNodes.push(child);
      cur = child;
    }
    // Rebuild chess from the starting FEN applying only mainline moves.
    const replay = new Chess(this.startingFen);
    for (const node of pathNodes) {
      const u = node.uci;
      try { replay.move({ from: u.slice(0,2), to: u.slice(2,4), promotion: u.length > 4 ? u[4] : undefined }); } catch { break; }
    }
    this.chess = replay;
    this.tree.currentPath = path;
    const atLivePath = path === this.livePath;
    if (atLivePath) {
      this.viewPly = null;
      this._historicalChess = null;
    } else {
      this.viewPly = targetN;
    }
    const lastMove = pathNodes.length
      ? [pathNodes[pathNodes.length - 1].uci.slice(0, 2), pathNodes[pathNodes.length - 1].uci.slice(2, 4)]
      : null;
    this._renderPosition(replay.fen(), lastMove);
    if (atLivePath) {
      this._allowUserToMoveIfTheirTurn();
    } else {
      // Let user play from this historical mainline ply — legal moves
      // from the rebuilt replay board.
      this._historicalChess = replay;
      this.cg.set({
        movable: {
          color: this.playerColor || 'both',
          dests: toDests(replay),
        },
      });
    }
    this.dispatchEvent(new CustomEvent('nav', { detail: { ply: this.viewPly, live: this.isAtLive() } }));
  }

  // TREE-AWARE navigation. forward / backward / toStart / toEnd walk
  // the tree from tree.currentPath instead of using chess.history —
  // so when the user is on a variation, Forward doesn't jump back
  // to the mainline but stays on the branch. Click a different
  // branch in the move list to switch branches.
  _navigateTo(newPath) {
    // Clear any armed target-first pending state — otherwise a click
    // that armed a target, followed by navigation, then a click on a
    // source square, would fire a move on the NEW position (audit B5).
    this._clearTargetFirst();
    const nodes = this.tree.nodesAlong(newPath);
    const replay = new Chess(this.startingFen);
    for (const n of nodes) {
      const u = n.uci;
      try {
        replay.move({ from: u.slice(0,2), to: u.slice(2,4), promotion: u.length > 4 ? u[4] : undefined });
      } catch { break; }
    }
    this.chess = replay;
    this.tree.currentPath = newPath;
    const atLivePath = newPath === this.livePath;
    this.viewPly = atLivePath ? null : nodes.length;
    this._historicalChess = atLivePath ? null : replay;
    const lastMove = nodes.length
      ? [nodes[nodes.length-1].uci.slice(0,2), nodes[nodes.length-1].uci.slice(2,4)]
      : undefined;
    const turn = replay.turn() === 'w' ? 'white' : 'black';
    this.cg.set({
      fen: replay.fen(),
      turnColor: turn,
      lastMove,
      check: replay.inCheck() ? turn : false,
      movable: { color: this.playerColor || 'both', dests: toDests(replay) },
    });
    this.dispatchEvent(new CustomEvent('nav', {
      detail: { path: newPath, ply: this.viewPly, live: atLivePath },
    }));
  }
  forward()   {
    const node = this.tree.nodeAtPath(this.tree.currentPath);
    if (!node || !node.children.length) return;
    this._navigateTo(this.tree.currentPath + node.children[0].id);
  }
  backward()  {
    if (!this.tree.currentPath) return;
    this._navigateTo(this.tree.parentPath(this.tree.currentPath) || '');
  }
  toStart()   { this._navigateTo(''); }
  toEnd()     { this._navigateTo(this.livePath || ''); }

  _renderPosition(fen, lastMove) {
    const parts = fen.split(' ');
    const turnColor = parts[1] === 'w' ? 'white' : 'black';
    const check = (new Chess(fen)).inCheck() ? turnColor : false;
    this.cg.set({ fen, turnColor, lastMove, check });
  }

  _allowUserToMoveIfTheirTurn() {
    // Analysis mode: always let the side-to-move act.
    this.cg.set({ movable: { color: 'both', dests: toDests(this.chess) } });
  }

  // ──────── user move handling ────────

  _coordsToKey(x, y) {
    // Measure against the actual <cg-board> element — not rootEl.
    // Why: rootEl is the cg-wrap mount point, which may contain
    // coord labels / SVG overlays that make its bounding rect bigger
    // than the real playing surface. Using rootEl gives results that
    // diverge from chessground's own key mapping by whole squares
    // (observed 2-rank offset → user clicking bishop, chessground
    // selecting empty square 2 rows away).
    // Always re-query cg-board (don't cache) — if a cached reference
    // became detached or the element was replaced, getBoundingClientRect
    // would return (0,0,0,0) and every click would read as off-board.
    // One querySelector per click is microseconds; worth the safety.
    const boardEl = this.rootEl.querySelector('cg-board');
    const bounds = (boardEl || this.rootEl).getBoundingClientRect();
    const relX = x - bounds.left;
    const relY = y - bounds.top;
    if (relX < 0 || relY < 0 || relX >= bounds.width || relY >= bounds.height) return null;
    const file = Math.floor(relX / (bounds.width / 8));
    const rank = 7 - Math.floor(relY / (bounds.height / 8));
    if (file < 0 || file > 7 || rank < 0 || rank > 7) return null;
    const fileCh = this.orientation === 'white'
      ? String.fromCharCode(97 + file)
      : String.fromCharCode(97 + 7 - file);
    const rankCh = this.orientation === 'white' ? (rank + 1) : (8 - rank);
    return `${fileCh}${rankCh}`;
  }

  // Returns true if the click coords are within ~33% of a square from
  // the CENTRE of a square that holds a movable piece of the current
  // side-to-move. Used by the pointerdown handler to treat a slightly-
  // missed click on the king as a piece-click intention and keep
  // chessground in charge, rather than triggering our target-first
  // 'which piece?' flow.
  _nearMissOwnPiece(x, y, effectiveChess, clickedKey) {
    // Only returns true when an OWN piece sits on a NEIGHBOURING
    // square whose centre is within NEAR of the click — i.e. the
    // click missed its intended target slightly. Direct hits (click
    // is squarely on an own piece) are NOT handled here; they fall
    // through to the later own-piece check, which is semantically
    // clearer. The earlier version also returned true for direct
    // hits, which made the log hard to read and (worse) swallowed
    // pending-source source-pick clicks on own-piece legal sources.
    try {
      const boardEl = this.rootEl.querySelector('cg-board');
      const bounds = (boardEl || this.rootEl).getBoundingClientRect();
      const sqW = bounds.width / 8;
      const sqH = bounds.height / 8;
      const NEAR = sqW * 0.33;
      const turn = effectiveChess.turn();
      const clickFx = Math.floor((x - bounds.left) / sqW);
      const clickRy = Math.floor((y - bounds.top)  / sqH);
      for (let df = -1; df <= 1; df++) {
        for (let dr = -1; dr <= 1; dr++) {
          const fx = clickFx + df;
          const ry = clickRy + dr;
          if (fx < 0 || fx > 7 || ry < 0 || ry > 7) continue;
          // Skip the clicked square itself — direct hits aren't 'near
          // misses' and shouldn't fire this guard.
          if (df === 0 && dr === 0) continue;
          const cx = bounds.left + (fx + 0.5) * sqW;
          const cy = bounds.top  + (ry + 0.5) * sqH;
          if (Math.abs(x - cx) > NEAR || Math.abs(y - cy) > NEAR) continue;
          const rank = 7 - ry;
          const fileCh = this.orientation === 'white'
            ? String.fromCharCode(97 + fx)
            : String.fromCharCode(97 + 7 - fx);
          const rankCh = this.orientation === 'white' ? (rank + 1) : (8 - rank);
          const key = `${fileCh}${rankCh}`;
          if (key === clickedKey) continue;   // belt-and-braces guard
          const p = effectiveChess.get(key);
          if (p && p.color === turn) return true;
        }
      }
    } catch {}
    return false;
  }

  // Narration-area diagnostic — toggled by window.__boardInputDebug = true.
  // Prints which input path the last pointerdown fired so we can see in
  // the UI without opening DevTools.
  _logInputPath(path, detail) {
    if (!window.__boardInputDebug) return;
    const msg = `[input] ${path} ${detail || ''}`;
    console.log(msg);
    try {
      const el = document.getElementById('narration-text');
      if (el) {
        const tag = document.createElement('div');
        tag.style.cssText = 'font-family:var(--font-mono);font-size:10px;opacity:0.7;';
        tag.textContent = msg;
        el.appendChild(tag);
      }
    } catch {}
  }

  _onRightClickSquare(key, _evt) {
    // Right-click also cancels any armed target-first state
    this._clearTargetFirst();
    this.cg.setAutoShapes([]);
    if (!this.isAtLive()) return;
    const piece = this.chess.get(key);
    this.dispatchEvent(new CustomEvent('why-not-region', {
      detail: { square: key, piece }
    }));
  }

  /** Cancel any pending target-first state and clear highlights — called
   *  after a user gesture completes so the next move attempt is clean. */
  _resetInputState() {
    this._clearTargetFirst();
    // Ask chessground to drop any current selection
    if (this.cg && typeof this.cg.selectSquare === 'function') {
      this.cg.selectSquare(null);
    }
    if (this.cg && typeof this.cg.cancelMove === 'function') {
      this.cg.cancelMove();
    }
  }

  async _onUserMove(orig, dest, _meta) {
    console.log('[move] _onUserMove called', {
      orig, dest,
      via: _meta?.via || 'unknown',         // 'chessground-after' | 'pending-source' | 'target-first-click' | 'target-drag' | ...
      meta: _meta || {},
      chessTurn: this.chess.turn(),
      isAtLive: this.isAtLive(),
      viewPly: this.viewPly,
      fenBefore: this.chess.fen(),
    });

    // ── DEFENSE-IN-DEPTH: off-turn rejection at move-application ──
    //
    // The pointerdown handler (line ~201) has an off-turn guard that
    // rejects target-first clicks during the engine's turn in practice.
    // BUT: in a 2026-05-04 user log we saw the guard SILENTLY MISS — a
    // black-side practice game let the user move a white queen on
    // white's turn (Qxd7 capture) and the move went through. The
    // pointerdown's `playerColor` was somehow 'both' at that moment, so
    // the guard's `=== 'white' || === 'black'` skipped.
    //
    // Catch it here too. Two independent signals:
    //   1. this.playerColor — primary (set by practice-start in main.js)
    //   2. document.body.dataset.practiceColor — backup (set by the
    //      same practice-start path). Survives even if playerColor was
    //      transiently reset to 'both' by some intermediate flow we
    //      haven't fully traced.
    //
    // If EITHER signal indicates the user has a fixed color and the
    // current chess.turn() is the OTHER color → reject the move.
    const turnLetter = this.chess.turn();   // 'w' | 'b'
    let userColor = null;
    if (this.playerColor === 'white' || this.playerColor === 'black') {
      userColor = this.playerColor;
    } else {
      try {
        const ds = document.body?.dataset?.practiceColor;
        if (ds === 'white' || ds === 'black') userColor = ds;
      } catch {}
    }
    if (userColor) {
      const userLetter = userColor[0];
      if (turnLetter !== userLetter) {
        console.warn('[move] off-turn rejection: not your move to make', {
          orig, dest, via: _meta?.via, turn: turnLetter, user: userLetter,
          playerColor: this.playerColor,
          dsPractice: document.body?.dataset?.practiceColor || null,
        });
        // Re-render from truth + reset input state (audit B3). Chessground
        // may have optimistically moved the dragged piece to `dest`; a bare
        // return would leave it there visually while chess.js disagrees,
        // until the next unrelated sync. Snap it back now.
        this._renderPosition(this.chess.fen(), lastMoveFromHistory(this.chess));
        this._resetInputState();
        return;   // ← do not apply the move
      }
    }
    // Post-game exploration is allowed: archiveCurrentGame uses a
    // snapshot taken at finishPracticeGame time (board._archiveSnapshot),
    // not live chess.history(), so extending the tree after game-end
    // can't corrupt the saved record.
    if (!this.isAtLive()) {
      // User moved from an old ply — truncate chess.js to the view ply
      // and branch from here. The variation tree keeps the old line as a
      // sibling; chess.js is rebuilt for legality of the new move.
      console.log('[move] branching from historical ply', { viewPly: this.viewPly });
      const verbose = this.chess.history({ verbose: true });
      const keep = this.viewPly || 0;
      this.chess = new Chess(this.startingFen);
      for (let i = 0; i < keep; i++) {
        const m = verbose[i];
        this.chess.move({ from: m.from, to: m.to, promotion: m.promotion });
      }
      this.viewPly = null;
      this._historicalChess = null;    // no longer needed
      // POST-GAME REPLACE-MAINLINE: when the game has finished
      // (practice-finished) or the user is in free analysis on a
      // previously-archived game (analysis-archived), playing a move
      // from a historical ply REPLACES the rest of the mainline
      // instead of creating a sibling variation. User asked for
      // edit-the-game semantics: "take a back move and play a new
      // one [should] stay as main line of the game". The original
      // game stays gospel via board._archiveSnapshot which was
      // frozen at game-end time and never touched after — so the
      // saved/exported PGN is unaffected by this re-edit.
      try {
        const cls = document.body.classList;
        const isPostGame = cls.contains('practice-finished') ||
                           cls.contains('analysis-archived');
        // AUDIT L1: do NOT replace the mainline while learn-from-mistakes
        // is active. Learn mode navigates to the pre-mistake ply via
        // goToPly (viewPly set) and lets the user try a move — but that
        // guess is a SCRATCH move, not an edit of the game. The old code
        // dropped cur.children here, deleting the played mistake move AND
        // every later ply of the archived game, which then made
        // _findMistakePlies fire a premature "Session complete" and Save
        // PGN export a truncated game. When learn is active the guess is
        // kept as a harmless sibling variation instead.
        const isLearnActive = cls.contains('learn-active');
        if (isPostGame && !isLearnActive && this.tree && this.tree.currentPath != null) {
          const cur = this.tree.nodeAtPath(this.tree.currentPath);
          if (cur && cur.children && cur.children.length) {
            console.log('[move] post-game mainline-replace: dropping continuation children', {
              path: this.tree.currentPath, dropped: cur.children.length,
            });
            cur.children = [];
          }
        }
      } catch (err) {
        console.warn('[move] post-game mainline-replace failed (continuing as variation)', err);
      }
    }

    const piece = this.chess.get(orig);
    if (!piece) {
      console.warn('[move] no piece at orig square — bailing', { orig });
      return;
    }

    let promotion = null;
    if (piece.type === 'p'
        && ((piece.color === 'w' && dest[1] === '8')
         || (piece.color === 'b' && dest[1] === '1'))) {
      promotion = await showPromotion(
        this.overlayEl, dest, piece.color === 'w' ? 'white' : 'black', this.orientation,
      );
    }
    // showPromotion returns a full role word ('queen'|'rook'|'bishop'|
    // 'knight'). chess.js + UCI need the single letter — and 'knight'[0]
    // is 'k' (invalid), so the old `promotion[0]` made KNIGHT PROMOTION
    // IMPOSSIBLE (audit B2): the move threw and the board snapped back.
    // Q/R/B only worked because their first letters happen to be right.
    const PROMO_LETTER = { queen: 'q', rook: 'r', bishop: 'b', knight: 'n' };
    const promoLetter = promotion ? (PROMO_LETTER[promotion] || 'q') : undefined;

    let move;
    try {
      move = this.chess.move({ from: orig, to: dest, promotion: promoLetter });
    } catch (e) {
      // Illegal — reset board to current truth and clear input state so
      // the user can try a different move immediately.
      console.warn('[move] chess.move threw (illegal)', { orig, dest, promotion, err: String(e) });
      this._renderPosition(this.chess.fen(), lastMoveFromHistory(this.chess));
      this._resetInputState();
      return;
    }
    if (!move) {
      console.warn('[move] chess.move returned null (illegal move rejected)', { orig, dest, promotion });
      this._renderPosition(this.chess.fen(), lastMoveFromHistory(this.chess));
      this._resetInputState();
      return;
    }
    console.log('[move] chess.move OK', { san: move.san, from: move.from, to: move.to, captured: move.captured || null, flags: move.flags });

    if (promotion) {
      const color = piece.color === 'w' ? 'white' : 'black';
      const pieces = new Map();
      pieces.set(dest, { role: promotion, color, promoted: true });
      this.cg.setPieces(pieces);
    }

    // Mirror the move into the variation tree. If the move matches an
    // existing child of the current node, we navigate to it; otherwise a
    // new branch is added (which will render as a sideline in the move
    // list and be preserved in PGN export). Use the UCI LETTER, not the
    // role word — otherwise the tree stored 'e7e8knight' and never merged
    // with the engine's canonical 'e7e8n' node (audit B2).
    const uci = orig + dest + (promoLetter || '');
    const addRes = this.tree.addNode(
      { uci, san: move.san, fen: this.chess.fen() },
      this.tree.currentPath,
    );
    if (addRes) {
      this.tree.currentPath = addRes.path;
      // Learn guesses are scratch branches and must never redefine the
      // user's active analysis line. Every ordinary played move does.
      const isLearnGuess = document.body?.classList?.contains('learn-active');
      if (!isLearnGuess) this.livePath = addRes.path;
    }
    this.viewPly = this.isAtLive() ? null : this.tree.nodesAlong(this.tree.currentPath).length;
    console.log('[move] tree updated', {
      uci, created: addRes?.created, path: this.tree.currentPath,
      newFen: this.chess.fen(),
    });

    // Chessground state sync — this kicks off the visual slide
    // animation. Run it synchronously so the animation frame renders
    // with zero competition.
    this._syncToChessground([orig, dest]);
    // Non-visual paperwork (move-list re-render, eval strip, engine
    // stop+start, graph update) runs in the NEXT animation frame
    // (Option B). The heavy sync work doesn't compete with the first
    // animation frame, so the piece-slide feels noticeably snappier
    // on slower devices. requestAnimationFrame gives us ~16 ms of
    // headroom before listeners run — invisible to the human eye.
    const moveFen = this.chess.fen();
    requestAnimationFrame(() => {
      this.dispatchEvent(new CustomEvent('move', { detail: { move, fen: moveFen } }));
    });
  }

  _syncToChessground(lastMove) {
    const turn = this.chess.turn() === 'w' ? 'white' : 'black';
    this.cg.set({
      fen: this.chess.fen(),
      turnColor: turn,
      lastMove,
      check: this.chess.inCheck() ? turn : false,
      movable: {
        color: this.playerColor || 'both',
        dests: toDests(this.chess),
      },
    });
  }

  playEngineMove(uci) {
    const from = uci.slice(0, 2);
    const to   = uci.slice(2, 4);
    const promotion = uci.length > 4 ? uci[4] : undefined;

    let move;
    try { move = this.chess.move({ from, to, promotion }); } catch (e) { return; }
    if (!move) return;

    this.cg.move(from, to);
    if (promotion) {
      const role = { q: 'queen', r: 'rook', b: 'bishop', n: 'knight' }[promotion];
      const color = move.color === 'w' ? 'white' : 'black';
      const p = new Map();
      p.set(to, { role, color, promoted: true });
      this.cg.setPieces(p);
    }
    // Mirror into variation tree
    const fullUci = from + to + (promotion || '');
    const addRes = this.tree.addNode(
      { uci: fullUci, san: move.san, fen: this.chess.fen() },
      this.tree.currentPath,
    );
    if (addRes) {
      this.tree.currentPath = addRes.path;
      this.livePath = addRes.path;
    }
    this.viewPly = null;
    this._syncToChessground([from, to]);
    this.dispatchEvent(new CustomEvent('move', { detail: { move, fen: this.chess.fen(), byEngine: true } }));
  }

  flipBoard() {
    this.orientation = this.orientation === 'white' ? 'black' : 'white';
    this.cg.set({ orientation: this.orientation });
    // Let listeners (eval gauge, any orientation-aware UI) know so
    // they can flip along with the board. Without this the eval bar
    // shows white-at-bottom regardless of which side the user is
    // playing — confusing when playing Black from the bottom.
    this.dispatchEvent(new CustomEvent('orientation-change', {
      detail: { orientation: this.orientation },
    }));
  }

  newGame() {
    this._clearTargetFirst();   // audit B5
    this.chess.reset();
    this.startingFen = this.chess.fen();   // back to standard start
    this.viewPly = null;
    this.tree = new GameTree(this.startingFen);
    this.livePath = '';
    this.cg.set({
      fen: this.chess.fen(),
      turnColor: 'white',
      lastMove: undefined,
      check: false,
      movable: { color: 'both', dests: toDests(this.chess) },
    });
    this.cg.setAutoShapes([]);
    this.dispatchEvent(new CustomEvent('new-game'));
  }

  undo({ prune = false } = {}) {
    this._clearTargetFirst();   // audit B5
    // Analysis mode: undo one ply at a time.
    const retractedPath = this.tree.currentPath;   // node being undone
    const undone = this.chess.undo();
    if (!undone) return null;
    this.viewPly = null;
    // Move tree cursor back one node on the current path.
    if (this.tree.currentPath) {
      this.tree.currentPath = this.tree.parentPath(this.tree.currentPath) || '';
    }
    this.livePath = this.tree.currentPath;
    // AUDIT T1: practice takeback = REPLACE, not branch. When prune is
    // set (an active-practice takeback), delete the retracted node so
    // the move the user plays next becomes the tree MAINLINE (children[0])
    // rather than a sibling variation. Without this, the abandoned line
    // stayed mainline and every consumer that walks children[0] (move
    // list, timeline, learn mode, PGN export) kept showing the retracted
    // move — the user's "the new line is always MAIN LINE" report.
    // Analysis mode (prune=false) keeps the old branch so the user can
    // re-enter it later, as before.
    if (prune && retractedPath) {
      try { this.tree.deleteAt(retractedPath); } catch (err) {
        console.warn('[undo] prune failed', err);
      }
    }
    this._syncToChessground(lastMoveFromHistory(this.chess));
    this.dispatchEvent(new CustomEvent('undo'));
    return true;
  }

  fen()  { return this.chess.fen(); }
  turn() { return this.chess.turn(); }

  /**
   * Play a sequence of UCI moves from the current position.
   *
   * `animate` (default true): animates each move individually via
   * chessground. Good for short PV extrapolations (a few moves).
   *
   * When `animate` is false: applies all moves to chess.js internally,
   * then sets the final FEN on chessground in a single shot. Use this
   * when loading a whole game (60+ plies) — avoids the "animation storm"
   * of playing 70 moves in sequence.
   */
  playUciMoves(uciList, { animate = true } = {}) {
    if (!this.isAtLive()) this.toEnd();
    if (!uciList || !uciList.length) return false;

    if (!animate) {
      for (const uci of uciList) {
        const from = uci.slice(0, 2), to = uci.slice(2, 4);
        const promotion = uci.length > 4 ? uci[4] : undefined;
        let move;
        try { move = this.chess.move({ from, to, promotion }); } catch { return false; }
        if (!move) return false;
        const full = from + to + (promotion || '');
        const addRes = this.tree.addNode({ uci: full, san: move.san, fen: this.chess.fen() }, this.tree.currentPath);
        if (addRes) this.tree.currentPath = addRes.path;
      }
      const last = uciList[uciList.length - 1];
      this.livePath = this.tree.currentPath;
      this.viewPly = null;
      this._syncToChessground([last.slice(0,2), last.slice(2,4)]);
      this.dispatchEvent(new CustomEvent('move', { detail: { fen: this.fen(), bulk: true } }));
      return true;
    }

    // Animated path (for PV extrapolations, etc.)
    for (const uci of uciList) {
      const from = uci.slice(0, 2), to = uci.slice(2, 4);
      const promotion = uci.length > 4 ? uci[4] : undefined;
      let move;
      try { move = this.chess.move({ from, to, promotion }); } catch { return false; }
      if (!move) return false;
      this.cg.move(from, to);
      if (promotion) {
        const role = { q:'queen', r:'rook', b:'bishop', n:'knight' }[promotion];
        const color = move.color === 'w' ? 'white' : 'black';
        const p = new Map();
        p.set(to, { role, color, promoted: true });
        this.cg.setPieces(p);
      }
      const full = from + to + (promotion || '');
      const addRes = this.tree.addNode({ uci: full, san: move.san, fen: this.chess.fen() }, this.tree.currentPath);
      if (addRes) this.tree.currentPath = addRes.path;
    }
    const last = uciList[uciList.length - 1];
    this.livePath = this.tree.currentPath;
    this.viewPly = null;
    this._syncToChessground([last.slice(0,2), last.slice(2,4)]);
    this.dispatchEvent(new CustomEvent('move', { detail: { fen: this.fen(), bulk: true } }));
    return true;
  }

  drawArrow(orig, dest, brush = 'paleGreen') {
    this.cg.setAutoShapes([{ orig, dest, brush }]);
  }

  drawArrows(shapes) {
    this.cg.setAutoShapes(shapes || []);
  }
}

export function toDests(chess) {
  const dests = new Map();
  const SQUARES = [];
  for (let r = 1; r <= 8; r++)
    for (let f = 0; f < 8; f++)
      SQUARES.push(String.fromCharCode(97 + f) + r);
  for (const sq of SQUARES) {
    try {
      const moves = chess.moves({ square: sq, verbose: true });
      if (moves.length) dests.set(sq, moves.map(m => m.to));
    } catch (e) {/* empty square */}
  }
  return dests;
}

function lastMoveFromHistory(chess) {
  const h = chess.history({ verbose: true });
  if (!h.length) return undefined;
  const last = h[h.length - 1];
  return [last.from, last.to];
}
