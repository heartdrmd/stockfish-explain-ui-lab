// Active practice returns to the human's last decision, without undoing the opening.
export function practiceTakebackCount(history, playerColor, openingPlies = 0) {
  const player = playerColor === 'white' ? 'w' : playerColor === 'black' ? 'b' : null;
  if (!player) return 0;
  for (let i=history.length-1; i>=Math.max(0,openingPlies); i--)
    if (history[i].color === player) return history.length-i;
  return 0;
}
