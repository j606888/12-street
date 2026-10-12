// File names inside the order ZIP the shop downloads, e.g.
// "01_4×6/IMG_0001_5張_護貝3張.jpg", "證件照/大頭兩吋 8 張/IMG_0002_2組.jpg".

export type ZipPhoto = {
  folder: string;
  fileName: string;
  /** Prints (張) or ID-photo sets (組); omitted for custom work. */
  quantity?: { n: number; unit: "張" | "組"; laminated?: number };
};

const UNSAFE = /[\\/:*?"<>|\u0000-\u001f]/g;

export function safeSegment(s: string): string {
  return s.replace(UNSAFE, "_").trim() || "_";
}

/** Folder for a print group: position keeps same-size groups apart. */
export function groupFolder(index: number, label: string) {
  const n = String(index + 1).padStart(2, "0");
  return `${n}_${label}`;
}

/** "證件照：大頭兩吋 8 張" → "大頭兩吋 8 張" (the parent folder already says 證件照) */
export function idPhotoFolder(productName: string | null) {
  return productName?.replace(/^證件照[：:]\s*/, "") || "未指定";
}

/** One unique path per photo, in input order. */
export function zipEntryNames(photos: ZipPhoto[]): string[] {
  const used = new Set<string>();
  return photos.map((p) => {
    const folder = p.folder.split("/").map(safeSegment).join("/");
    const base = safeSegment(p.fileName.replace(/\.jpe?g$/i, ""));
    const laminated = p.quantity?.laminated
      ? `_護貝${p.quantity.laminated}張`
      : "";
    const suffix = p.quantity
      ? `_${p.quantity.n}${p.quantity.unit}${laminated}`
      : "";
    let name = `${folder}/${base}${suffix}.jpg`;
    for (let i = 2; used.has(name.toLowerCase()); i++) {
      name = `${folder}/${base}${suffix} (${i}).jpg`;
    }
    used.add(name.toLowerCase());
    return name;
  });
}
