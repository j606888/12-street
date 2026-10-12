"use server";

import { randomUUID } from "node:crypto";
import { and, count, eq, inArray, isNull } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import type { z } from "zod";
import { db } from "@/lib/db";
import { sendOrderEmail } from "@/lib/email";
import {
  cookieOptions,
  DRAFT_COOKIE,
  ensureDraftId,
  findDraftId,
  getOwner,
  LAST_ORDER_COOKIE,
} from "@/lib/draft";
import { nextOrderNo } from "@/lib/orders";
import { calculateTotal } from "@/lib/pricing";
import { RETENTION_MS } from "@/lib/retention";
import {
  deleteObjects,
  headObjectSize,
  photoKey,
  presignPut,
  transferProofKey,
} from "@/lib/r2";
import {
  confirmPhotosInput,
  createGroupInput,
  groupIdInput,
  MAX_PROOF_BYTES,
  photoIdInput,
  registerPhotosInput,
  savePhotoOptionsInput,
  submitOrderInput,
  transferProofUploadInput,
  updateGroupInput,
} from "@/lib/validators/order";
import {
  orderGroups,
  orderItems,
  orders,
  photos,
  printSizes,
  products,
  user,
} from "@/db/schema";

type Result<T extends object = object> =
  ({ ok: true } & T) | { ok: false; error: string };

const NO_DRAFT = {
  ok: false,
  error: "找不到訂單草稿，請重新整理頁面",
} as const;

function parse<S extends z.ZodType>(schema: S, input: unknown) {
  const r = schema.safeParse(input);
  if (r.success) return { data: r.data as z.output<S> };
  return { error: r.error.issues[0]?.message ?? "輸入資料有誤" };
}

async function activeSizeExists(printSizeId: number) {
  const [row] = await db
    .select({ id: printSizes.id })
    .from(printSizes)
    .where(and(eq(printSizes.id, printSizeId), eq(printSizes.active, true)));
  return !!row;
}

/** Ids among `ids` that are active ID-photo sets (證件照). */
async function activeIdPhotoSets(ids: number[]) {
  if (!ids.length) return new Set<number>();
  const rows = await db
    .select({ id: products.id })
    .from(products)
    .where(
      and(
        inArray(products.id, ids),
        eq(products.category, "id_photo"),
        eq(products.active, true),
      ),
    );
  return new Set(rows.map((r) => r.id));
}

/** The group, if it belongs to the caller's draft. */
async function ownedGroup(groupId: string) {
  const draftId = await findDraftId(await getOwner());
  if (!draftId) return null;
  const [group] = await db
    .select({ id: orderGroups.id, orderId: orderGroups.orderId })
    .from(orderGroups)
    .where(and(eq(orderGroups.id, groupId), eq(orderGroups.orderId, draftId)));
  return group ?? null;
}

/** Photos among `ids` that belong to the caller's draft. */
async function ownedPhotos(ids: string[]) {
  const draftId = await findDraftId(await getOwner());
  if (!draftId) return null;
  return db
    .select()
    .from(photos)
    .where(and(inArray(photos.id, ids), eq(photos.orderId, draftId)));
}

// ---- Groups (one print size each) ----

export async function createGroup(
  input: unknown,
): Promise<Result<{ groupId: string }>> {
  const owner = await getOwner();
  const { data, error } = parse(createGroupInput, input);
  if (!data) return { ok: false, error };
  if (!(await activeSizeExists(data.printSizeId)))
    return { ok: false, error: "沒有這個尺寸" };

  const orderId = await ensureDraftId(owner);
  const [{ n }] = await db
    .select({ n: count() })
    .from(orderGroups)
    .where(eq(orderGroups.orderId, orderId));
  const [group] = await db
    .insert(orderGroups)
    .values({
      orderId,
      printSizeId: data.printSizeId,
      laminate: data.laminate,
      sortOrder: n,
    })
    .returning({ id: orderGroups.id });
  return { ok: true, groupId: group.id };
}

export async function updateGroup(input: unknown): Promise<Result> {
  const { data, error } = parse(updateGroupInput, input);
  if (!data) return { ok: false, error };
  const group = await ownedGroup(data.groupId);
  if (!group) return NO_DRAFT;
  if (
    data.printSizeId !== undefined &&
    !(await activeSizeExists(data.printSizeId))
  )
    return { ok: false, error: "沒有這個尺寸" };
  if (data.printSizeId === undefined && data.laminate === undefined)
    return { ok: true };
  await db
    .update(orderGroups)
    .set({ printSizeId: data.printSizeId, laminate: data.laminate })
    .where(eq(orderGroups.id, group.id));
  return { ok: true };
}

