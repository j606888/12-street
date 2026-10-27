// Pure order-total calculation (NT$ integers). Shared by checkout UI and submitOrder.

/**
 * 低消: an order's printing never costs less than this, and neither does its
 * lamination. All sizes count together; ID photos and add-ons don't count.
 */
export const MIN_CHARGE = 10;

export type PricedGroup = {
  unitPrice: number;
  quantities: number[];
  /** Per-print lamination (護貝) price; null/undefined when nothing is laminated. */
  laminationUnitPrice?: number | null;
  /** How many of the group's prints are laminated. */
  laminatedPrints?: number;
};
/** 去背 on an ID photo: a flat fee per photo, however many sets it prints. */
export const BACKGROUND_REMOVAL_PRICE = 50;

export type PricedItem = {
  unitPrice: number;
  quantity: number;
  /** 去背 fee for the item's photo; null/undefined when not requested. */
  backgroundRemovalPrice?: number | null;
};

function assertAmount(n: number, label: string) {
  if (!Number.isSafeInteger(n) || n < 0)
    throw new RangeError(`${label} must be a non-negative integer`);
}

/** What it takes to bring `amount` up to MIN_CHARGE; zero when nothing was ordered. */
export function minimumTopUp(amount: number, count: number): number {
  assertAmount(amount, "amount");
  assertAmount(count, "count");
  if (count === 0) return 0;
  return Math.max(0, MIN_CHARGE - amount);
}

/** One size's list price (before the order-wide 低消). */
export function groupCharges(group: PricedGroup) {
  assertAmount(group.unitPrice, "unitPrice");
  let prints = 0;
  for (const q of group.quantities) {
    assertAmount(q, "quantity");
    prints += q;
  }
  const laminatedPrints = group.laminatedPrints ?? 0;
  assertAmount(laminatedPrints, "laminatedPrints");
  if (laminatedPrints > prints)
    throw new RangeError("laminatedPrints must not exceed prints");
  const printing = group.unitPrice * prints;
  let lamination = 0;
  if (group.laminationUnitPrice != null) {
    assertAmount(group.laminationUnitPrice, "laminationUnitPrice");
    lamination = group.laminationUnitPrice * laminatedPrints;
  }
  return {
    prints,
    laminatedPrints,
    printing,
    lamination,
    total: printing + lamination,
  };
}

/** All sizes together, with printing and lamination each topped up to 低消. */
export function printCharges(groups: PricedGroup[]) {
  let prints = 0;
  let laminatedPrints = 0;
  let printing = 0;
  let lamination = 0;
  for (const g of groups) {
    const c = groupCharges(g);
    prints += c.prints;
    laminatedPrints += c.laminatedPrints;
    printing += c.printing;
    lamination += c.lamination;
  }
  const printingTopUp = minimumTopUp(printing, prints);
  const laminationTopUp = minimumTopUp(lamination, laminatedPrints);
  return {
    prints,
    laminatedPrints,
    printing,
    lamination,
    printingTopUp,
    laminationTopUp,
    total: printing + printingTopUp + lamination + laminationTopUp,
  };
}

export function itemSubtotal(item: PricedItem): number {
  assertAmount(item.unitPrice, "unitPrice");
  assertAmount(item.quantity, "quantity");
  const removal = item.backgroundRemovalPrice ?? 0;
  assertAmount(removal, "backgroundRemovalPrice");
  return item.unitPrice * item.quantity + removal;
}

export function calculateTotal({
  groups,
  items,
}: {
  groups: PricedGroup[];
  items: PricedItem[];
}): number {
  const total =
    printCharges(groups).total +
    items.reduce((sum, i) => sum + itemSubtotal(i), 0);
  assertAmount(total, "total");
  return total;
}
