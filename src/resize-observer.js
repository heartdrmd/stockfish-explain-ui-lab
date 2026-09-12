// ResizeObserver runs during layout. Defer layout writes until the next frame,
// and coalesce multiple observations from the board, gauge and toolbar.
export function frameUpdate(update, request = requestAnimationFrame, cancel = cancelAnimationFrame) {
  let frame = null;
  const schedule = () => {
    if (frame != null) return;
    frame = request(() => { frame = null; update(); });
  };
  schedule.cancel = () => {
    if (frame != null) cancel(frame);
    frame = null;
  };
  return schedule;
}

export function isResizeObserverNotification(event) {
  // Only the browser's specific delivery notification is nonfatal. Real thrown
  // exceptions (including one with similar text) still use the error banner.
  return event.error == null && !event.lineno && !event.colno &&
    ['ResizeObserver loop completed with undelivered notifications.',
      'ResizeObserver loop limit exceeded'].includes(event.message);
}