export async function deleteGroup(input: unknown): Promise<Result> {
  const { data, error } = parse(groupIdInput, input);
  if (!data) return { ok: false, error };
  const group = await ownedGroup(data.groupId);
  if (!group) return NO_DRAFT;
  const rows = await db
    .delete(photos)
    .where(eq(photos.groupId, group.id))
    .returning({ r2Key: photos.r2Key });
  await db.delete(orderGroups).where(eq(orderGroups.id, group.id));
  await deleteObjects(rows.map((r) => r.r2Key));
  return { ok: true };
}

// ---- Photos: browser PUTs straight to R2 with a presigned URL ----

export async function registerPhotos(
  input: unknown,
): Promise<Result<{ uploads: { photoId: string; uploadUrl: string }[] }>> {
  const owner = await getOwner();
  const { data, error } = parse(registerPhotosInput, input);
  if (!data) return { ok: false, error };

  let orderId: string;
  let groupId: string | null = null;
  let productId: number | null = null;
  if (data.kind === "print") {
    const group = await ownedGroup(data.groupId);
    if (!group) return NO_DRAFT;
    orderId = group.orderId;
    groupId = group.id;
  } else {
    if (data.kind === "id_photo") {
      if (!(await activeIdPhotoSets([data.productId])).has(data.productId))
        return { ok: false, error: "沒有這個證件照組合" };
      productId = data.productId;
    }
    orderId = await ensureDraftId(owner);
  }

  const expiresAt = new Date(Date.now() + RETENTION_MS);
  const rows = data.files.map((f) => {
    const id = randomUUID();
    return {
      id,
      orderId,
      groupId,
      productId,
      kind: data.kind,
      r2Key: photoKey(orderId, id),
      fileName: f.fileName,
      sha256: f.sha256,
      sizeBytes: f.size,
      expiresAt,
    };
  });
  await db.insert(photos).values(rows);

  const uploads = await Promise.all(
    rows.map(async (r) => ({
      photoId: r.id,
      uploadUrl: await presignPut(r.r2Key, "image/jpeg"),
    })),
  );
  return { ok: true, uploads };
}

/** Fresh upload URL for a photo that failed or whose URL expired. */
export async function getUploadUrl(
  input: unknown,
): Promise<Result<{ uploadUrl: string }>> {
  const { data, error } = parse(photoIdInput, input);
  if (!data) return { ok: false, error };
  const rows = await ownedPhotos([data.photoId]);
  const photo = rows?.[0];
  if (!photo) return NO_DRAFT;
  if (photo.status !== "pending")
    return { ok: false, error: "這張照片已上傳完成" };
  return { ok: true, uploadUrl: await presignPut(photo.r2Key, "image/jpeg") };
}

/** Marks photos uploaded only after verifying the object really is in R2 with the declared size. */
export async function confirmPhotos(
  input: unknown,
): Promise<Result<{ confirmed: string[]; failed: string[] }>> {
  const { data, error } = parse(confirmPhotosInput, input);
  if (!data) return { ok: false, error };
  const rows = await ownedPhotos(data.photoIds);
  if (!rows) return NO_DRAFT;

  const checks = await Promise.all(
    rows.map(async (p) => {
      if (p.status === "uploaded") return { id: p.id, ok: true, update: false };
      const size = await headObjectSize(p.r2Key);
      return {
        id: p.id,
        ok: size === p.sizeBytes,
        update: size === p.sizeBytes,
      };
    }),
  );
  const toUpdate = checks.filter((c) => c.update).map((c) => c.id);
  if (toUpdate.length) {
    await db
      .update(photos)
      .set({ status: "uploaded" })
      .where(and(inArray(photos.id, toUpdate), eq(photos.status, "pending")));
  }
  const confirmed = checks.filter((c) => c.ok).map((c) => c.id);
  return {
    ok: true,
    confirmed,
    failed: data.photoIds.filter((id) => !confirmed.includes(id)),
  };
}

