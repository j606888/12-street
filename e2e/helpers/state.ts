import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import path from "node:path";
import type { BrowserContext } from "@playwright/test";

export const STATE_DIR = path.join(process.cwd(), "e2e", ".state");
export const ADMIN_STORAGE_STATE = path.join(STATE_DIR, "admin.json");
const TRACK_FILE = path.join(STATE_DIR, "created.jsonl");

export const TEST_PREFIX = "[E2E]";
export const ADMIN_EMAIL = "e2e-admin@example.test";
// Format-valid order number that never exists (used for the "not found" case)
export const NONEXISTENT_ORDER_NO = "P20000101-9999";

export type Tracked = {
  draftToken?: string;
  orderId?: string;
  orderNo?: string;
};

function track(entry: Tracked) {
  mkdirSync(STATE_DIR, { recursive: true });
  appendFileSync(TRACK_FILE, JSON.stringify(entry) + "\n");
}

/** Remember the guest's draft token (httpOnly cookie) so cleanup can find the draft. */
export async function trackDraftCookie(context: BrowserContext) {
  const cookies = await context.cookies();
  const token = cookies.find((c) => c.name === "draft_token")?.value;
  if (token) track({ draftToken: token });
}

export function trackOrder(orderId: string, orderNo?: string) {
  track({ orderId, orderNo });
}

export function readTracked(): Tracked[] {
  if (!existsSync(TRACK_FILE)) return [];
  return readFileSync(TRACK_FILE, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as Tracked);
}

export function clearTracked() {
  rmSync(TRACK_FILE, { force: true });
}
