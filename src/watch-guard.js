// Watching borrows only the renderer. Never load feed FENs into BoardController.
export function createWatchGuard({ board, clock, togglePause, blocked }) {
  let saved = null;
  return active => {
    if (active) {
      if (saved) return;
      if (blocked()) throw Error('Wait for your current move or position to finish loading, then choose Watch again.');
      saved = { fen: board.fen(), resumeClock: clock.active && !clock.paused };
      if (saved.resumeClock) togglePause();
      board.watchActive = true;
    } else {
      const before = saved;
      saved = null;
      board.watchActive = false;
      // An explicit New/Load action may have replaced the user's own game.
      // Do not resume a new timer using an old game's pause ownership.
      if (before?.resumeClock && before.fen === board.fen() && clock.active && clock.paused) togglePause();
    }
  };
}