export async function deletePhoto(input: unknown): Promise<Result> {
  const { data, error } = parse(photoIdInput, input);
  if (!data) return { ok: false, error };
  const rows = await ownedPhotos([data.photoId]);
  const photo = rows?.[0];
  if (!photo) return NO_DRAFT;
  await db.delete(photos).where(eq(photos.id, photo.id));
  await deleteObjects([photo.r2Key]);
  return { ok: true };
}

export async function savePhotoOptions(input: unknown): Promise<Result> {
  const { data, error } = parse(savePhotoOptionsInput, input);
  if (!data) return { ok: false, error };
  const draftId = await findDraftId(await getOwner());
  if (!draftId) return NO_DRAFT;
  const validSets = await activeIdPhotoSets(
    data.items.flatMap((i) => (i.productId ? [i.productId] : [])),
  );
  await db.transaction(async (tx) => {
    for (const item of data.items) {
      const owned = and(
        eq(photos.id, item.photoId),
        eq(photos.orderId, draftId),
      );
      await tx.update(photos).set({ quantity: item.quantity }).where(owned);
      if (item.productId && validSets.has(item.productId)) {
        await tx
          .update(photos)
          .set({ productId: item.productId })
          .where(and(owned, eq(photos.kind, "id_photo")));
      }
    }
  });
  return { ok: true };
}

// ---- Transfer proof (screenshot of the bank transfer) ----

export async function getTransferProofUploadUrl(
  input: unknown,
): Promise<Result<{ key: string; uploadUrl: string }>> {
  const owner = await getOwner();
  const { data, error } = parse(transferProofUploadInput, input);
  if (!data) return { ok: false, error };
  const orderId = await ensureDraftId(owner);
  const key = transferProofKey(
    orderId,
    randomUUID(),
    data.contentType === "image/png" ? "png" : "jpg",
  );
  return { ok: true, key, uploadUrl: await presignPut(key, data.contentType) };
}

// ---- Submit ----

class SubmitError extends Error {}

