import "server-only";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const bucket = process.env.R2_BUCKET ?? "";

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
  },
  // Default checksums add x-amz-checksum-* to presigned URLs, which the bucket CORS rejects
  requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED",
});

const UPLOAD_URL_TTL = 60 * 60; // seconds
const DOWNLOAD_URL_TTL = 60 * 60;

export function photoKey(orderId: string, photoId: string) {
  return `photos/${orderId}/${photoId}.jpg`;
}

export function transferProofKey(
  orderId: string,
  fileId: string,
  ext: "jpg" | "png",
) {
  return `transfer-proofs/${orderId}/${fileId}.${ext}`;
}

/** The browser must send exactly this Content-Type header when PUTting. */
export function presignPut(key: string, contentType: string) {
  return getSignedUrl(
    r2,
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: contentType,
    }),
    { expiresIn: UPLOAD_URL_TTL },
  );
}

export function presignGet(key: string) {
  return getSignedUrl(r2, new GetObjectCommand({ Bucket: bucket, Key: key }), {
    expiresIn: DOWNLOAD_URL_TTL,
  });
}

/** Returns the object's size in bytes, or null if it doesn't exist. */
export async function headObjectSize(key: string): Promise<number | null> {
  try {
    const res = await r2.send(
      new HeadObjectCommand({ Bucket: bucket, Key: key }),
    );
    return res.ContentLength ?? 0;
  } catch (err) {
    const status = (err as { $metadata?: { httpStatusCode?: number } })
      .$metadata?.httpStatusCode;
    if (status === 404) return null;
    throw err;
  }
}

export async function deleteObjects(keys: string[]) {
  await Promise.all(
    keys.map((key) =>
      r2.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })),
    ),
  );
}
