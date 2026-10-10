import "server-only";
import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  max,
  min,
  ne,
  or,
  sql,
  sum,
  type SQL,
} from "drizzle-orm";
import { db } from "@/lib/db";
import type { MemberFilter, OrderFilter } from "@/lib/validators/admin";
import { groupFolder, idPhotoFolder, type ZipPhoto } from "@/lib/zip-names";
import {
  memberTags,
  orderGroups,
  orders,
  photos,
  printSizes,
  products,
  user,
  userTags,
} from "@/db/schema";

export const PAGE_SIZE = 50;

export type Tag = { id: number; name: string; color: string };

export function listTags(): Promise<Tag[]> {
  return db.select().from(memberTags).orderBy(asc(memberTags.id));
}

/** Tags of each user, keyed by user id. */
export async function tagsByUser(
  userIds: string[],
): Promise<Map<string, Tag[]>> {
  const map = new Map<string, Tag[]>();
  if (!userIds.length) return map;
  const rows = await db
    .select({
      userId: userTags.userId,
      id: memberTags.id,
      name: memberTags.name,
      color: memberTags.color,
    })
    .from(userTags)
    .innerJoin(memberTags, eq(memberTags.id, userTags.tagId))
    .where(inArray(userTags.userId, userIds))
    .orderBy(asc(memberTags.id));
  for (const { userId, ...tag } of rows) {
    map.set(userId, [...(map.get(userId) ?? []), tag]);
  }
  return map;
}

/** Escapes LIKE wildcards so customer input matches literally. */
function likeTerm(q: string) {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

export async function listOrders(filter: OrderFilter) {
  const conds: (SQL | undefined)[] = [ne(orders.status, "draft")];
  if (filter.payment) conds.push(eq(orders.paymentStatus, filter.payment));
  if (filter.status) conds.push(eq(orders.status, filter.status));
  if (filter.member) conds.push(eq(orders.userId, filter.member));
  if (filter.q) {
    const term = likeTerm(filter.q);
    const digits = filter.q.replace(/[\s-]/g, "");
    conds.push(
      or(
        ilike(orders.orderNo, term),
        ilike(orders.contactName, term),
        digits ? ilike(orders.contactPhone, likeTerm(digits)) : undefined,
      ),
    );
  }
  const where = and(...conds);

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: orders.id,
        orderNo: orders.orderNo,
        status: orders.status,
        paymentStatus: orders.paymentStatus,
        paymentMethod: orders.paymentMethod,
        totalAmount: orders.totalAmount,
        submittedAt: orders.submittedAt,
        contactName: orders.contactName,
        contactPhone: orders.contactPhone,
        userId: orders.userId,
      })
      .from(orders)
      .where(where)
      .orderBy(desc(orders.submittedAt))
      .limit(PAGE_SIZE)
      .offset((filter.page - 1) * PAGE_SIZE),
    db.select({ total: count() }).from(orders).where(where),
  ]);

  const tags = await tagsByUser([
    ...new Set(rows.flatMap((r) => (r.userId ? [r.userId] : []))),
  ]);
  return {
    rows: rows.map((r) => ({
      ...r,
      tags: r.userId ? (tags.get(r.userId) ?? []) : [],
    })),
    total,
  };
}

/** Orders per status, for the admin home page. */
export async function orderCounts() {
  const [byPayment, byStatus] = await Promise.all([
    db
      .select({ key: orders.paymentStatus, n: count() })
      .from(orders)
      .where(and(ne(orders.status, "draft"), ne(orders.status, "cancelled")))
      .groupBy(orders.paymentStatus),
    db
      .select({ key: orders.status, n: count() })
      .from(orders)
      .where(ne(orders.status, "draft"))
      .groupBy(orders.status),
  ]);
  const pick = <K extends string>(rows: { key: K; n: number }[], k: K) =>
    rows.find((r) => r.key === k)?.n ?? 0;
  return {
    pendingReview: pick(byPayment, "pending_review"),
    submitted: pick(byStatus, "submitted"),
    printing: pick(byStatus, "printing"),
    ready: pick(byStatus, "ready"),
  };
}

export type AdminPhoto = {
  id: string;
  r2Key: string;
  fileName: string;
  sizeBytes: number;
  status: "pending" | "uploaded" | "deleted";
  expiresAt: Date;
  folder: string;
  quantity: ZipPhoto["quantity"];
};

