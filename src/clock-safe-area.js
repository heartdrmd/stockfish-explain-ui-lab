// Fit the clock into its own right-hand area, preserving the requested
// position separately so resizing never overwrites a saved layout.
export function fitClockArea({ left, right, top, bottom, width, height, x, y }) {
  const availableWidth = Math.max(0, right - left),
    availableHeight = Math.max(0, bottom - top);
  const scale =
    width > 0 && height > 0 ? Math.min(1, availableWidth / width, availableHeight / height) : 0;
  const fittedWidth = width * scale,
    fittedHeight = height * scale;
  return {
    left: Math.max(left, Math.min(right - fittedWidth, x)),
    top: Math.max(top, Math.min(bottom - fittedHeight, y)),
    width: fittedWidth,
    height: fittedHeight,
    scale,
  };
}

export function visibleBoardBounds(doc) {
  const frame = doc.getElementById("zagreb-board");
  if (frame && !frame.hidden) {
    const rect = frame.getBoundingClientRect(),
      points = frame.boardFootprint;
    if (Array.isArray(points) && points.length)
      return {
        left: rect.left + Math.max(0, Math.min(rect.width, Math.min(...points.map((p) => p.x)))),
        right: rect.left + Math.max(0, Math.min(rect.width, Math.max(...points.map((p) => p.x)))),
      };
    return {left:rect.left,right:rect.right};
  }
  const rect=doc.getElementById("board")?.getBoundingClientRect();
  return {left:rect?.left || 0,right:rect?.right || 0};
}
export const visibleBoardRight = doc => visibleBoardBounds(doc).right;
