"use server";

import { and, eq, ne } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { cookieOptions } from "@/lib/draft";
import { addAccessId } from "@/lib/order-access";
import { ORDER_ACCESS_COOKIE } from "@/lib/order-view";
import { lookupOrderInput, phoneSchema } from "@/lib/validators/order";
import { orders } from "@/db/schema";

export type LookupState = { error?: string; orderNo?: string; phone?: string };

// Same message whether the number or the phone is wrong
const NOT_FOUND = "查無訂單，請確認訂單編號和手機";

/** Guest lookup: unlocks the order for this browser when number + phone match. */
export async function lookupOrder(
  _prev: LookupState,
  formData: FormData,
): Promise<LookupState> {
  const raw = {
    orderNo: String(formData.get("orderNo") ?? ""),
    phone: String(formData.get("phone") ?? ""),
  };
  const echo = { orderNo: raw.orderNo, phone: raw.phone };

  const parsed = lookupOrderInput.safeParse(raw);
  if (!parsed.success) {
    // A malformed phone is a typing mistake worth pointing out; anything else
    // gets the generic message.
    const phone = phoneSchema.safeParse(raw.phone);
    const error = phone.success
      ? NOT_FOUND
      : (phone.error.issues[0]?.message ?? NOT_FOUND);
    return { ...echo, error };
  }

  const [order] = await db
    .select({ id: orders.id })
    .from(orders)
    .where(
      and(
        eq(orders.orderNo, parsed.data.orderNo),
        eq(orders.contactPhone, parsed.data.phone),
        ne(orders.status, "draft"),
      ),
    )
    .limit(1);
  if (!order) return { ...echo, error: NOT_FOUND };

  const jar = await cookies();
  jar.set(
    ORDER_ACCESS_COOKIE,
    addAccessId(jar.get(ORDER_ACCESS_COOKIE)?.value, order.id),
    cookieOptions,
  );
  redirect(`/orders/${order.id}`);
}
