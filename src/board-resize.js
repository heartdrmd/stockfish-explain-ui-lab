// The workspace decides whether the corner resizes its 2D square or 3D column.
export function installBoardResizeHandle({ handle, boardElement, workspaceSplit, onStart, onResize, onFinish,
  request = requestAnimationFrame, cancel = cancelAnimationFrame, blurTarget = window }) {
  let drag = null, frame = null, pendingWidth = null;
  function flush() {
    if (frame != null) { cancel(frame); frame = null; }
    if (pendingWidth != null) {
      const width = pendingWidth;
      pendingWidth = null;
      onResize(width);
    }
  }
  function finish(event) {
    if (!drag || (event?.pointerId != null && event.pointerId !== drag.id)) return;
    flush();
    const completed = drag;
    drag = null;
    if (handle.hasPointerCapture(completed.id)) handle.releasePointerCapture(completed.id);
    onFinish(completed.moved);
  }
  handle.addEventListener('pointerdown', event => {
    if (event.button !== 0 || drag) return;
    event.preventDefault(); event.stopPropagation();
    const sizingElement = workspaceSplit?.isActive() ? boardElement.parentElement : boardElement;
    const width = workspaceSplit?.isActive() && workspaceSplit.getCornerSize
      ? workspaceSplit.getCornerSize() : sizingElement.getBoundingClientRect().width;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY,
      width, moved: false };
    onStart();
    handle.setPointerCapture(event.pointerId);
  });
  handle.addEventListener('pointermove', event => {
    if (event.pointerId !== drag?.id) return;
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
    // A click or a little pointer jitter must not resize or replace a preference.
    if (!drag.moved && Math.max(Math.abs(dx), Math.abs(dy)) <= 2) return;
    drag.moved = true;
    pendingWidth = drag.width + (dx + dy) / 2;
    if (frame == null) frame = request(() => { frame = null; flush(); });
  });
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) handle.addEventListener(name, finish);
  blurTarget.addEventListener('blur', () => finish());
}