export async function submitOrder(input: unknown): Promise<Result> {
  const owner = await getOwner();
  const { data, error } = parse(submitOrderInput, input);
  if (!data) return { ok: false, error };
  // Members sign in with LINE; guests have no other way to be reached by email
  if (owner.kind === "guest" && !data.contactEmail)
    return { ok: false, error: "請填寫 Email" };

  const orderId = await ensureDraftId(owner);

  let proofKey: string | null = null;
  if (data.paymentMethod === "bank_transfer" && data.transferProofKey) {
    if (!data.transferProofKey.startsWith(`transfer-proofs/${orderId}/`)) {
      return { ok: false, error: "轉帳截圖無效，請重新上傳" };
    }
    const size = await headObjectSize(data.transferProofKey);
    if (size === null || size > MAX_PROOF_BYTES) {
      return { ok: false, error: "找不到轉帳截圖，請重新上傳" };
    }
    proofKey = data.transferProofKey;
  }

  try {
    await db.transaction(async (tx) => {
      const [order] = await tx
        .select({ id: orders.id, status: orders.status })
        .from(orders)
        .where(eq(orders.id, orderId))
        .for("update");
      if (order?.status !== "draft")
        throw new SubmitError("這張訂單已經送出了");

      const photoRows = await tx
        .select({
          id: photos.id,
          groupId: photos.groupId,
          kind: photos.kind,
          status: photos.status,
          quantity: photos.quantity,
          productId: photos.productId,
        })
        .from(photos)
        .where(eq(photos.orderId, orderId));
      const pending = photoRows.filter((p) => p.status === "pending").length;
      if (pending)
        throw new SubmitError(
          `還有 ${pending} 張照片沒有上傳完成，請重傳或移除`,
        );

      // Apply the quantities (and ID-photo sets) shown at checkout
      const options = new Map(data.photoOptions.map((o) => [o.photoId, o]));
      for (const p of photoRows) {
        const o = options.get(p.id);
        if (!o || p.kind === "custom") continue;
        const productId =
          p.kind === "id_photo" && o.productId ? o.productId : p.productId;
        if (o.quantity !== p.quantity || productId !== p.productId) {
          await tx
            .update(photos)
            .set({ quantity: o.quantity, productId })
            .where(eq(photos.id, p.id));
          p.quantity = o.quantity;
          p.productId = productId;
        }
      }

      // Snapshot each group's current prices; drop empty groups
      const groups = await tx
        .select({
          id: orderGroups.id,
          price: printSizes.price,
          laminate: orderGroups.laminate,
          laminationPrice: printSizes.laminationPrice,
        })
        .from(orderGroups)
        .innerJoin(printSizes, eq(printSizes.id, orderGroups.printSizeId))
        .where(eq(orderGroups.orderId, orderId));
      const pricedGroups = [];
      for (const g of groups) {
        const quantities = photoRows
          .filter(
            (p) =>
              p.kind === "print" &&
              p.groupId === g.id &&
              p.status === "uploaded",
          )
          .map((p) => p.quantity);
        if (!quantities.length) {
          await tx.delete(orderGroups).where(eq(orderGroups.id, g.id));
          continue;
        }
        const laminationUnitPrice = g.laminate ? g.laminationPrice : null;
        await tx
          .update(orderGroups)
          .set({ unitPrice: g.price, laminationUnitPrice })
          .where(eq(orderGroups.id, g.id));
        pricedGroups.push({
          unitPrice: g.price,
          laminationUnitPrice,
          quantities,
        });
      }

      // Snapshot add-on products and ID-photo sets (one line per ID photo)
      const wanted = data.items.filter((i) => i.quantity > 0);
      const idPhotos = photoRows.filter((p) => p.kind === "id_photo");
      const productIds = [
        ...new Set([
          ...wanted.map((i) => i.productId),
          ...idPhotos.flatMap((p) => (p.productId ? [p.productId] : [])),
        ]),
      ];
      const productRows = productIds.length
        ? await tx
            .select()
            .from(products)
            .where(
              and(inArray(products.id, productIds), eq(products.active, true)),
            )
        : [];
      const product = (id: number | null, category: "addon" | "id_photo") => {
        const p = productRows.find(
          (r) => r.id === id && r.category === category,
        );
        if (!p) throw new SubmitError("有商品已下架，請重新整理頁面");
        return p;
      };
      const itemRows = [
        ...wanted.map((i) => {
          const p = product(i.productId, "addon");
          return {
            orderId,
            productId: p.id,
            name: p.name,
            unitPrice: p.price,
            quantity: i.quantity,
          };
        }),
        ...idPhotos.map((photo) => {
          const p = product(photo.productId, "id_photo");
          return {
            orderId,
            productId: p.id,
            name: p.name,
            unitPrice: p.price,
            quantity: photo.quantity,
            photoId: photo.id,
          };
        }),
      ];
      await tx.delete(orderItems).where(eq(orderItems.orderId, orderId));
      if (itemRows.length) await tx.insert(orderItems).values(itemRows);

      const hasCustom =
        photoRows.some((p) => p.kind === "custom") || !!data.customNote;
      if (!pricedGroups.length && !itemRows.length && !hasCustom) {
        throw new SubmitError("請至少上傳一張照片或選擇一項商品");
      }

      const isBank = data.paymentMethod === "bank_transfer";
      await tx
        .update(orders)
        .set({
          orderNo: await nextOrderNo(tx),
          status: "submitted",
          submittedAt: new Date(),
          draftToken: null,
          contactName: data.contactName,
          contactPhone: data.contactPhone,
          contactEmail: data.contactEmail ?? null,
          note: data.note || null,
          customNote: data.customNote || null,
          paymentMethod: data.paymentMethod,
          paymentStatus: isBank ? "pending_review" : "unpaid",
          bankLast5: isBank ? (data.bankLast5 ?? null) : null,
          transferProofKey: isBank ? proofKey : null,
          totalAmount: calculateTotal({
            groups: pricedGroups,
            items: itemRows,
          }),
        })
        .where(eq(orders.id, orderId));

      // Remember the member's phone for next time
      if (owner.kind === "member") {
        await tx
          .update(user)
          .set({ phone: data.contactPhone })
          .where(and(eq(user.id, owner.userId), isNull(user.phone)));
      }
    });
  } catch (err) {
    if (err instanceof SubmitError) return { ok: false, error: err.message };
    throw err;
  }

  const jar = await cookies();
  jar.delete(DRAFT_COOKIE);
  jar.set(LAST_ORDER_COOKIE, orderId, {
    ...cookieOptions,
    maxAge: 60 * 60 * 24 * 7,
  });
  after(() => sendOrderEmail(orderId, "submitted"));
  redirect(`/order/complete?id=${orderId}`);
}
