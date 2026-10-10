"use server";

import { and, eq, ne } from "drizzle-orm";
import { refresh } from "next/cache";
import type { z } from "zod";
import { loadOrderPhotos } from "@/lib/admin";
import { db } from "@/lib/db";
import { purgePhotoRows } from "@/lib/cleanup";
import { presignGet } from "@/lib/r2";
import { getAdmin } from "@/lib/session";
import {
  orderIdInput,
  setMemberTagInput,
  updateOrderStatusInput,
  updatePaymentStatusInput,
} from "@/lib/validators/admin";
import { zipEntryNames } from "@/lib/zip-names";
import { orders, photos, userTags } from "@/db/schema";

type Result<T extends object = object> =
  ({ ok: true } & T) | { ok: false; error: string };

const FORBIDDEN = { ok: false, error: "沒有權限，請重新登入" } as const;
const NO_ORDER = { ok: false, error: "找不到訂單" } as const;

function parse<S extends z.ZodType>(schema: S, input: unknown) {
  const r = schema.safeParse(input);
  if (r.success) return { data: r.data as z.output<S> };
  return { error: r.error.issues[0]?.message ?? "輸入資料有誤" };
}

const submitted = (orderId: string) =>
  and(eq(orders.id, orderId), ne(orders.status, "draft"));

export async function updateOrderStatus(input: unknown): Promise<Result> {
  if (!(await getAdmin())) return FORBIDDEN;
  const { data, error } = parse(updateOrderStatusInput, input);
  if (!data) return { ok: false, error };

  const updated = await db
    .update(orders)
    .set({ status: data.status })
    .where(submitted(data.orderId))
    .returning({ id: orders.id });
  if (!updated.length) return NO_ORDER;
  refresh();
  return { ok: true };
}

export async function updatePaymentStatus(input: unknown): Promise<Result> {
  if (!(await getAdmin())) return FORBIDDEN;
  const { data, error } = parse(updatePaymentStatusInput, input);
  if (!data) return { ok: false, error };

  const updated = await db
    .update(orders)
    .set({
      paymentStatus: data.paymentStatus,
      paidAt: data.paymentStatus === "paid" ? new Date() : null,
    })
    .where(submitted(data.orderId))
    .returning({ id: orders.id });
  if (!updated.length) return NO_ORDER;
  refresh();
  return { ok: true };
}

/** Presigned GETs for every uploaded photo, named for the ZIP. */
export async function getZipFiles(
  input: unknown,
): Promise<Result<{ files: { name: string; url: string }[] }>> {
  if (!(await getAdmin())) return FORBIDDEN;
  const { data, error } = parse(orderIdInput, input);
  if (!data) return { ok: false, error };

  const [order] = await db
    .select({ id: orders.id })
    .from(orders)
    .where(submitted(data.orderId));
  if (!order) return NO_ORDER;

  const list = (await loadOrderPhotos(order.id)).filter(
    (p) => p.status === "uploaded",
  );
  if (!list.length) return { ok: false, error: "這筆訂單沒有可下載的照片" };
  const names = zipEntryNames(list);
  const files = await Promise.all(
    list.map(async (p, i) => ({
      name: names[i],
      url: await presignGet(p.r2Key),
    })),
  );
  return { ok: true, files };
}

/** Removes the order's photos from R2 ahead of the monthly cleanup. */
export async function deleteOrderPhotos(
  input: unknown,
): Promise<Result<{ deleted: number }>> {
  if (!(await getAdmin())) return FORBIDDEN;
  const { data, error } = parse(orderIdInput, input);
  if (!data) return { ok: false, error };

  const [order] = await db
    .select({ id: orders.id })
    .from(orders)
    .where(submitted(data.orderId));
  if (!order) return NO_ORDER;

  const rows = await db
    .select({ id: photos.id, r2Key: photos.r2Key })
    .from(photos)
    .where(and(eq(photos.orderId, order.id), ne(photos.status, "deleted")));
  if (!rows.length) return { ok: true, deleted: 0 };

  const deleted = await purgePhotoRows(rows);
  refresh();
  if (deleted < rows.length) {
    return {
      ok: false,
      error: `有 ${rows.length - deleted} 張刪除失敗，請再試一次`,
    };
  }
  return { ok: true, deleted };
}

export async function setMemberTag(input: unknown): Promise<Result> {
  if (!(await getAdmin())) return FORBIDDEN;
  const { data, error } = parse(setMemberTagInput, input);
  if (!data) return { ok: false, error };

  try {
    if (data.on) {
      await db
        .insert(userTags)
        .values({ userId: data.userId, tagId: data.tagId })
        .onConflictDoNothing();
    } else {
      await db
        .delete(userTags)
        .where(
          and(eq(userTags.userId, data.userId), eq(userTags.tagId, data.tagId)),
        );
    }
  } catch (err) {
    // Unknown user or tag id (foreign key violation)
    const e = err as { code?: string; cause?: { code?: string } };
    if ((e.cause?.code ?? e.code) === "23503") {
      return { ok: false, error: "找不到會員或標籤" };
    }
    throw err;
  }
  refresh();
  return { ok: true };
}
