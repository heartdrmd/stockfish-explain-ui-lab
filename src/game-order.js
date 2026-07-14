function playedAtMs(game) {
  const value = Date.parse(game?.played_at || '');
  return Number.isFinite(value) ? value : 0;
}

// My Games is immutable history: selection/review state is deliberately
// ignored. Only when the game was played may determine its position.
export function sortGamesByPlayedAt(games = []) {
  return [...games].sort((a, b) => {
    const timeDiff = playedAtMs(b) - playedAtMs(a);
    if (timeDiff) return timeDiff;
    return String(b?.id ?? '').localeCompare(String(a?.id ?? ''), undefined, {
      numeric: true,
    });
  });
}

