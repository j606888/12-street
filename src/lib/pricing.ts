// Pure order-total calculation (NT$ integers). Shared by checkout UI and submitOrder.

export type PricedGroup = { unitPrice: number; quantities: number[] };
export type PricedItem = { unitPrice: number; quantity: number };

function assertAmount(n: number, label: string) {
  if (!Number.isSafeInteger(n) || n < 0)
    throw new RangeError(`${label} must be a non-negative integer`);
}

export function groupSubtotal(group: PricedGroup): number {
  assertAmount(group.unitPrice, "unitPrice");
  let prints = 0;
  for (const q of group.quantities) {
    assertAmount(q, "quantity");
    prints += q;
  }
  return group.unitPrice * prints;
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
