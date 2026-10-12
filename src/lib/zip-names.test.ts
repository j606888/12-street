import { describe, expect, it } from "vitest";
import {
  groupFolder,
  idPhotoFolder,
  safeSegment,
  zipEntryNames,
} from "./zip-names";

describe("groupFolder", () => {
  it("numbers groups", () => {
    expect(groupFolder(0, "4×6")).toBe("01_4×6");
    expect(groupFolder(11, "5×7")).toBe("12_5×7");
  });
});

describe("idPhotoFolder", () => {
  it("drops the 證件照 prefix of the product name", () => {
    expect(idPhotoFolder("證件照：大頭兩吋 4 張＋一吋 5 張")).toBe(
      "大頭兩吋 4 張＋一吋 5 張",
    );
    expect(idPhotoFolder("一吋 10 張")).toBe("一吋 10 張");
    expect(idPhotoFolder(null)).toBe("未指定");
  });
});

describe("safeSegment", () => {
  it("replaces characters that break paths", () => {
    expect(safeSegment('a/b\\c:d*e?"f<g>h|i')).toBe("a_b_c_d_e__f_g_h_i");
    expect(safeSegment("  ")).toBe("_");
  });
});

describe("zipEntryNames", () => {
  it("adds how many prints get laminated", () => {
    expect(
      zipEntryNames([
        {
          folder: "01_3×5",
          fileName: "a.jpg",
          quantity: { n: 5, unit: "張", laminated: 3 },
        },
        {
          folder: "01_3×5",
          fileName: "b.jpg",
          quantity: { n: 2, unit: "張", laminated: 0 },
        },
      ]),
    ).toEqual(["01_3×5/a_5張_護貝3張.jpg", "01_3×5/b_2張.jpg"]);
  });

  it("adds the quantity and unit to the file name", () => {
    expect(
      zipEntryNames([
        {
          folder: "01_4×6",
          fileName: "IMG_0001.JPG",
          quantity: { n: 3, unit: "張" },
        },
        {
          folder: "證件照/大頭兩吋",
          fileName: "me.jpeg",
          quantity: { n: 2, unit: "組" },
        },
        { folder: "客製化", fileName: "cake.jpg" },
      ]),
    ).toEqual([
      "01_4×6/IMG_0001_3張.jpg",
      "證件照/大頭兩吋/me_2組.jpg",
      "客製化/cake.jpg",
    ]);
  });

  it("keeps duplicate names apart, ignoring case", () => {
    const q = { n: 1, unit: "張" } as const;
    expect(
      zipEntryNames([
        { folder: "01_4×6", fileName: "a.jpg", quantity: q },
        { folder: "01_4×6", fileName: "A.JPG", quantity: q },
        { folder: "01_4×6", fileName: "a.jpg", quantity: q },
        { folder: "02_4×6", fileName: "a.jpg", quantity: q },
      ]),
    ).toEqual([
      "01_4×6/a_1張.jpg",
      "01_4×6/A_1張 (2).jpg",
      "01_4×6/a_1張 (3).jpg",
      "02_4×6/a_1張.jpg",
    ]);
  });

  it("sanitizes folder segments but keeps nesting", () => {
    expect(
      zipEntryNames([{ folder: "證件照/一吋:10張", fileName: "x.jpg" }]),
    ).toEqual(["證件照/一吋_10張/x.jpg"]);
  });
});
