import "server-only";
import { sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { orderCounters } from "@/db/schema";
import { formatOrderNo, taipeiDayKey } from "@/lib/order-number";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/** Atomically bumps today's counter (row lock held until the transaction ends). */
export async function nextOrderNo(tx: Tx, now = new Date()): Promise<string> {
  const day = taipeiDayKey(now);
  const [row] = await tx
    .insert(orderCounters)
    .values({ day, last: 1 })
    .onConflictDoUpdate({
      target: orderCounters.day,
      set: { last: sql`${orderCounters.last} + 1` },
    })
    .returning({ last: orderCounters.last });
  return formatOrderNo(day, row.last);
}
