// Catalog data from the shop owner's price list (docs/owner-pricing.md).
// Edit here and re-run `pnpm db:seed`; rows no longer listed are deactivated, not deleted.
import { config } from "dotenv";
config({ path: ".env.local" });

import { inArray, notInArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { readFileSync } from "node:fs";
import * as schema from "./schema";

const PRINT_SIZES = [
  { code: "2x3s", label: "小 2×3", price: 5, laminationPrice: 5, sortOrder: 1 },
  { code: "2x3", label: "2×3", price: 5, laminationPrice: 5, sortOrder: 2 },
  { code: "3x5", label: "3×5", price: 5, laminationPrice: 5, sortOrder: 3 },
  { code: "4x6", label: "4×6", price: 6, laminationPrice: 5, sortOrder: 4 },
  { code: "5x7", label: "5×7", price: 25, laminationPrice: 10, sortOrder: 5 },
  { code: "6x8", label: "6×8", price: 35, laminationPrice: 15, sortOrder: 6 },
  { code: "8x10", label: "8×10", price: 90, laminationPrice: 25, sortOrder: 7 },
  { code: "8x12", label: "8×12", price: 100, laminationPrice: 25, sortOrder: 8 },
];

// 證件照: NT$100 per set. Albums/mugs etc. now go through 客製化製作 instead of fixed products.
const ID_PHOTO = { category: "id_photo", price: 100 } as const;
const PRODUCTS = [
  {
    ...ID_PHOTO,
    code: "id-2in-8",
    name: "證件照：一般兩吋 8 張",
    description: "學生證、兵役體檢、履歷表、落地簽證、健保卡、國際駕照",
    sortOrder: 1,
  },
  {
    ...ID_PHOTO,
    code: "id-2in-big-8",
    name: "證件照：大頭兩吋 8 張",
    description: "身分證、護照、英／泰／馬／菲簽證、外僑居留證",
    sortOrder: 2,
  },
  {
    ...ID_PHOTO,
    code: "id-1in-10",
    name: "證件照：一吋 10 張",
    description: "駕照、殘障手冊",
    sortOrder: 3,
  },
  // Combos (組合價 in the per-photo menu, see ID_SET_GROUPS in order-form.tsx)
  {
    ...ID_PHOTO,
    code: "id-2in-big4-2in4",
    name: "證件照：大頭兩吋 4 張＋一般兩吋 4 張",
    description: "大頭兩吋＋一般兩吋",
    sortOrder: 4,
  },
  {
    ...ID_PHOTO,
    code: "id-2in-big4-1in5",
    name: "證件照：大頭兩吋 4 張＋一吋 5 張",
    description: "大頭兩吋＋駕照、殘障手冊用的一吋",
    sortOrder: 5,
  },
  {
    ...ID_PHOTO,
    code: "id-2in4-1in5",
    name: "證件照：一般兩吋 4 張＋一吋 5 張",
    description: "兩吋＋駕照、殘障手冊用的一吋",
    sortOrder: 6,
  },
  {
    ...ID_PHOTO,
    code: "id-5x5",
    name: "證件照：5cm×5cm 4 張", // piece count is a placeholder until the owner confirms
    description: "美國簽證、印度簽證",
    sortOrder: 7,
  },
  {
    ...ID_PHOTO,
    code: "id-other",
    name: "證件照：其他",
    description: "特殊尺寸、修圖（價格另議）",
    price: 0, // quoted by the shop afterwards
    sortOrder: 8,
  },
];

async function main() {
  const useSsl = process.env.DATABASE_SSL === "true";
  const pool = new Pool({
    connectionString: process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL,
    ssl: useSsl
      ? { rejectUnauthorized: true, ca: readFileSync("certs/rds-global-bundle.pem", "utf8") }
      : undefined,
  });
  const db = drizzle(pool, { schema });

  await db
    .insert(schema.printSizes)
    .values(PRINT_SIZES)
    .onConflictDoUpdate({
      target: schema.printSizes.code,
      set: {
        label: sql`excluded.label`,
        price: sql`excluded.price`,
        laminationPrice: sql`excluded.lamination_price`,
        sortOrder: sql`excluded.sort_order`,
        active: true,
      },
    });
  await db
    .update(schema.printSizes)
    .set({ active: false })
    .where(notInArray(schema.printSizes.code, PRINT_SIZES.map((s) => s.code)));

  await db
    .insert(schema.products)
    .values(PRODUCTS)
    .onConflictDoUpdate({
      target: schema.products.code,
      set: {
        name: sql`excluded.name`,
        description: sql`excluded.description`,
        category: sql`excluded.category`,
        price: sql`excluded.price`,
        sortOrder: sql`excluded.sort_order`,
        active: true,
      },
    });
  await db
    .update(schema.products)
    .set({ active: false })
    .where(notInArray(schema.products.code, PRODUCTS.map((p) => p.code)));

  // Promote admins by LINE user ID (the account must have logged in once)
  const adminLineIds = (process.env.ADMIN_LINE_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (adminLineIds.length) {
    const accounts = await db
      .select({ userId: schema.account.userId })
      .from(schema.account)
      .where(inArray(schema.account.accountId, adminLineIds));
    if (accounts.length) {
      await db
        .update(schema.user)
        .set({ role: "admin" })
        .where(
          inArray(
            schema.user.id,
            accounts.map((a) => a.userId),
          ),
        );
    }
    console.log(`admins promoted: ${accounts.length}/${adminLineIds.length}`);
  }

  console.log("seed done");
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
