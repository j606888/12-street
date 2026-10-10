import "server-only";
import { and, asc, count, desc, eq, ne, sum } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { LAST_ORDER_COOKIE } from "@/lib/draft";
import { parseAccessIds } from "@/lib/order-access";
import { getSession } from "@/lib/session";
import {
  orderGroups,
  orderItems,
  orders,
  photos,
  printSizes,
} from "@/db/schema";

/** httpOnly cookie listing order ids this browser unlocked via lookup. */
export const ORDER_ACCESS_COOKIE = "order_access";

export type OrderRow = typeof orders.$inferSelect;

/**
 * A submitted order, if the viewer may see it: the member who placed it,
 * the browser that just submitted it, or a browser that passed the lookup.
 */
export async function findViewableOrder(
  orderId: string,
): Promise<OrderRow | null> {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!order || order.status === "draft") return null;

  const session = await getSession();
  if (session && order.userId === session.user.id) return order;

  const jar = await cookies();
  if (jar.get(LAST_ORDER_COOKIE)?.value === order.id) return order;
  if (parseAccessIds(jar.get(ORDER_ACCESS_COOKIE)?.value).includes(order.id))
    return order;
  return null;
}

export async function loadOrderLines(orderId: string) {
  const [groups, items, [custom]] = await Promise.all([
    db
      .select({
        id: orderGroups.id,
        label: printSizes.label,
        unitPrice: orderGroups.unitPrice,
        laminationUnitPrice: orderGroups.laminationUnitPrice,
        photoCount: count(photos.id),
        prints: sum(photos.quantity).mapWith(Number),
      })
      .from(orderGroups)
      .innerJoin(printSizes, eq(printSizes.id, orderGroups.printSizeId))
      .leftJoin(photos, eq(photos.groupId, orderGroups.id))
      .where(eq(orderGroups.orderId, orderId))
      .groupBy(orderGroups.id, printSizes.label)
      .orderBy(asc(orderGroups.sortOrder)),
    db.select().from(orderItems).where(eq(orderItems.orderId, orderId)),
    db
      .select({ n: count() })
      .from(photos)
      .where(and(eq(photos.orderId, orderId), eq(photos.kind, "custom"))),
  ]);
  return { groups, items, customPhotoCount: custom.n };
}

/** A member's submitted orders, newest first. */
export async function listMemberOrders(userId: string) {
  return db
    .select({
      id: orders.id,
      orderNo: orders.orderNo,
      status: orders.status,
      paymentStatus: orders.paymentStatus,
      totalAmount: orders.totalAmount,
      submittedAt: orders.submittedAt,
    })
    .from(orders)
    .where(and(eq(orders.userId, userId), ne(orders.status, "draft")))
    .orderBy(desc(orders.submittedAt));
}
