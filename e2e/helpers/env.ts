import { existsSync } from "node:fs";
import path from "node:path";

/** Loads .env.local into process.env (does not override existing values). */
export function loadEnv() {
  const file = path.join(process.cwd(), ".env.local");
  if (existsSync(file)) process.loadEnvFile(file);
}

export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env ${name} (.env.local)`);
  return v;
}
