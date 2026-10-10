import { describe, expect, it } from "vitest";
import {
  calculateTotal,
  groupCharges,
  groupSubtotal,
  itemSubtotal,
  minimumCharge,
  MIN_GROUP_CHARGE,
} from "./pricing";

describe("minimumCharge (低消 10 元)", () => {
  it("charges the minimum when the prints cost less", () => {
    expect(MIN_GROUP_CHARGE).toBe(10);
    expect(minimumCharge(6, 1)).toBe(10); // one 4×6
    expect(minimumCharge(5, 1)).toBe(10); // one 2×3
  });

  it("charges the real price once it reaches the minimum", () => {
    expect(minimumCharge(5, 2)).toBe(10);
    expect(minimumCharge(6, 2)).toBe(12);
    expect(minimumCharge(25, 1)).toBe(25);
  });

  it("is zero when nothing is printed", () => {
    expect(minimumCharge(6, 0)).toBe(0);
  });
});

describe("groupCharges", () => {
  it("multiplies the unit price by the total number of prints", () => {
    expect(groupSubtotal({ unitPrice: 6, quantities: [1, 2, 3] })).toBe(36);
  });

  it("is zero for an empty group", () => {
    expect(groupSubtotal({ unitPrice: 25, quantities: [] })).toBe(0);
  });

  it("adds lamination with its own minimum", () => {
    // one 4×6 laminated: printing 6→10, lamination 5→10
    expect(
      groupCharges({ unitPrice: 6, laminationUnitPrice: 5, quantities: [1] }),
    ).toEqual({
      prints: 1,
      printing: 10,
      lamination: 10,
      total: 20,
    });
    // 3 × 5×7 laminated: 75 + 30
    expect(
      groupSubtotal({
        unitPrice: 25,
        laminationUnitPrice: 10,
        quantities: [1, 2],
      }),
    ).toBe(105);
  });

  it("ignores lamination when not selected", () => {
    expect(
      groupSubtotal({
        unitPrice: 6,
        laminationUnitPrice: null,
        quantities: [3],
      }),
    ).toBe(18);
  });

  it("rejects non-integer or negative amounts", () => {
    expect(() => groupSubtotal({ unitPrice: 8.5, quantities: [1] })).toThrow(
      RangeError,
    );
    expect(() => groupSubtotal({ unitPrice: 8, quantities: [-1] })).toThrow(
      RangeError,
    );
    expect(() => groupSubtotal({ unitPrice: 8, quantities: [1.5] })).toThrow(
      RangeError,
    );
    expect(() =>
      groupSubtotal({ unitPrice: 8, laminationUnitPrice: -5, quantities: [1] }),
    ).toThrow(RangeError);
  });
});

describe("itemSubtotal", () => {
  it("multiplies price by quantity (no minimum)", () => {
    expect(itemSubtotal({ unitPrice: 100, quantity: 2 })).toBe(200);
    expect(itemSubtotal({ unitPrice: 100, quantity: 0 })).toBe(0);
  });
});

describe("calculateTotal", () => {
  it("sums print groups, lamination and ID-photo sets", () => {
    const total = calculateTotal({
      groups: [
        { unitPrice: 6, quantities: Array(20).fill(1) }, // 4×6 × 20 = 120
        { unitPrice: 35, laminationUnitPrice: 15, quantities: [2, 3] }, // 6×8 × 5 = 175 + 75
        { unitPrice: 5, quantities: [1] }, // single 2×3 → 10
      ],
      items: [{ unitPrice: 100, quantity: 2 }], // 2 ID-photo sets
    });
    expect(total).toBe(120 + 175 + 75 + 10 + 200);
  });

  it("is zero for an empty order", () => {
    expect(calculateTotal({ groups: [], items: [] })).toBe(0);
  });

  it("always returns an integer", () => {
    const total = calculateTotal({
      groups: [{ unitPrice: 25, quantities: [7, 99] }],
      items: [],
    });
    expect(Number.isInteger(total)).toBe(true);
    expect(total).toBe(2650);
  });

  it("rejects a bad item price", () => {
    expect(() =>
      calculateTotal({ groups: [], items: [{ unitPrice: -300, quantity: 1 }] }),
    ).toThrow(RangeError);
  });
});
