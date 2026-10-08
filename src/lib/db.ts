import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";
import { attachDatabasePool } from "@vercel/functions";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "@/db/schema";

function sslConfig() {
  const caPath = process.env.DATABASE_CA_PATH;
  if (!caPath) return undefined; // local docker Postgres
  return {
    rejectUnauthorized: true,
    ca: readFileSync(path.resolve(process.cwd(), caPath), "utf8"),
  };
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: sslConfig(),
  max: 5,
  idleTimeoutMillis: 5_000,
});
attachDatabasePool(pool);

export const db = drizzle(pool, { schema });
export type Db = typeof db;
