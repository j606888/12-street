import { describe, expect, it } from "vitest";
import { detectPhotoFormat, fitPixels, jpegFileName } from "./convert-photo";

const bytes = (...parts: (string | number[])[]) =>
  new Uint8Array(
    parts.flatMap((p) =>
      typeof p === "string" ? [...p].map((c) => c.charCodeAt(0)) : p,
    ),
  );

describe("detectPhotoFormat", () => {
  it("recognises each format by its signature", () => {
    expect(detectPhotoFormat(bytes([0xff, 0xd8, 0xff, 0xe1]))).toBe("jpeg");
    expect(detectPhotoFormat(bytes("\x89PNG\r\n\x1a\n"))).toBe("png");
    expect(detectPhotoFormat(bytes("RIFF", [1, 2, 3, 4], "WEBPVP8 "))).toBe(
      "webp",
    );
    expect(detectPhotoFormat(bytes([0, 0, 0, 24], "ftypheic"))).toBe("heic");
    expect(detectPhotoFormat(bytes([0, 0, 0, 24], "ftypmif1"))).toBe("heic");
  });

  it("ignores the name: unknown content stays unknown", () => {
    expect(detectPhotoFormat(bytes([0, 0, 0, 24], "ftypisom"))).toBe("unknown");
    expect(detectPhotoFormat(bytes("GIF89a"))).toBe("unknown");
    expect(detectPhotoFormat(new Uint8Array())).toBe("unknown");
  });
});

describe("jpegFileName", () => {
  it("swaps the extension for .jpg", () => {
    expect(jpegFileName("IMG_0001.HEIC")).toBe("IMG_0001.jpg");
    expect(jpegFileName("a.b.png")).toBe("a.b.jpg");
    expect(jpegFileName("noext")).toBe("noext.jpg");
    expect(jpegFileName(".heic")).toBe("photo.jpg");
  });
});

describe("fitPixels", () => {
  it("keeps photos under the limit as they are", () => {
    expect(fitPixels(4032, 3024)).toEqual({ width: 4032, height: 3024 });
  });

  it("scales 24/48 MP photos down to 16 MP, keeping the ratio", () => {
    for (const [w, h] of [
      [5712, 4284],
      [8064, 6048],
    ]) {
      const out = fitPixels(w, h);
      expect(out.width * out.height).toBeLessThanOrEqual(16_000_000);
      expect(out.width / out.height).toBeCloseTo(w / h, 2);
    }
  });
});
