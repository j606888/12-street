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
import type {
  MemberFilter,
  OrderFilter,
  OrderTab,
} from "@/lib/validators/admin";
import { groupFolder, idPhotoFolder, type ZipPhoto } from "@/lib/zip-names";
import {
  memberNotes,
  memberTags,
  orderGroups,
  orderItems,
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
  return db.select().from(memberTags).orderBy(asc(memberTags.name));
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
    .orderBy(asc(userTags.createdAt));
  for (const { userId, ...tag } of rows) {
    map.set(userId, [...(map.get(userId) ?? []), tag]);
  }
  return map;
}

/** Escapes LIKE wildcards so customer input matches literally. */
function likeTerm(q: string) {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/** Which orders each tab of the order list shows. */
function tabCondition(tab: OrderTab): SQL | undefined {
  switch (tab) {
    case "todo":
      return and(
        ne(orders.status, "cancelled"),
        or(
          eq(orders.status, "submitted"),
          eq(orders.paymentStatus, "pending_review"),
        ),
      );
    case "all":
      return undefined;
    default:
      return eq(orders.status, tab);
  }
}

/** Short line items per order: "4×6 ×36・護貝、證件照 大頭兩吋 ×2 組". */
async function orderSummaries(orderIds: string[]) {
  const map = new Map<string, string[]>();
  if (!orderIds.length) return new Map<string, string>();
  const [groups, items, custom] = await Promise.all([
    db
      .select({
        orderId: orderGroups.orderId,
        label: printSizes.label,
        prints: sum(photos.quantity).mapWith(Number),
        laminated: sum(photos.laminateQuantity).mapWith(Number),
      })
      .from(orderGroups)
      .innerJoin(printSizes, eq(printSizes.id, orderGroups.printSizeId))
      .leftJoin(photos, eq(photos.groupId, orderGroups.id))
      .where(inArray(orderGroups.orderId, orderIds))
      .groupBy(orderGroups.id, printSizes.id)
      .orderBy(asc(orderGroups.sortOrder), asc(orderGroups.createdAt)),
    db
      .select({
        orderId: orderItems.orderId,
        name: orderItems.name,
        quantity: orderItems.quantity,
        isIdPhoto: sql<boolean>`${orderItems.photoId} is not null`,
      })
      .from(orderItems)
      .where(inArray(orderItems.orderId, orderIds)),
    db
      .select({ orderId: photos.orderId, n: count() })
      .from(photos)
      .where(and(inArray(photos.orderId, orderIds), eq(photos.kind, "custom")))
      .groupBy(photos.orderId),
  ]);
  const add = (id: string, part: string) =>
    map.set(id, [...(map.get(id) ?? []), part]);
  for (const g of groups) {
    add(
      g.orderId,
      `${g.label} ×${g.prints ?? 0}${g.laminated ? `・護貝 ${g.laminated}` : ""}`,
    );
  }
  for (const i of items) {
    add(i.orderId, `${i.name} ×${i.quantity}${i.isIdPhoto ? " 組" : ""}`);
  }
  for (const c of custom) add(c.orderId, `客製化 ${c.n} 張`);
  return new Map([...map].map(([id, parts]) => [id, parts.join("、")]));
}

const orderListColumns = {
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
};

export async function listOrders(filter: OrderFilter) {
  const conds: (SQL | undefined)[] = [
    ne(orders.status, "draft"),
    tabCondition(filter.tab),
  ];
  if (filter.payment) conds.push(eq(orders.paymentStatus, filter.payment));
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
      .select(orderListColumns)
      .from(orders)
      .where(where)
      .orderBy(desc(orders.submittedAt))
      .limit(PAGE_SIZE)
      .offset((filter.page - 1) * PAGE_SIZE),
    db.select({ total: count() }).from(orders).where(where),
  ]);

  const [tags, summaries] = await Promise.all([
    tagsByUser([...new Set(rows.flatMap((r) => (r.userId ? [r.userId] : [])))]),
    orderSummaries(rows.map((r) => r.id)),
  ]);
  return {
    rows: rows.map((r) => ({
      ...r,
      tags: r.userId ? (tags.get(r.userId) ?? []) : [],
      summary: summaries.get(r.id) ?? "",
    })),
    total,
  };
}

