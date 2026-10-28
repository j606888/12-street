import "server-only";
import { and, gte, lte } from "drizzle-orm";
import { connection } from "next/server";
import { db } from "@/lib/db";
import {
  addDays,
  closedNotice,
  NOTICE_LOOKAHEAD,
  taipeiToday,
  type DayKey,
  type DayOverrides,
} from "@/lib/shop-days";
import { shopDays } from "@/db/schema";

/** Days set on the admin calendar from `from` on (through `to` if given). */
export async function loadDayOverrides(
  from: DayKey,
  to?: DayKey,
): Promise<DayOverrides> {
  const rows = await db
    .select({ day: shopDays.day, open: shopDays.open })
    .from(shopDays)
    .where(
      and(gte(shopDays.day, from), to ? lte(shopDays.day, to) : undefined),
    );
  return Object.fromEntries(rows.map((r) => [r.day, r.open]));
}

/** The closed-day notice for today on the order page, or null. */
export async function loadClosedNotice() {
  await connection(); // "today" is per request
  const today = taipeiToday(new Date());
  const overrides = await loadDayOverrides(
    today,
    addDays(today, NOTICE_LOOKAHEAD + 1),
  );
  return closedNotice(today, overrides);
}
