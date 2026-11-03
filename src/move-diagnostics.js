// Private, bounded browser diagnostics. No account data, tokens, PGN or FEN.
// Persist requests before processing so interrupted moves survive a reload.
const KEY = 'stockfish.move-diagnostics.v1';
const LIMIT = 200;
const MAX_AGE = 7 * 24 * 60 * 60 * 1000;
export function readMoveDiagnostics() {
  try {
    const entries = JSON.parse(globalThis.localStorage?.getItem(KEY) || '[]');
    return Array.isArray(entries) ? entries.filter(e => e && Date.parse(e.at) > Date.now() - MAX_AGE).slice(-LIMIT) : [];
  } catch { return []; }
}
export function traceMoveRequest(board, from, to, via) {
  const id = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const started = performance.now();
  const write = (stage, reason) => {
    const entry = {
      at: new Date().toISOString(), id, stage, reason,
      from: /^[a-h][1-8]$/.test(from) ? from : null,
      to: /^[a-h][1-8]$/.test(to) ? to : null,
      via: ['3d-board', 'chessground-after', 'keyboard-san', 'target-first-click', 'target-drag', 'pending-source'].includes(via) ? via : 'other',
      ply: board.tree?.nodesAlong(board.tree.currentPath).length,
      originalPlies: board.totalPlies(), mainlinePlies: board.tree?.mainlineNodes().length,
      elapsedMs: Math.round(performance.now() - started),
    };
    try { globalThis.localStorage?.setItem(KEY, JSON.stringify([...readMoveDiagnostics(), entry].slice(-LIMIT))); } catch {}
    console.info('[move-attempt]', entry);
  };
  write('requested', null);
  return (accepted, reason) => { write(accepted ? 'accepted' : 'rejected', reason); return accepted; };
}
