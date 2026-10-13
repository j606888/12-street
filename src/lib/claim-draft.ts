import "server-only";
import { and, asc, desc, eq, inArray, isNull, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { orderGroups, orders, photos } from "@/db/schema";

/**
 * Hands a guest's draft to the member who just signed in, so photos picked
 * before signing in aren't lost. If the member already has a draft, the
 * guest's groups and photos are merged into it (same print size → same group,
 * same photo in the same place → skipped).
 */
export async function claimGuestDraft(userId: string, draftToken: string) {
  await db.transaction(async (tx) => {
    const [guest] = await tx
      .select({ id: orders.id })
      .from(orders)
      .where(
        and(
          eq(orders.draftToken, draftToken),
          isNull(orders.userId),
          eq(orders.status, "draft"),
        ),
      )
      .limit(1)
      .for("update");
    if (!guest) return;

    const [member] = await tx
      .select({ id: orders.id })
      .from(orders)
      .where(and(eq(orders.userId, userId), eq(orders.status, "draft")))
      .orderBy(desc(orders.createdAt))
      .limit(1)
      .for("update");

    if (!member) {
      await tx
        .update(orders)
        .set({ userId, draftToken: null })
        .where(eq(orders.id, guest.id));
      return;
    }

    // One connection per transaction, so these run one after another
    const memberGroups = await tx
      .select({ id: orderGroups.id, printSizeId: orderGroups.printSizeId })
      .from(orderGroups)
      .where(eq(orderGroups.orderId, member.id));
    const guestGroups = await tx
      .select({ id: orderGroups.id, printSizeId: orderGroups.printSizeId })
      .from(orderGroups)
      .where(eq(orderGroups.orderId, guest.id))
      .orderBy(asc(orderGroups.sortOrder), asc(orderGroups.createdAt));
    const memberPhotos = await tx
      .select({
        groupId: photos.groupId,
        kind: photos.kind,
        sha256: photos.sha256,
      })
      .from(photos)
      .where(and(eq(photos.orderId, member.id), ne(photos.status, "deleted")));
    const guestPhotos = await tx
      .select({
        id: photos.id,
        groupId: photos.groupId,
        kind: photos.kind,
        sha256: photos.sha256,
      })
      .from(photos)
      .where(and(eq(photos.orderId, guest.id), ne(photos.status, "deleted")));

    // Guest group id → the member group it lands in
    const groupMap = new Map<string, string>();
    let sortOrder = memberGroups.length;
    for (const g of guestGroups) {
      const existing = memberGroups.find(
        (m) => m.printSizeId === g.printSizeId,
      );
      if (existing) {
        groupMap.set(g.id, existing.id);
      } else {
        await tx
          .update(orderGroups)
          .set({ orderId: member.id, sortOrder: sortOrder++ })
          .where(eq(orderGroups.id, g.id));
        groupMap.set(g.id, g.id);
      }
    }

    const slot = (kind: string, groupId: string | null, sha256: string) =>
      `${kind}:${groupId ?? ""}:${sha256}`;
    const taken = new Set(
      memberPhotos.map((p) => slot(p.kind, p.groupId, p.sha256)),
    );
    for (const p of guestPhotos) {
      const groupId = p.groupId ? (groupMap.get(p.groupId) ?? null) : null;
      const key = slot(p.kind, groupId, p.sha256);
      // Duplicates stay on the guest draft; the cleanup cron removes them
      if (taken.has(key)) continue;
      taken.add(key);
      await tx
        .update(photos)
        .set({ orderId: member.id, groupId })
        .where(eq(photos.id, p.id));
    }

    // Leftover guest groups were merged into existing member groups
    const merged = guestGroups
      .filter((g) => groupMap.get(g.id) !== g.id)
      .map((g) => g.id);
    if (merged.length) {
      await tx
        .update(photos)
        .set({ groupId: null })
        .where(inArray(photos.groupId, merged));
      await tx.delete(orderGroups).where(inArray(orderGroups.id, merged));
    }
    await tx
      .update(orders)
      .set({ draftToken: null })
      .where(eq(orders.id, guest.id));
  });
}
