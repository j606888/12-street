// Browser-only helpers for direct-to-R2 uploads.
import { MAX_PHOTO_BYTES } from "@/lib/validators/order";

/** Quick check on name/type before reading the file. Returns an error message or null. */
export function checkPhotoFile(file: File): string | null {
  const name = file.name.toLowerCase();
  if (/\.(heic|heif)$/.test(name) || /image\/hei[cf]/.test(file.type)) {
    return "是 HEIC 格式（iPhone 預設），請先轉成 JPG 再上傳。iPhone 可到「設定 → 相機 → 格式」改成「最相容」。";
  }
  if (!/\.jpe?g$/.test(name) || (file.type && file.type !== "image/jpeg")) {
    return "不是 JPG／JPEG 檔，只接受 JPG／JPEG。";
  }
  if (file.size === 0) return "是空檔案。";
  if (file.size > MAX_PHOTO_BYTES) return "超過 50 MB。";
  return null;
}

/** Reads the file once: verifies the JPEG signature and returns its SHA-256 (hex). */
export async function inspectJpeg(
  file: File,
): Promise<{ sha256: string } | { error: string }> {
  const buf = await file.arrayBuffer();
  const head = new Uint8Array(buf, 0, Math.min(3, buf.byteLength));
  if (head[0] !== 0xff || head[1] !== 0xd8 || head[2] !== 0xff) {
    return { error: "副檔名是 JPG，但內容不是 JPEG 圖片。" };
  }
  const digest = await crypto.subtle.digest("SHA-256", buf);
  const sha256 = Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
  return { sha256 };
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
