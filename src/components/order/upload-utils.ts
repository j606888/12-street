// Browser-only helpers for direct-to-R2 uploads.
import { MAX_PHOTO_BYTES } from "@/lib/validators/order";
import {
  convertToJpeg,
  detectPhotoFormat,
  type PhotoFormat,
} from "./convert-photo";

const PHOTO_EXTENSIONS = /\.(jpe?g|heic|heif|png|webp)$/;

/** Quick check on name/type before reading the file. Returns an error message or null. */
export function checkPhotoFile(file: File): string | null {
  const name = file.name.toLowerCase();
  if (!PHOTO_EXTENSIONS.test(name) && !file.type.startsWith("image/")) {
    return "不是照片檔，可以傳 JPG、HEIC、PNG。";
  }
  if (file.size === 0) return "是空檔案。";
  if (file.size > MAX_PHOTO_BYTES) return "超過 50 MB。";
  return null;
}

/** Sniffs the real format; anything but JPEG has to be converted before upload. */
export async function sniffPhoto(file: File): Promise<PhotoFormat> {
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  return detectPhotoFormat(head);
}

/** Returns the file to upload (always JPEG) and its SHA-256 (hex). */
export async function preparePhoto(
  file: File,
  format: PhotoFormat,
): Promise<{ file: File; sha256: string } | { error: string }> {
  if (format === "unknown") {
    return { error: "讀不出照片內容，可以傳 JPG、HEIC、PNG。" };
  }
  let jpeg = file;
  if (format !== "jpeg") {
    try {
      jpeg = await convertToJpeg(file, format);
    } catch {
      return { error: "這張照片轉成 JPG 失敗，請換一張或先轉成 JPG 再傳。" };
    }
    if (jpeg.size > MAX_PHOTO_BYTES)
      return { error: "轉成 JPG 後超過 50 MB。" };
  }
  const digest = await crypto.subtle.digest(
    "SHA-256",
    await jpeg.arrayBuffer(),
  );
  const sha256 = Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
  return { file: jpeg, sha256 };
}

export class UploadError extends Error {
  constructor(
    message: string,
    readonly network: boolean,
  ) {
    super(message);
  }
}

/** PUT with progress via XHR (fetch has no upload progress). Only Content-Type is sent (bucket CORS). */
export function putFile(
  url: string,
  file: Blob,
  contentType: string,
  onProgress: (fraction: number) => void,
): { promise: Promise<void>; abort: () => void } {
  const xhr = new XMLHttpRequest();
  const promise = new Promise<void>((resolve, reject) => {
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new UploadError(`上傳失敗（${xhr.status}）`, false));
    };
    xhr.onerror = () => reject(new UploadError("網路中斷，上傳失敗", true));
    xhr.ontimeout = () => reject(new UploadError("上傳逾時", true));
    xhr.onabort = () => reject(new UploadError("已取消", false));
    xhr.send(file);
  });
  return { promise, abort: () => xhr.abort() };
}

/** Runs `fn` over items with at most `limit` in flight. */
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
) {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  );
  return results;
}
