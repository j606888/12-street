import "server-only";
import { randomBytes } from "node:crypto";
import { and, asc, desc, eq, isNull, ne } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { presignGet } from "@/lib/r2";
import { getSession } from "@/lib/session";
import { orderGroups, orders, photos, printSizes, products } from "@/db/schema";

export const DRAFT_COOKIE = "draft_token";
export const LAST_ORDER_COOKIE = "last_order";
const DRAFT_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

export const cookieOptions = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 24 * 30,
} as const;

/** Who is building the order: a signed-in member, or a guest identified by the draft cookie. */
export type Owner =
  | { kind: "member"; userId: string; name: string; phone: string | null }
  | { kind: "guest"; draftToken: string | null };

export async function getOwner(): Promise<Owner> {
  const session = await getSession();
  if (session) {
    return {
      kind: "member",
      userId: session.user.id,
      name: session.user.name,
      phone: (session.user.phone as string | null | undefined) ?? null,
    };
  }
  const token = (await cookies()).get(DRAFT_COOKIE)?.value;
  return {
    kind: "guest",
    draftToken: token && DRAFT_TOKEN_RE.test(token) ? token : null,
  };
}

function ownerFilter(owner: Owner) {
  if (owner.kind === "member") return eq(orders.userId, owner.userId);
  if (!owner.draftToken) return undefined;
  return and(eq(orders.draftToken, owner.draftToken), isNull(orders.userId));
}

/** The owner's current draft order id, or null. */
export async function findDraftId(owner: Owner): Promise<string | null> {
  const filter = ownerFilter(owner);
  if (!filter) return null;
  const [row] = await db
    .select({ id: orders.id })
    .from(orders)
    .where(and(filter, eq(orders.status, "draft")))
    .orderBy(desc(orders.createdAt))
    .limit(1);
  return row?.id ?? null;
}

/** Returns the current draft, creating it (and the guest cookie) on first use. Server Actions only. */
export async function ensureDraftId(owner: Owner): Promise<string> {
  const existing = await findDraftId(owner);
  if (existing) return existing;

  if (owner.kind === "member") {
    const [row] = await db
      .insert(orders)
      .values({ userId: owner.userId })
      .returning({ id: orders.id });
    return row.id;
  }

  const draftToken = randomBytes(32).toString("base64url");
  const [row] = await db
    .insert(orders)
    .values({ draftToken })
    .returning({ id: orders.id });
  (await cookies()).set(DRAFT_COOKIE, draftToken, cookieOptions);
  return row.id;
}

export type DraftPhoto = {
  id: string;
  fileName: string;
  sha256: string;
  sizeBytes: number;
  quantity: number;
  status: "pending" | "uploaded";
  thumbUrl: string | null;
  productId: number | null; // ID-photo set
};

export type DraftView = {
  groups: {
    id: string;
    printSizeId: number;
    laminate: boolean;
    photos: DraftPhoto[];
  }[];
  customPhotos: DraftPhoto[];
  idPhotos: DraftPhoto[];
};

export async function loadDraft(orderId: string): Promise<DraftView> {
  const [groupRows, photoRows] = await Promise.all([
    db
      .select({
        id: orderGroups.id,
        printSizeId: orderGroups.printSizeId,
        laminate: orderGroups.laminate,
      })
      .from(orderGroups)
      .where(eq(orderGroups.orderId, orderId))
      .orderBy(asc(orderGroups.sortOrder), asc(orderGroups.createdAt)),
    db
      .select()
      .from(photos)
      .where(and(eq(photos.orderId, orderId), ne(photos.status, "deleted")))
      .orderBy(asc(photos.createdAt), asc(photos.fileName)),
  ]);

  const view = await Promise.all(
    photoRows.map(async (p) => ({
      groupId: p.groupId,
      kind: p.kind,
      photo: {
        id: p.id,
        fileName: p.fileName,
        sha256: p.sha256,
        sizeBytes: p.sizeBytes,
        quantity: p.quantity,
        status: p.status as "pending" | "uploaded",
        thumbUrl: p.status === "uploaded" ? await presignGet(p.r2Key) : null,
        productId: p.productId,
      },
    })),
  );

  return {
    groups: groupRows.map((g) => ({
      ...g,
      photos: view
        .filter((v) => v.kind === "print" && v.groupId === g.id)
        .map((v) => v.photo),
    })),
    customPhotos: view.filter((v) => v.kind === "custom").map((v) => v.photo),
    idPhotos: view.filter((v) => v.kind === "id_photo").map((v) => v.photo),
  };
}

export async function loadCatalog() {
  const [sizes, productRows] = await Promise.all([
    db
      .select({
        id: printSizes.id,
        code: printSizes.code,
        label: printSizes.label,
        price: printSizes.price,
        laminationPrice: printSizes.laminationPrice,
      })
      .from(printSizes)
      .where(eq(printSizes.active, true))
      .orderBy(asc(printSizes.sortOrder)),
    db
      .select({
        id: products.id,
        name: products.name,
        description: products.description,
        price: products.price,
        category: products.category,
      })
      .from(products)
      .where(eq(products.active, true))
      .orderBy(asc(products.sortOrder)),
  ]);
  return {
    sizes,
    addons: productRows.filter((p) => p.category === "addon"),
    idPhotoSets: productRows.filter((p) => p.category === "id_photo"),
  };
}

export type Catalog = Awaited<ReturnType<typeof loadCatalog>>;
