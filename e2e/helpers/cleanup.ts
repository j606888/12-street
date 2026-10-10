import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";
import { Pool } from "pg";
import { loadEnv, requireEnv } from "./env";
import {
  ADMIN_EMAIL,
  clearTracked,
  NONEXISTENT_ORDER_NO,
  readTracked,
  TEST_PREFIX,
} from "./state";

loadEnv();

export function createPool() {
  const url = requireEnv("DATABASE_URL");
  // Cleanup runs destructive SQL: only ever against the local Docker database
  const host = new URL(url).hostname;
  if (host !== "localhost" && host !== "127.0.0.1") {
    throw new Error(
      `Refusing to run e2e against non-local database host ${host}`,
    );
  }
  return new Pool({ connectionString: url, max: 2 });
}

function createR2() {
  return new S3Client({
    region: "auto",
    endpoint: `https://${requireEnv("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: requireEnv("R2_ACCESS_KEY_ID"),
      secretAccessKey: requireEnv("R2_SECRET_ACCESS_KEY"),
    },
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
}

/** Deletes every object under the prefix; returns how many were removed. */
async function deletePrefix(r2: S3Client, bucket: string, prefix: string) {
  let removed = 0;
  let token: string | undefined;
  do {
    const list = await r2.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: token,
      }),
    );
    const keys = (list.Contents ?? []).flatMap((o) =>
      o.Key ? [{ Key: o.Key }] : [],
    );
    if (keys.length) {
      await r2.send(
        new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: keys } }),
      );
      removed += keys.length;
    }
    token = list.IsTruncated ? list.NextContinuationToken : undefined;
  } while (token);
  return removed;
}

/**
 * Removes only what the e2e run created: orders tracked by draft token / id /
 * "[E2E]" contact name, their R2 objects, lookup_failures for their order
 * numbers (plus the fixed nonexistent number), and the test admin user.
 */
export async function cleanupE2eData(opts: { includeAdminUser: boolean }) {
  const tracked = readTracked();
  const tokens = tracked.flatMap((t) => (t.draftToken ? [t.draftToken] : []));
  const ids = tracked.flatMap((t) => (t.orderId ? [t.orderId] : []));
  const extraNos = tracked.flatMap((t) => (t.orderNo ? [t.orderNo] : []));

  const pool = createPool();
  const r2 = createR2();
  const bucket = requireEnv("R2_BUCKET");
  try {
    const { rows } = await pool.query<{ id: string; order_no: string | null }>(
      `select id, order_no from orders
        where draft_token = any($1::text[])
           or id = any($2::uuid[])
           or left(contact_name, ${TEST_PREFIX.length}) = $3`,
      [tokens, ids, TEST_PREFIX],
    );

    let objects = 0;
    for (const o of rows) {
      objects += await deletePrefix(r2, bucket, `photos/${o.id}/`);
      objects += await deletePrefix(r2, bucket, `transfer-proofs/${o.id}/`);
    }

    const nos = [
      ...rows.flatMap((o) => (o.order_no ? [o.order_no] : [])),
      ...extraNos,
    ];
    const failures = await pool.query(
      `delete from lookup_failures where order_no = any($1::text[]) or order_no = $2`,
      [nos, NONEXISTENT_ORDER_NO],
    );
    const del = await pool.query(
      `delete from orders where id = any($1::uuid[])`,
      [rows.map((o) => o.id)],
    );

    let users = 0;
    if (opts.includeAdminUser) {
      users =
        (await pool.query(`delete from "user" where email = $1`, [ADMIN_EMAIL]))
          .rowCount ?? 0;
      clearTracked();
    }
    return {
      orders: del.rowCount ?? 0,
      objects,
      lookupFailures: failures.rowCount ?? 0,
      users,
    };
  } finally {
    await pool.end();
    r2.destroy();
  }
}
