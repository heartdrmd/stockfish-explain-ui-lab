// Server-only helpers for the paid-AI master lock.
//
// The browser never receives the password prefix or computes the password.
// It only gets an HttpOnly cookie after the server validates the submitted
// password. Keeping the date arithmetic here prevents the public client
// bundle from exposing the rotating-password scheme.

export const AI_SPEND_COOKIE = 'sf_ai_spend';
export const AI_SPEND_DAY_OFFSET = 5;

const CT = 'America/Chicago';

function centralCalendarParts(now = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: CT,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = fmt.formatToParts(now);
  return {
    year: Number(parts.find(p => p.type === 'year')?.value),
    month: Number(parts.find(p => p.type === 'month')?.value),
    day: Number(parts.find(p => p.type === 'day')?.value),
  };
}

/** Full Central-Time calendar stamp used as the daily HttpOnly cookie value. */
export function aiSpendStampCT(now = new Date()) {
  const { year, month, day } = centralCalendarParts(now);
  return [year, String(month).padStart(2, '0'), String(day).padStart(2, '0')].join('-');
}

/** Two-digit day-of-month N calendar days ahead in Central Time. */
export function aiSpendPasswordDayCT(now = new Date(), offset = AI_SPEND_DAY_OFFSET) {
  const { year, month, day } = centralCalendarParts(now);
  const shifted = new Date(Date.UTC(year, month - 1, day + offset));
  return String(shifted.getUTCDate()).padStart(2, '0');
}

export function expectedAISpendPassword(prefix, now = new Date()) {
  return String(prefix || '') + aiSpendPasswordDayCT(now);
}

export function hasCurrentAISpendCookie(cookieValue, now = new Date()) {
  return typeof cookieValue === 'string' && cookieValue === aiSpendStampCT(now);
}
