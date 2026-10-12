"use server";

import { and, eq, ne, notExists, sql } from "drizzle-orm";
import { refresh } from "next/cache";
import { after } from "next/server";
import type { z } from "zod";
import { loadOrderPhotos } from "@/lib/admin";
import { db } from "@/lib/db";
import { sendOrderEmail } from "@/lib/email";
import { purgePhotoRows } from "@/lib/cleanup";
import { presignGet } from "@/lib/r2";
import { getAdmin } from "@/lib/session";
import {
  addMemberTagInput,
  orderIdInput,
  removeMemberTagInput,
  updateMemberInput,
  updateMemberNoteInput,
  updateOrderStatusInput,
  updatePaymentStatusInput,
} from "@/lib/validators/admin";
import { zipEntryNames } from "@/lib/zip-names";
import {
  memberNotes,
  memberTags,
  orders,
  photos,
  user,
  userTags,
} from "@/db/schema";

type Result<T extends object = object> =
  ({ ok: true } & T) | { ok: false; error: string };

const FORBIDDEN = { ok: false, error: "沒有權限，請重新登入" } as const;
const NO_ORDER = { ok: false, error: "找不到訂單" } as const;
const NO_MEMBER = { ok: false, error: "找不到會員" } as const;

/** Postgres foreign-key violation, e.g. a user id that no longer exists. */
function isForeignKeyError(err: unknown) {
  const e = err as { code?: string; cause?: { code?: string } };
  return (e.cause?.code ?? e.code) === "23503";
}

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

  const previous = await db.transaction(async (tx) => {
    const [order] = await tx
      .select({ status: orders.status })
      .from(orders)
      .where(submitted(data.orderId))
      .for("update");
    if (!order) return null;
    await tx
      .update(orders)
      .set({ status: data.status })
      .where(eq(orders.id, data.orderId));
    return order.status;
  });
  if (!previous) return NO_ORDER;
  // Only tell the customer when the order actually moved to that status
  const { status } = data;
  if (previous !== status && (status === "ready" || status === "cancelled"))
    after(() => sendOrderEmail(data.orderId, status));
  refresh();
  return { ok: true };
}

export async function updatePaymentStatus(input: unknown): Promise<Result> {
  if (!(await getAdmin())) return FORBIDDEN;
  const { data, error } = parse(updatePaymentStatusInput, input);
  if (!data) return { ok: false, error };

  const previous = await db.transaction(async (tx) => {
    const [order] = await tx
      .select({ paymentStatus: orders.paymentStatus })
      .from(orders)
      .where(submitted(data.orderId))
      .for("update");
    if (!order) return null;
    await tx
      .update(orders)
      .set({
        paymentStatus: data.paymentStatus,
        paidAt: data.paymentStatus === "paid" ? new Date() : null,
      })
      .where(eq(orders.id, data.orderId));
    return order.paymentStatus;
  });
  if (!previous) return NO_ORDER;
  // A reviewed transfer is worth confirming; cash paid at the counter is not
  if (previous === "pending_review" && data.paymentStatus === "paid")
    after(() => sendOrderEmail(data.orderId, "paid"));
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

/** Tags a member; a new name creates the tag, an existing one is reused. */
export async function addMemberTag(
  input: unknown,
): Promise<Result<{ tag: { id: number; name: string } }>> {
  if (!(await getAdmin())) return FORBIDDEN;
  const { data, error } = parse(addMemberTagInput, input);
  if (!data) return { ok: false, error };

  try {
    const tag = await db.transaction(async (tx) => {
      // The no-op update makes RETURNING give back an existing tag's id too
      const [tag] = await tx
        .insert(memberTags)
        .values({ name: data.name })
        .onConflictDoUpdate({
          target: memberTags.name,
          set: { name: data.name },
        })
        .returning({ id: memberTags.id, name: memberTags.name });
      await tx
        .insert(userTags)
        .values({ userId: data.userId, tagId: tag.id })
        .onConflictDoNothing();
      return tag;
    });
    refresh();
    return { ok: true, tag };
  } catch (err) {
    // Unknown user id, or the tag was dropped by a concurrent removal
    if (isForeignKeyError(err)) {
      return { ok: false, error: "儲存失敗，請重新整理後再試一次" };
    }
    throw err;
  }
}

/** Untags a member, and drops the tag once nobody has it. */
export async function removeMemberTag(input: unknown): Promise<Result> {
  if (!(await getAdmin())) return FORBIDDEN;
  const { data, error } = parse(removeMemberTagInput, input);
  if (!data) return { ok: false, error };

  await db.transaction(async (tx) => {
    await tx
      .delete(userTags)
      .where(
        and(eq(userTags.userId, data.userId), eq(userTags.tagId, data.tagId)),
      );
    await tx.delete(memberTags).where(
      and(
        eq(memberTags.id, data.tagId),
        notExists(
          tx
            .select({ one: sql`1` })
            .from(userTags)
            .where(eq(userTags.tagId, data.tagId)),
        ),
      ),
    );
  });
  refresh();
  return { ok: true };
}

export async function updateMember(input: unknown): Promise<Result> {
  if (!(await getAdmin())) return FORBIDDEN;
  const { data, error } = parse(updateMemberInput, input);
  if (!data) return { ok: false, error };

  const updated = await db
    .update(user)
    .set({ name: data.name, phone: data.phone })
    .where(eq(user.id, data.userId))
    .returning({ id: user.id });
  if (!updated.length) return NO_MEMBER;
  refresh();
  return { ok: true };
}

/** Saves the shop's note on a member; a blank note deletes it. */
export async function updateMemberNote(
  input: unknown,
): Promise<Result<{ updatedAt: Date | null }>> {
  if (!(await getAdmin())) return FORBIDDEN;
  const { data, error } = parse(updateMemberNoteInput, input);
  if (!data) return { ok: false, error };

  if (!data.note) {
    await db.delete(memberNotes).where(eq(memberNotes.userId, data.userId));
    refresh();
    return { ok: true, updatedAt: null };
  }
  try {
    const [row] = await db
      .insert(memberNotes)
      .values({ userId: data.userId, note: data.note })
      .onConflictDoUpdate({
        target: memberNotes.userId,
        set: { note: data.note, updatedAt: new Date() },
      })
      .returning({ updatedAt: memberNotes.updatedAt });
    refresh();
    return { ok: true, updatedAt: row.updatedAt };
  } catch (err) {
    if (isForeignKeyError(err)) return NO_MEMBER;
    throw err;
  }
}
