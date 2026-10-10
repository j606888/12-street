import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { cleanupE2eData, createPool } from "./helpers/cleanup";
import { loadEnv, requireEnv } from "./helpers/env";
import {
  ADMIN_EMAIL,
  ADMIN_STORAGE_STATE,
  STATE_DIR,
  TEST_PREFIX,
} from "./helpers/state";

/**
 * Creates a test admin directly in the local DB (user + session rows) and
 * writes a browser storage state holding a Better Auth session cookie signed
 * the same way better-call does: encodeURIComponent(`${token}.${base64 HMAC-SHA256}`).
 * No auth bypass exists in the app itself.
 */
export default async function globalSetup() {
  loadEnv();
  const secret = requireEnv("BETTER_AUTH_SECRET");
  const baseUrl = new URL(
    process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
  );

  // Leftovers from an interrupted earlier run
  await cleanupE2eData({ includeAdminUser: true });

  const pool = createPool();
  try {
    const userId = `e2e-${randomUUID()}`;
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await pool.query(
      `insert into "user" (id, name, email, email_verified, role) values ($1, $2, $3, true, 'admin')`,
      [userId, `${TEST_PREFIX} Admin`, ADMIN_EMAIL],
    );
    await pool.query(
      `insert into session (id, expires_at, token, user_id, user_agent) values ($1, $2, $3, $4, 'playwright-e2e')`,
      [`e2e-${randomUUID()}`, expiresAt, token, userId],
    );

    const signature = createHmac("sha256", secret)
      .update(token)
      .digest("base64");
    const secure = baseUrl.protocol === "https:";
    mkdirSync(STATE_DIR, { recursive: true });
    writeFileSync(
      ADMIN_STORAGE_STATE,
      JSON.stringify({
        cookies: [
          {
            name: `${secure ? "__Secure-" : ""}better-auth.session_token`,
            value: encodeURIComponent(`${token}.${signature}`),
            domain: baseUrl.hostname,
            path: "/",
            expires: Math.floor(expiresAt.getTime() / 1000),
            httpOnly: true,
            secure,
            sameSite: "Lax",
          },
        ],
        origins: [],
      }),
    );
  } finally {
    await pool.end();
  }
}
