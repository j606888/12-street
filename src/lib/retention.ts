// How long uploaded files and lookup throttling records are kept.

const DAY_MS = 24 * 60 * 60 * 1000;

/** Photos, transfer proofs and abandoned drafts: 30 days. */
export const RETENTION_DAYS = 30;
export const RETENTION_MS = RETENTION_DAYS * DAY_MS;

/** lookup_failures only matter for the 1-hour throttle window. */
export const LOOKUP_FAILURE_TTL_MS = DAY_MS;

/** Records older than this (created at or before it) are due for cleanup. */
export function cutoff(now: Date, ageMs: number): Date {
  return new Date(now.getTime() - ageMs);
}

/** True once `at` is older than the 30-day retention window. */
export function isPastRetention(at: Date): boolean {
  return at.getTime() < Date.now() - RETENTION_MS;
}
