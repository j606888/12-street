import { config } from "dotenv";
config({ path: ".env.local" });
import { readFileSync } from "node:fs";
import { defineConfig } from "drizzle-kit";

const url = process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL!;

// drizzle-kit ignores `ssl` when given a `url`, so for RDS pass the parts instead
function credentials() {
  if (process.env.DATABASE_SSL !== "true") return { url };
  const u = new URL(url);
  return {
    host: u.hostname,
    port: Number(u.port || 5432),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.slice(1),
    ssl: { rejectUnauthorized: true, ca: readFileSync("certs/rds-global-bundle.pem", "utf8") },
  };
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema",
  out: "./src/db/migrations",
  dbCredentials: credentials(),
  strict: true,
});
