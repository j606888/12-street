import { rmSync } from "node:fs";
import { cleanupE2eData } from "./helpers/cleanup";
import { ADMIN_STORAGE_STATE } from "./helpers/state";

export default async function globalTeardown() {
  const r = await cleanupE2eData({ includeAdminUser: true });
  rmSync(ADMIN_STORAGE_STATE, { force: true });
  console.log(
    `[e2e cleanup] orders=${r.orders} r2Objects=${r.objects} lookupFailures=${r.lookupFailures} users=${r.users}`,
  );
}
