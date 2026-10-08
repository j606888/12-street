// Catalog data. Prices/sizes below are placeholders (from the mock site) until the shop owner
// provides the official list — edit here and re-run `pnpm db:seed`.
import { config } from "dotenv";
config({ path: ".env.local" });

import { inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { readFileSync } from "node:fs";
import * as schema from "./schema";

const PRINT_SIZES = [
  { code: "4R", label: "4×6", price: 8, sortOrder: 1 },
  { code: "5R", label: "5×7", price: 15, sortOrder: 2 },
  { code: "6R", label: "6×8", price: 25, sortOrder: 3 },
  { code: "8R", label: "8×10", price: 40, sortOrder: 4 },
];

const PRODUCTS = [
  { code: "album", name: "相冊", description: "可放 4×6 照片", price: 300, sortOrder: 1 },
  { code: "mug", name: "馬克杯", description: "照片印製馬克杯", price: 350, sortOrder: 2 },
];

const MEMBER_TAGS = [
  { name: "未取件", color: "yellow" },
  { name: "BAD", color: "red" },
];

async function main() {
  const caPath = process.env.DATABASE_CA_PATH;
  const pool = new Pool({
    connectionString: process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL,
    ssl: caPath ? { rejectUnauthorized: true, ca: readFileSync(caPath, "utf8") } : undefined,
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
        sortOrder: sql`excluded.sort_order`,
      },
    });

  await db
    .insert(schema.products)
    .values(PRODUCTS)
    .onConflictDoUpdate({
      target: schema.products.code,
      set: {
        name: sql`excluded.name`,
        description: sql`excluded.description`,
        price: sql`excluded.price`,
        sortOrder: sql`excluded.sort_order`,
      },
    });

  await db.insert(schema.memberTags).values(MEMBER_TAGS).onConflictDoNothing();

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
