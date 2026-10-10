import { describe, expect, it } from "vitest";
import { calculateTotal, groupSubtotal, itemSubtotal } from "./pricing";

describe("groupSubtotal", () => {
  it("multiplies the unit price by the total number of prints", () => {
    expect(groupSubtotal({ unitPrice: 8, quantities: [1, 2, 3] })).toBe(48);
  });

  it("is zero for an empty group", () => {
    expect(groupSubtotal({ unitPrice: 15, quantities: [] })).toBe(0);
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
  });
});

describe("itemSubtotal", () => {
  it("multiplies price by quantity", () => {
    expect(itemSubtotal({ unitPrice: 350, quantity: 2 })).toBe(700);
  });

  it("allows quantity 0", () => {
    expect(itemSubtotal({ unitPrice: 350, quantity: 0 })).toBe(0);
  });
});

describe("calculateTotal", () => {
  it("sums print groups of different sizes and add-on products", () => {
    const total = calculateTotal({
      groups: [
        { unitPrice: 8, quantities: Array(20).fill(1) }, // 4R × 20 = 160
        { unitPrice: 25, quantities: [2, 3] }, // 6R × 5 = 125
      ],
      items: [
        { unitPrice: 300, quantity: 1 }, // album
        { unitPrice: 350, quantity: 2 }, // mugs
      ],
    });
    expect(total).toBe(160 + 125 + 300 + 700);
  });

  it("is zero for an empty order", () => {
    expect(calculateTotal({ groups: [], items: [] })).toBe(0);
  });

  it("always returns an integer", () => {
    const total = calculateTotal({
      groups: [{ unitPrice: 15, quantities: [7, 99] }],
      items: [],
    });
    expect(Number.isInteger(total)).toBe(true);
    expect(total).toBe(1590);
  });

  it("rejects a bad item price", () => {
    expect(() =>
      calculateTotal({ groups: [], items: [{ unitPrice: -300, quantity: 1 }] }),
    ).toThrow(RangeError);
  });
});
