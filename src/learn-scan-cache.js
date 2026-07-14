// Learn scans are reusable only when they represent the exact work the
// learner requested or deeper. A cached 400 ms/move result must not satisfy a
// later 750 ms/move scan, but a completed 1500 ms result should always win over
// and satisfy a later 400 ms request.

function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

export function canReuseLearnScan(meta, { scanMs, positions, engineFlavor } = {}) {
  if (!meta || Number(meta.version) < 1) return false;
  const requestedMs = positiveNumber(scanMs);
  const requestedPositions = positiveNumber(positions);
  if (!requestedMs || positiveNumber(meta.movetimeMs) < requestedMs) return false;
  if (!requestedPositions || positiveNumber(meta.positions) < requestedPositions) return false;

  // Older saved records may not name an engine flavor. They remain reusable
  // when their duration and coverage match; known mismatches are rescanned.
  const savedFlavor = String(meta.engineFlavor || '').trim();
  const requestedFlavor = String(engineFlavor || '').trim();
  if (savedFlavor && requestedFlavor && savedFlavor !== requestedFlavor) return false;
  return true;
}

export function learnScanKey({ startingFen, mainlineKey, scanMs, engineFlavor } = {}) {
  return [
    String(startingFen || ''),
    String(mainlineKey || ''),
    `learn:${positiveNumber(scanMs)}ms`,
    `engine:${String(engineFlavor || 'unknown')}`,
  ].join('|');
}
