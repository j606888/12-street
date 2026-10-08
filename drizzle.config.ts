import { config } from "dotenv";
config({ path: ".env.local" });
import { readFileSync } from "node:fs";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema",
  out: "./src/db/migrations",
  dbCredentials: {
    url: process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL!,
    ssl:
      process.env.DATABASE_SSL === "true"
        ? { rejectUnauthorized: true, ca: readFileSync("certs/rds-global-bundle.pem", "utf8") }
        : undefined,
  },
  strict: true,
});
