// Guest lookup throttling: too many failures for one order number in the
// window and every lookup for it answers "not found", right phone or not.

export const LOOKUP_MAX_FAILURES = 5;
export const LOOKUP_WINDOW_MS = 60 * 60 * 1000;

/** Failures at or after this time count toward the limit. */
export function lookupWindowStart(now: Date): Date {
  return new Date(now.getTime() - LOOKUP_WINDOW_MS);
}

export function isLookupThrottled(recentFailures: number): boolean {
  return recentFailures >= LOOKUP_MAX_FAILURES;
}
