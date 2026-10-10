// Order numbers look like P20261009-0001: Taipei calendar day + daily sequence.

const taipeiDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Taipei",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** YYYYMMDD of `date` in Asia/Taipei — the key of order_counters. */
export function taipeiDayKey(date: Date): string {
  return taipeiDate.format(date).replaceAll("-", "");
}

export function formatOrderNo(dayKey: string, seq: number): string {
  if (!/^\d{8}$/.test(dayKey))
    throw new RangeError(`invalid day key: ${dayKey}`);
  if (!Number.isSafeInteger(seq) || seq < 1)
    throw new RangeError(`invalid sequence: ${seq}`);
  return `P${dayKey}-${String(seq).padStart(4, "0")}`;
}
