import { z } from "zod";
import { phoneSchema } from "./order";

export const ADMIN_ORDER_STATUSES = [
  "submitted",
  "printing",
  "ready",
  "picked_up",
  "cancelled",
] as const;
export const PAYMENT_STATUSES = ["unpaid", "pending_review", "paid"] as const;

/** Order list tabs; "todo" = new orders plus payments waiting for review. */
export const ORDER_TABS = [
  "todo",
  "printing",
  "ready",
  "picked_up",
  "cancelled",
  "all",
] as const;
export type OrderTab = (typeof ORDER_TABS)[number];

/** Photo storage page views. */
export const PHOTO_VIEWS = ["soon", "picked", "big"] as const;

const page = z.coerce.number().int().min(1).max(10_000).catch(1);
const q = z.string().trim().max(50).optional().catch(undefined);

/**
 * Order list filters from searchParams; bad values are dropped, not errors.
 * Without a tab, any search or filter looks at every order.
 */
export const orderFilterInput = z
  .object({
    tab: z.enum(ORDER_TABS).optional().catch(undefined),
    payment: z.enum(PAYMENT_STATUSES).optional().catch(undefined),
    member: z.string().max(64).optional().catch(undefined),
    q,
    page,
  })
  .transform((f) => ({
    ...f,
    tab:
      f.tab ??
      (f.q || f.member || f.payment ? ("all" as const) : ("todo" as const)),
  }));
export type OrderFilter = z.output<typeof orderFilterInput>;

export const memberFilterInput = z.object({
  tag: z.coerce.number().int().positive().optional().catch(undefined),
  q,
  page,
});
export type MemberFilter = z.output<typeof memberFilterInput>;

export const photoViewInput = z.enum(PHOTO_VIEWS).catch("soon");

const orderId = z.uuid();
const userId = z.string().min(1).max(64);

export const orderIdInput = z.object({ orderId });
export const orderPhotoInput = z.object({ orderId, photoId: z.uuid() });
export const updateOrderStatusInput = z.object({
  orderId,
  status: z.enum(ADMIN_ORDER_STATUSES),
});
export const updatePaymentStatusInput = z.object({
  orderId,
  paymentStatus: z.enum(PAYMENT_STATUSES),
});
export const addMemberTagInput = z.object({
  userId,
  name: z
    .string()
    .trim()
    .min(1, "請輸入標籤")
    .max(20, "標籤最多 20 個字")
    .regex(/^[^\r\n\t]+$/, "標籤不能換行"),
});
export const removeMemberTagInput = z.object({
  userId,
  tagId: z.int().positive(),
});

export const MEMBER_NOTE_MAX = 2000;

export const updateMemberInput = z.object({
  userId,
  name: z.string().trim().min(1, "請輸入姓名").max(50, "姓名最多 50 個字"),
  // Blank clears the phone
  phone: z.union([
    z
      .string()
      .trim()
      .length(0)
      .transform(() => null),
    phoneSchema,
  ]),
});
export const updateMemberNoteInput = z.object({
  userId,
  // Blank deletes the note
  note: z
    .string()
    .trim()
    .max(MEMBER_NOTE_MAX, `備註最多 ${MEMBER_NOTE_MAX} 個字`),
});

/** First value of a searchParams entry. */
export function firstParam(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}
