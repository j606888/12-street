// Pure order-total calculation (NT$ integers). Shared by checkout UI and submitOrder.

/** 低消: a print group's printing (and lamination) never costs less than this. */
export const MIN_GROUP_CHARGE = 10;

export type PricedGroup = {
  unitPrice: number;
  quantities: number[];
  /** Per-print lamination (護貝) price; null/undefined when nothing is laminated. */
  laminationUnitPrice?: number | null;
  /** How many of the group's prints are laminated. */
  laminatedPrints?: number;
};
export type PricedItem = { unitPrice: number; quantity: number };

function assertAmount(n: number, label: string) {
  if (!Number.isSafeInteger(n) || n < 0)
    throw new RangeError(`${label} must be a non-negative integer`);
}

/** unitPrice × prints, but at least MIN_GROUP_CHARGE when anything is printed. */
export function minimumCharge(unitPrice: number, prints: number): number {
  assertAmount(unitPrice, "unitPrice");
  assertAmount(prints, "prints");
  if (prints === 0) return 0;
  return Math.max(MIN_GROUP_CHARGE, unitPrice * prints);
}

export function groupCharges(group: PricedGroup) {
  let prints = 0;
  for (const q of group.quantities) {
    assertAmount(q, "quantity");
    prints += q;
  }
  const printing = minimumCharge(group.unitPrice, prints);
  const laminatedPrints = group.laminatedPrints ?? 0;
  assertAmount(laminatedPrints, "laminatedPrints");
  if (laminatedPrints > prints)
    throw new RangeError("laminatedPrints must not exceed prints");
  const lamination =
    group.laminationUnitPrice == null
      ? 0
      : minimumCharge(group.laminationUnitPrice, laminatedPrints);
  return {
    prints,
    laminatedPrints,
    printing,
    lamination,
    total: printing + lamination,
  };
}

export function groupSubtotal(group: PricedGroup): number {
  return groupCharges(group).total;
}

export function itemSubtotal(item: PricedItem): number {
  assertAmount(item.unitPrice, "unitPrice");
  assertAmount(item.quantity, "quantity");
  return item.unitPrice * item.quantity;
}

export function calculateTotal({
  groups,
  items,
}: {
  groups: PricedGroup[];
  items: PricedItem[];
}): number {
  const total =
    groups.reduce((sum, g) => sum + groupSubtotal(g), 0) +
    items.reduce((sum, i) => sum + itemSubtotal(i), 0);
  assertAmount(total, "total");
  return total;
}
