import { z } from "zod";

export const ADMIN_ORDER_STATUSES = [
  "submitted",
  "printing",
  "ready",
  "picked_up",
  "cancelled",
] as const;
export const PAYMENT_STATUSES = ["unpaid", "pending_review", "paid"] as const;

const page = z.coerce.number().int().min(1).max(10_000).catch(1);
const q = z.string().trim().max(50).optional().catch(undefined);

/** Order list filters from searchParams; bad values are dropped, not errors. */
export const orderFilterInput = z.object({
  payment: z.enum(PAYMENT_STATUSES).optional().catch(undefined),
  status: z.enum(ADMIN_ORDER_STATUSES).optional().catch(undefined),
  member: z.string().max(64).optional().catch(undefined),
  q,
  page,
});
export type OrderFilter = z.output<typeof orderFilterInput>;

export const memberFilterInput = z.object({
  tag: z.coerce.number().int().positive().optional().catch(undefined),
  q,
  page,
});
export type MemberFilter = z.output<typeof memberFilterInput>;

const orderId = z.uuid();

export const orderIdInput = z.object({ orderId });
export const updateOrderStatusInput = z.object({
  orderId,
  status: z.enum(ADMIN_ORDER_STATUSES),
});
export const updatePaymentStatusInput = z.object({
  orderId,
  paymentStatus: z.enum(PAYMENT_STATUSES),
});
export const setMemberTagInput = z.object({
  userId: z.string().min(1).max(64),
  tagId: z.int().positive(),
  on: z.boolean(),
});

/** First value of a searchParams entry. */
export function firstParam(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}
