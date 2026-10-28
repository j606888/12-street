// Browser-only: turns HEIC / PNG / WebP into the JPEG we store, so R2 and the
// admin downloads only ever see JPG. Nothing here goes through the server.

export type PhotoFormat = "jpeg" | "heic" | "png" | "webp" | "unknown";

const JPEG_QUALITY = 0.92;
// iOS Safari won't draw canvases above ~16.7M pixels (24/48 MP iPhone photos);
// 16 MP is still far more than any print size needs
const MAX_PIXELS = 16_000_000;
const HEIF_BRANDS = new Set([
  "heic",
  "heix",
  "heim",
  "heis",
  "hevc",
  "hevx",
  "hevm",
  "hevs",
  "mif1",
  "msf1",
]);

/** Sniffs the real format from the first bytes (names and MIME types from LINE/iOS aren't reliable). */
export function detectPhotoFormat(head: Uint8Array): PhotoFormat {
  const ascii = (from: number, to: number) =>
    String.fromCharCode(...head.subarray(from, to));
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return "jpeg";
  if (ascii(0, 8) === "\x89PNG\r\n\x1a\n") return "png";
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "webp";
  if (ascii(4, 8) === "ftyp" && HEIF_BRANDS.has(ascii(8, 12))) return "heic";
  return "unknown";
}

/** "IMG_0001.HEIC" → "IMG_0001.jpg" */
export function jpegFileName(name: string): string {
  const base = name.replace(/\.[^./\\]*$/, "") || "photo";
  return `${base}.jpg`;
}

/** Fits width×height into MAX_PIXELS, keeping the aspect ratio. */
export function fitPixels(width: number, height: number) {
  const area = width * height;
  if (area <= MAX_PIXELS) return { width, height };
  const scale = Math.sqrt(MAX_PIXELS / area);
  return {
    width: Math.floor(width * scale),
    height: Math.floor(height * scale),
  };
}

type Decoded = { image: CanvasImageSource; width: number; height: number };

async function decodeNative(file: Blob): Promise<Decoded> {
  const bitmap = await createImageBitmap(file); // applies EXIF orientation
  return { image: bitmap, width: bitmap.width, height: bitmap.height };
}

// libheif (WASM, ~3 MB) only loads when the browser can't decode HEIC itself
// (Android, Chrome/Edge on desktop). Safari on iOS 17+/macOS decodes natively.
async function decodeHeicWasm(file: Blob): Promise<Decoded> {
  const { heicTo } = await import("heic-to");
  const bitmap = await heicTo({ blob: file, type: "bitmap" });
  return { image: bitmap, width: bitmap.width, height: bitmap.height };
}

async function encodeJpeg({ image, width, height }: Decoded): Promise<Blob> {
  const size = fitPixels(width, height);
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  try {
    // P3 keeps iPhone colours; browsers without P3 canvases fall back to sRGB
    const ctx = canvas.getContext("2d", { colorSpace: "display-p3" });
    if (!ctx) throw new Error("no canvas");
    ctx.fillStyle = "#fff"; // transparent PNG areas print white, not black
    ctx.fillRect(0, 0, size.width, size.height);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(image, 0, 0, size.width, size.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
    );
    if (!blob) throw new Error("toBlob failed");
    return blob;
  } finally {
    // Free the pixel buffers right away; iOS kills tabs that hold too many
    canvas.width = canvas.height = 0;
    if ("close" in image) image.close();
  }
}

// Once native HEIC decoding has failed, skip straight to WASM for the rest
let nativeHeic = true;

/**
 * Converts a non-JPEG photo to a JPEG File. Throws if the browser can't read it.
 * Run one at a time: each full-size decode holds ~100 MB on a phone.
 */
export async function convertToJpeg(
  file: File,
  format: PhotoFormat,
): Promise<File> {
  let decoded: Decoded;
  if (format !== "heic") decoded = await decodeNative(file);
  else if (!nativeHeic) decoded = await decodeHeicWasm(file);
  else {
    try {
      decoded = await decodeNative(file);
    } catch {
      decoded = await decodeHeicWasm(file);
      nativeHeic = false; // WASM read it, so the browser was the problem
    }
  }
  const blob = await encodeJpeg(decoded);
  return new File([blob], jpegFileName(file.name), {
    type: "image/jpeg",
    lastModified: file.lastModified,
  });
}
