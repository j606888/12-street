import "server-only";
import {
  and,
  asc,
  eq,
  inArray,
  isNotNull,
  lt,
  lte,
  ne,
  notExists,
} from "drizzle-orm";
import { db } from "@/lib/db";
import { deleteObjects, listKeys } from "@/lib/r2";
import { cutoff, LOOKUP_FAILURE_TTL_MS, RETENTION_MS } from "@/lib/retention";
import { lookupFailures, orders, photos } from "@/db/schema";

const BATCH = 500;

/**
 * Deletes the photos' R2 objects, then marks the rows deleted. Rows whose
 * object R2 failed to delete stay as they are, so the next run retries them.
 */
export async function purgePhotoRows(
  rows: { id: string; r2Key: string }[],
): Promise<number> {
  if (!rows.length) return 0;
  const failed = new Set(await deleteObjects(rows.map((r) => r.r2Key)));
  const done = rows.filter((r) => !failed.has(r.r2Key)).map((r) => r.id);
  if (done.length) {
    await db
      .update(photos)
      .set({ status: "deleted", deletedAt: new Date() })
      .where(inArray(photos.id, done));
  }
  return done.length;
}

/** Photos past expiresAt, in batches until done or out of time. */
async function purgeExpiredPhotos(now: Date, deadline: number) {
  let deleted = 0;
  while (Date.now() < deadline) {
    const rows = await db
      .select({ id: photos.id, r2Key: photos.r2Key })
      .from(photos)
      .where(and(ne(photos.status, "deleted"), lte(photos.expiresAt, now)))
      .orderBy(asc(photos.expiresAt))
      .limit(BATCH);
    const n = await purgePhotoRows(rows);
    deleted += n;
    // Stop on a short batch, or when nothing could be deleted (avoid spinning)
    if (rows.length < BATCH || n === 0) break;
  }
  return deleted;
}

/**
 * Transfer proofs of orders submitted RETENTION_DAYS ago: everything under the
 * order's transfer-proofs/ prefix, including screenshots replaced before submit.
 */
async function purgeTransferProofs(now: Date, deadline: number) {
  const due = await db
    .select({ id: orders.id })
    .from(orders)
    .where(
      and(
        ne(orders.status, "draft"),
        isNotNull(orders.transferProofKey),
        lte(orders.submittedAt, cutoff(now, RETENTION_MS)),
      ),
    )
    .limit(BATCH);

  let deleted = 0;
  for (const { id } of due) {
    if (Date.now() >= deadline) break;
    const keys = await listKeys(`transfer-proofs/${id}/`);
    const failed = await deleteObjects(keys);
    if (failed.length) continue;
    await db
      .update(orders)
      .set({ transferProofKey: null })
      .where(eq(orders.id, id));
    deleted++;
  }
  return deleted;
}

/**
 * Drafts created RETENTION_DAYS ago whose photos are all gone: removes any
 * leftover R2 objects (e.g. proofs uploaded but never submitted), then the row.
 */
async function purgeAbandonedDrafts(now: Date, deadline: number) {
  const due = await db
    .select({ id: orders.id })
    .from(orders)
    .where(
      and(
        eq(orders.status, "draft"),
        lte(orders.createdAt, cutoff(now, RETENTION_MS)),
        notExists(
          db
            .select({ id: photos.id })
            .from(photos)
            .where(
              and(eq(photos.orderId, orders.id), ne(photos.status, "deleted")),
            ),
        ),
      ),
    )
    .limit(BATCH);

  let deleted = 0;
  for (const { id } of due) {
    if (Date.now() >= deadline) break;
    const keys = [
      ...(await listKeys(`photos/${id}/`)),
      ...(await listKeys(`transfer-proofs/${id}/`)),
    ];
    const failed = await deleteObjects(keys);
    if (failed.length) continue;
    await db
      .delete(orders)
      .where(and(eq(orders.id, id), eq(orders.status, "draft")));
    deleted++;
  }
  return deleted;
}

async function purgeLookupFailures(now: Date) {
  const rows = await db
    .delete(lookupFailures)
    .where(lt(lookupFailures.createdAt, cutoff(now, LOOKUP_FAILURE_TTL_MS)))
    .returning({ id: lookupFailures.id });
  return rows.length;
}

export type CleanupResult = {
  photos: number;
  transferProofs: number;
  drafts: number;
  lookupFailures: number;
};

/** Daily cleanup run by /api/cron/cleanup. `budgetMs` caps the R2 work. */
export async function runCleanup(
  now: Date,
  budgetMs = 240_000,
): Promise<CleanupResult> {
  const deadline = Date.now() + budgetMs;
  // Photos first: drafts only qualify once their photos are gone
  const photoCount = await purgeExpiredPhotos(now, deadline);
  const transferProofs = await purgeTransferProofs(now, deadline);
  const drafts = await purgeAbandonedDrafts(now, deadline);
  const lookups = await purgeLookupFailures(now);
  return {
    photos: photoCount,
    transferProofs,
    drafts,
    lookupFailures: lookups,
  };
}
