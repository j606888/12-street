import {
  bigint,
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

// ---- Catalog (maintained via db:seed) ----

export const printSizes = pgTable("print_sizes", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(), // e.g. "4R"
  label: text("label").notNull(), // e.g. "4×6"
  price: integer("price").notNull(), // NT$ per print
  laminationPrice: integer("lamination_price").notNull().default(0), // NT$ per print (護貝)
  sortOrder: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
});

export const productCategory = pgEnum("product_category", [
  "addon", // 周邊商品
  "id_photo", // 證件照 set; the customer uploads one photo per set
]);

export const products = pgTable("products", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  category: productCategory("category").notNull().default("addon"),
  name: text("name").notNull(),
  description: text("description"),
  price: integer("price").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
});

// ---- Orders ----

export const orderStatus = pgEnum("order_status", [
  "draft", // being built, photos may still be uploading
  "submitted",
  "printing",
  "ready", // ready for pickup
  "picked_up",
  "cancelled",
]);

export const paymentMethod = pgEnum("payment_method", [
  "cash_on_pickup",
  "line_money",
  "bank_transfer",
]);

export const paymentStatus = pgEnum("payment_status", [
  "unpaid",
  "pending_review",
  "paid",
]);

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderNo: text("order_no").unique(), // assigned on submit, e.g. P20261009-0001
    status: orderStatus("status").notNull().default("draft"),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    // Random token kept in an httpOnly cookie so guests can resume their draft
    draftToken: text("draft_token").unique(),
    contactName: text("contact_name"),
    contactPhone: text("contact_phone"),
    contactEmail: text("contact_email"), // required for guests; reminders go here
    note: text("note"),
    customNote: text("custom_note"), // 客製化製作 notes; details discussed via LINE
    paymentMethod: paymentMethod("payment_method"),
    paymentStatus: paymentStatus("payment_status").notNull().default("unpaid"),
    bankLast5: text("bank_last5"),
    transferProofKey: text("transfer_proof_key"), // R2 key of transfer screenshot
    totalAmount: integer("total_amount").notNull().default(0),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("orders_user_idx").on(t.userId),
    index("orders_status_idx").on(t.status, t.paymentStatus),
    index("orders_phone_idx").on(t.contactPhone),
  ],
);

// Daily counter backing order numbers
export const orderCounters = pgTable("order_counters", {
  day: text("day").primaryKey(), // YYYYMMDD in Asia/Taipei
  last: integer("last").notNull().default(0),
});

// One group = one print size
export const orderGroups = pgTable(
  "order_groups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    printSizeId: integer("print_size_id")
      .notNull()
      .references(() => printSizes.id),
    unitPrice: integer("unit_price"), // snapshot taken on submit
    laminate: boolean("laminate").notNull().default(false), // 護貝 every print in the group
    laminationUnitPrice: integer("lamination_unit_price"), // snapshot taken on submit
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("order_groups_order_idx").on(t.orderId)],
);

export const photoKind = pgEnum("photo_kind", ["print", "custom", "id_photo"]);
export const photoStatus = pgEnum("photo_status", [
  "pending",
  "uploaded",
  "deleted",
]);

export const photos = pgTable(
  "photos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    groupId: uuid("group_id").references(() => orderGroups.id, {
      onDelete: "cascade",
    }),
    kind: photoKind("kind").notNull().default("print"),
    // ID-photo set chosen for kind = 'id_photo' (quantity = number of sets)
    productId: integer("product_id").references(() => products.id),
    r2Key: text("r2_key").notNull().unique(),
    fileName: text("file_name").notNull(),
    sha256: text("sha256").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    quantity: integer("quantity").notNull().default(1),
    status: photoStatus("status").notNull().default("pending"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("photos_order_idx").on(t.orderId),
    index("photos_group_sha_idx").on(t.groupId, t.sha256),
    index("photos_expires_idx").on(t.status, t.expiresAt),
  ],
);

// Ordered products: add-ons and ID-photo sets (證件照)
export const orderItems = pgTable(
  "order_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id),
    name: text("name").notNull(), // snapshot
    unitPrice: integer("unit_price").notNull(), // snapshot
    quantity: integer("quantity").notNull(),
    photoId: uuid("photo_id").references(() => photos.id, {
      onDelete: "set null",
    }), // ID-photo source
  },
  (t) => [index("order_items_order_idx").on(t.orderId)],
);

// ---- Member tags (未取件、BAD…) ----

export const memberTags = pgTable("member_tags", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  color: text("color").notNull().default("gray"),
});

export const userTags = pgTable(
  "user_tags",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    tagId: integer("tag_id")
      .notNull()
      .references(() => memberTags.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.tagId] })],
);

// Shop-only notes about a member. Kept out of `user` so they never reach the
// customer through the Better Auth session.
export const memberNotes = pgTable("member_notes", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  note: text("note").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

// Failed guest lookups, keyed by the order number tried; used to throttle guessing
export const lookupFailures = pgTable(
  "lookup_failures",
  {
    id: serial("id").primaryKey(),
    orderNo: text("order_no").notNull(), // normalized, may not exist
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("lookup_failures_order_no_idx").on(t.orderNo, t.createdAt)],
);
