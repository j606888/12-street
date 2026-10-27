import { describe, expect, it } from "vitest";
import {
  calculateTotal,
  groupCharges,
  itemSubtotal,
  MIN_CHARGE,
  minimumTopUp,
  printCharges,
} from "./pricing";

describe("minimumTopUp (低消 10 元)", () => {
  it("tops up whatever is below the minimum", () => {
    expect(MIN_CHARGE).toBe(10);
    expect(minimumTopUp(6, 1)).toBe(4); // one 4×6
    expect(minimumTopUp(5, 1)).toBe(5); // one 2×3
  });

  it("adds nothing once the minimum is reached", () => {
    expect(minimumTopUp(10, 2)).toBe(0);
    expect(minimumTopUp(25, 1)).toBe(0);
  });

  it("is zero when nothing is ordered", () => {
    expect(minimumTopUp(0, 0)).toBe(0);
  });
});

describe("groupCharges", () => {
  it("multiplies the unit price by the total number of prints", () => {
    expect(groupCharges({ unitPrice: 6, quantities: [1, 2, 3] }).total).toBe(
      36,
    );
  });

  it("is zero for an empty group", () => {
    expect(groupCharges({ unitPrice: 25, quantities: [] }).total).toBe(0);
  });

  it("charges lamination only for the laminated prints, without a minimum", () => {
    // 5 × 3×5, 3 of them laminated: 25 + 15
    expect(
      groupCharges({
        unitPrice: 5,
        laminationUnitPrice: 5,
        laminatedPrints: 3,
        quantities: [5],
      }),
    ).toEqual({
      prints: 5,
      laminatedPrints: 3,
      printing: 25,
      lamination: 15,
      total: 40,
    });
    // one 4×6 laminated: list price only, 低消 is applied order-wide
    expect(
      groupCharges({
        unitPrice: 6,
        laminationUnitPrice: 5,
        laminatedPrints: 1,
        quantities: [1],
      }).total,
    ).toBe(11);
  });

  it("ignores lamination when not selected", () => {
    expect(
      groupCharges({ unitPrice: 6, laminationUnitPrice: null, quantities: [3] })
        .total,
    ).toBe(18);
  });

  it("rejects more laminated prints than prints", () => {
    expect(() =>
      groupCharges({
        unitPrice: 5,
        laminationUnitPrice: 5,
        laminatedPrints: 6,
        quantities: [5],
      }),
    ).toThrow(RangeError);
  });

  it("rejects non-integer or negative amounts", () => {
    expect(() => groupCharges({ unitPrice: 8.5, quantities: [1] })).toThrow(
      RangeError,
    );
    expect(() => groupCharges({ unitPrice: 8, quantities: [-1] })).toThrow(
      RangeError,
    );
    expect(() => groupCharges({ unitPrice: 8, quantities: [1.5] })).toThrow(
      RangeError,
    );
    expect(() =>
      groupCharges({
        unitPrice: 8,
        laminationUnitPrice: -5,
        laminatedPrints: 1,
        quantities: [1],
      }),
    ).toThrow(RangeError);
  });
});

describe("printCharges (低消 across all sizes)", () => {
  // 3×5: $5 a print, $5 to laminate
  const photos = (prints: number, laminated = 0) =>
    Array.from({ length: prints }, (_, i) => ({
      unitPrice: 5,
      laminationUnitPrice: i < laminated ? 5 : null,
      laminatedPrints: i < laminated ? 1 : 0,
      quantities: [1],
    }));

  it("matches the owner's examples", () => {
    expect(printCharges(photos(1)).total).toBe(10);
    expect(printCharges(photos(2)).total).toBe(10);
    expect(printCharges(photos(1, 1)).total).toBe(20);
    expect(printCharges(photos(2, 1)).total).toBe(20);
    expect(printCharges(photos(2, 2)).total).toBe(20);
    expect(printCharges(photos(3, 2)).total).toBe(25);
  });

  it("counts different sizes together", () => {
    // one 2×3 + one 3×5 = 10, not 10 + 10
    expect(
      printCharges([
        { unitPrice: 5, quantities: [1] },
        { unitPrice: 5, quantities: [1] },
      ]),
    ).toMatchObject({ printing: 10, printingTopUp: 0, total: 10 });
    // one 2×3 laminated + one 4×6 laminated: 11 + 10
    expect(
      printCharges([
        {
          unitPrice: 5,
          laminationUnitPrice: 5,
          laminatedPrints: 1,
          quantities: [1],
        },
        {
          unitPrice: 6,
          laminationUnitPrice: 5,
          laminatedPrints: 1,
          quantities: [1],
        },
      ]),
    ).toMatchObject({ printingTopUp: 0, laminationTopUp: 0, total: 21 });
  });

  it("tops up printing and lamination separately", () => {
    expect(
      printCharges([
        {
          unitPrice: 6,
          laminationUnitPrice: 5,
          laminatedPrints: 1,
          quantities: [1],
        },
      ]),
    ).toEqual({
      prints: 1,
      laminatedPrints: 1,
      printing: 6,
      lamination: 5,
      printingTopUp: 4,
      laminationTopUp: 5,
      total: 20,
    });
    // printing well over the minimum, one lamination still topped up
    expect(
      printCharges([
        {
          unitPrice: 25,
          laminationUnitPrice: 5,
          laminatedPrints: 1,
          quantities: [1],
        },
      ]).total,
    ).toBe(25 + 10);
  });

  it("is zero with no prints", () => {
    expect(printCharges([]).total).toBe(0);
    expect(printCharges([{ unitPrice: 5, quantities: [] }]).total).toBe(0);
  });
});

describe("itemSubtotal", () => {
  it("multiplies price by quantity (no minimum)", () => {
    expect(itemSubtotal({ unitPrice: 100, quantity: 2 })).toBe(200);
    expect(itemSubtotal({ unitPrice: 100, quantity: 0 })).toBe(0);
  });

  it("adds 去背 once, however many sets", () => {
    expect(
      itemSubtotal({ unitPrice: 100, quantity: 3, backgroundRemovalPrice: 50 }),
    ).toBe(350);
    expect(
      itemSubtotal({ unitPrice: 0, quantity: 1, backgroundRemovalPrice: 50 }),
    ).toBe(50);
    expect(
      itemSubtotal({ unitPrice: 100, quantity: 1, backgroundRemovalPrice: null }),
    ).toBe(100);
  });
});

describe("calculateTotal", () => {
  it("sums print groups, lamination and ID-photo sets", () => {
    const total = calculateTotal({
      groups: [
        { unitPrice: 6, quantities: Array(20).fill(1) }, // 4×6 × 20 = 120
        // 6×8 × 5 = 175 + 75
        {
          unitPrice: 35,
          laminationUnitPrice: 15,
          laminatedPrints: 5,
          quantities: [2, 3],
        },
        { unitPrice: 5, quantities: [1] }, // single 2×3, already over 低消 → 5
      ],
      items: [{ unitPrice: 100, quantity: 2 }], // 2 ID-photo sets
    });
    expect(total).toBe(120 + 175 + 75 + 5 + 200);
  });

  it("doesn't count ID photos toward the print minimum", () => {
    expect(
      calculateTotal({
        groups: [{ unitPrice: 5, quantities: [1] }],
        items: [{ unitPrice: 100, quantity: 1 }],
      }),
    ).toBe(10 + 100);
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
