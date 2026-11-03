// Computer website only. Native Vision bundles are deliberately not updated.
// Limit parallelism, NOT engine strength or time: no duty-cycle timers,
// background pauses, reduced networks, depth caps, or search restarts.
const WASM_THREAD_CAP = 32;
const LOG_KEY = 'stockfish.cpu-guard-diagnostics.v1';
const LOG_LIMIT = 100;
const LOG_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function isComputerBrowser(nav = globalThis.navigator) {
  const ua = nav?.userAgent || '';
  if (/Mobile|Android|iPhone|iPad|iPod|visionOS|VisionPro|AtelierVision/i.test(ua)) return false;
  // iPad desktop browsing (and touch-based Apple spatial browser identities)
  // can identify as a Mac. Keep their existing resource policy.
  if (/Mac/i.test(nav?.platform || '') && nav?.maxTouchPoints > 1) return false;
  return /Macintosh|Windows NT|X11|Linux/i.test(ua);
}

export function computerThreadPolicy(hardwareConcurrency = globalThis.navigator?.hardwareConcurrency) {
  const value = Number(hardwareConcurrency);
  const cores = Number.isFinite(value) && value >= 1 ? Math.floor(value) : 4;
  const max = Math.max(1, Math.min(WASM_THREAD_CAP, cores - 2, Math.floor(cores * 0.75)));
  return { cores, default: Math.max(1, Math.min(max, Math.floor(cores / 2))), max };
}

export function clampComputerThreads(value, policy = computerThreadPolicy()) {
  const requested = Number(value);
  return Number.isFinite(requested)
    ? Math.max(1, Math.min(policy.max, Math.floor(requested)))
    : policy.default;
}

export function readCpuGuardDiagnostics() {
  try {
    const rows = JSON.parse(globalThis.localStorage?.getItem(LOG_KEY) || '[]');
    return Array.isArray(rows)
      ? rows.filter(row => row && Date.parse(row.at) > Date.now() - LOG_AGE_MS).slice(-LOG_LIMIT)
      : [];
  } catch { return []; }
}

// Private, bounded diagnostics, also included in the existing Download Log.
// No position, account, credential, or raw user-supplied string is stored.
export function recordCpuThreadLimit({ id, requested, applied, policy }) {
  const entry = {
    at: new Date().toISOString(), id, stage: 'threads-applied',
    requested: Number.isFinite(Number(requested)) ? Number(requested) : null,
    applied, cores: policy.cores, max: policy.max,
    continuous: true,
  };
  try {
    globalThis.localStorage?.setItem(LOG_KEY, JSON.stringify([...readCpuGuardDiagnostics(), entry].slice(-LOG_LIMIT)));
  } catch { /* Private browsing / full storage must not stop chess. */ }
  console.info('[cpu-guard]', entry);
}
