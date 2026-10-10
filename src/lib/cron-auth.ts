import { timingSafeEqual } from "node:crypto";

/**
 * Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`. Rejects everything
 * when the secret is unset or too short, so a missing env never opens the route.
 */
export function isCronAuthorized(
  header: string | null,
  secret: string | undefined,
): boolean {
  if (!header || !secret || secret.length < 16) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}
