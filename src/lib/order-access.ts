// Order ids a guest browser has unlocked via order-number + phone lookup,
// kept as a comma-separated list in an httpOnly cookie.

export const MAX_ACCESS_IDS = 10;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Valid order ids in the cookie value, most recent first. */
export function parseAccessIds(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .filter((id) => UUID_RE.test(id))
    .slice(0, MAX_ACCESS_IDS);
}

/** Cookie value with `orderId` moved to the front, oldest ids dropped. */
export function addAccessId(value: string | undefined, orderId: string) {
  const rest = parseAccessIds(value).filter((id) => id !== orderId);
  return [orderId, ...rest].slice(0, MAX_ACCESS_IDS).join(",");
}