/** Orders per tab of the order list, plus the payments waiting for review. */
export async function orderCounts(): Promise<
  Record<OrderTab | "pendingReview" | "submitted", number>
> {
  const n = (cond: SQL | undefined) =>
    sql<number>`count(*) filter (where ${cond ?? sql`true`})`.mapWith(Number);
  const [row] = await db
    .select({
      todo: n(tabCondition("todo")),
      printing: n(tabCondition("printing")),
      ready: n(tabCondition("ready")),
      picked_up: n(tabCondition("picked_up")),
      cancelled: n(tabCondition("cancelled")),
      all: count(),
      submitted: n(eq(orders.status, "submitted")),
      pendingReview: n(
        and(
          ne(orders.status, "cancelled"),
          eq(orders.paymentStatus, "pending_review"),
        ),
      ),
    })
    .from(orders)
    .where(ne(orders.status, "draft"));
  return row;
}

/** Bank transfer / LINE MONEY payments the shop still has to check. */
export function pendingPayments() {
  return db
    .select({
      ...orderListColumns,
      bankLast5: orders.bankLast5,
      transferProofKey: orders.transferProofKey,
    })
    .from(orders)
    .where(
      and(
        ne(orders.status, "draft"),
        ne(orders.status, "cancelled"),
        eq(orders.paymentStatus, "pending_review"),
      ),
    )
    .orderBy(asc(orders.submittedAt))
    .limit(20);
}

/** Newest submitted orders that haven't gone to print yet. */
export async function newOrders(limit: number) {
  const rows = await db
    .select(orderListColumns)
    .from(orders)
    .where(eq(orders.status, "submitted"))
    .orderBy(desc(orders.submittedAt))
    .limit(limit);
  const summaries = await orderSummaries(rows.map((r) => r.id));
  return rows.map((r) => ({ ...r, summary: summaries.get(r.id) ?? "" }));
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
        laminateQuantity: photos.laminateQuantity,
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
          ...view(p, groupFolder(i, g.label)),
          quantity: {
            n: p.quantity,
            unit: "張" as const,
            laminated: p.laminateQuantity,
          },
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

export async function memberName(userId: string): Promise<string | null> {
  const [row] = await db
    .select({ name: user.name })
    .from(user)
    .where(eq(user.id, userId));
  return row?.name ?? null;
}

/** Joins each member to their non-draft orders, for counts and last-order time. */
const memberOrderJoin = and(
  eq(orders.userId, user.id),
  ne(orders.status, "draft"),
);

export async function getMember(userId: string) {
  const [row] = await db
    .select({
      id: user.id,
      name: user.name,
      phone: user.phone,
      role: user.role,
      createdAt: user.createdAt,
      orderCount: count(orders.id),
      lastOrderAt: max(orders.submittedAt),
      note: memberNotes.note,
      noteUpdatedAt: memberNotes.updatedAt,
    })
    .from(user)
    .leftJoin(orders, memberOrderJoin)
    .leftJoin(memberNotes, eq(memberNotes.userId, user.id))
    .where(eq(user.id, userId))
    .groupBy(user.id, memberNotes.userId);
  if (!row) return null;
  const tags = await tagsByUser([row.id]);
  return { ...row, tags: tags.get(row.id) ?? [] };
}

export async function memberNote(userId: string): Promise<string | null> {
  const [row] = await db
    .select({ note: memberNotes.note })
    .from(memberNotes)
    .where(eq(memberNotes.userId, userId));
  return row?.note ?? null;
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
        hasNote: sql<boolean>`${memberNotes.userId} is not null`,
      })
      .from(user)
      .leftJoin(orders, memberOrderJoin)
      .leftJoin(memberNotes, eq(memberNotes.userId, user.id))
      .where(where)
      .groupBy(user.id, memberNotes.userId)
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
      contactPhone: orders.contactPhone,
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