/** Every photo of an order, in ZIP order: print groups, ID photos, custom. */
export async function loadOrderPhotos(orderId: string): Promise<AdminPhoto[]> {
  const [groups, rows] = await Promise.all([
    db
      .select({
        id: orderGroups.id,
        label: printSizes.label,
        laminate: orderGroups.laminate,
      })
      .from(orderGroups)
      .innerJoin(printSizes, eq(printSizes.id, orderGroups.printSizeId))
      .where(eq(orderGroups.orderId, orderId))
      .orderBy(asc(orderGroups.sortOrder), asc(orderGroups.createdAt)),
    db
      .select({
        id: photos.id,
        groupId: photos.groupId,
        kind: photos.kind,
        r2Key: photos.r2Key,
        fileName: photos.fileName,
        sizeBytes: photos.sizeBytes,
        quantity: photos.quantity,
        status: photos.status,
        expiresAt: photos.expiresAt,
        productName: products.name,
      })
      .from(photos)
      .leftJoin(products, eq(products.id, photos.productId))
      .where(eq(photos.orderId, orderId))
      .orderBy(asc(photos.createdAt), asc(photos.fileName)),
  ]);

  const view = (p: (typeof rows)[number], folder: string) => ({
    id: p.id,
    r2Key: p.r2Key,
    fileName: p.fileName,
    sizeBytes: p.sizeBytes,
    status: p.status,
    expiresAt: p.expiresAt,
    folder,
  });

  return [
    ...groups.flatMap((g, i) =>
      rows
        .filter((p) => p.kind === "print" && p.groupId === g.id)
        .map((p) => ({
          ...view(p, groupFolder(i, g.label, g.laminate)),
          quantity: { n: p.quantity, unit: "張" as const },
        })),
    ),
    ...rows
      .filter((p) => p.kind === "id_photo")
      .map((p) => ({
        ...view(p, `證件照/${idPhotoFolder(p.productName)}`),
        quantity: { n: p.quantity, unit: "組" as const },
      })),
    ...rows
      .filter((p) => p.kind === "custom")
      .map((p) => ({ ...view(p, "客製化"), quantity: undefined })),
  ];
}

export async function listMembers(filter: MemberFilter) {
  const conds: (SQL | undefined)[] = [];
  if (filter.tag) {
    conds.push(
      inArray(
        user.id,
        db
          .select({ id: userTags.userId })
          .from(userTags)
          .where(eq(userTags.tagId, filter.tag)),
      ),
    );
  }
  if (filter.q) {
    const term = likeTerm(filter.q);
    conds.push(or(ilike(user.name, term), ilike(user.phone, term)));
  }
  const where = and(...conds);

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: user.id,
        name: user.name,
        phone: user.phone,
        role: user.role,
        createdAt: user.createdAt,
        orderCount: count(orders.id),
        lastOrderAt: max(orders.submittedAt),
      })
      .from(user)
      .leftJoin(
        orders,
        and(eq(orders.userId, user.id), ne(orders.status, "draft")),
      )
      .where(where)
      .groupBy(user.id)
      .orderBy(desc(user.createdAt))
      .limit(PAGE_SIZE)
      .offset((filter.page - 1) * PAGE_SIZE),
    db.select({ total: count() }).from(user).where(where),
  ]);

  const tags = await tagsByUser(rows.map((r) => r.id));
  return {
    rows: rows.map((r) => ({ ...r, tags: tags.get(r.id) ?? [] })),
    total,
  };
}

/** Orders still holding photos in R2, soonest expiry first. */
export function listStoredPhotos() {
  return db
    .select({
      orderId: orders.id,
      orderNo: orders.orderNo,
      status: orders.status,
      contactName: orders.contactName,
      photoCount: count(photos.id),
      bytes: sum(photos.sizeBytes).mapWith(Number),
      expiresAt: min(photos.expiresAt),
    })
    .from(photos)
    .innerJoin(orders, eq(orders.id, photos.orderId))
    .where(and(ne(orders.status, "draft"), ne(photos.status, "deleted")))
    .groupBy(orders.id)
    .orderBy(sql`min(${photos.expiresAt})`);
}
