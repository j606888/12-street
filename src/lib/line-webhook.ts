import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * LINE signs each webhook request body with the Messaging API channel secret
 * (HMAC-SHA256, base64) in `x-line-signature`. Rejects everything when the
 * secret is unset, so a missing env never opens the route.
 */
export function isLineSignatureValid(
  body: Buffer,
  signature: string | null,
  secret: string | undefined,
): boolean {
  if (!signature || !secret) return false;
  const expected = createHmac("sha256", secret).update(body).digest();
  const given = Buffer.from(signature, "base64");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * The order number in the message LIFF posts for the customer after an order
 * (see LiffOrderMessage), e.g. "訂單成立\n訂單編號：P20261009-0001\n…".
 */
export function parseOrderNo(text: string): string | null {
  return /訂單編號[：:]\s*(P\d{8}-\d{4,})/.exec(text)?.[1] ?? null;
}

/** The shop's reply to that message. */
export function buildOrderReceivedText(orderNo: string): string {
  return `收到訂單了！\n訂單編號：${orderNo}`;
}
