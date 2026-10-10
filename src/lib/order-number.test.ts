import { describe, expect, it } from "vitest";
import { formatOrderNo, taipeiDayKey } from "./order-number";

describe("taipeiDayKey", () => {
  it("uses the Asia/Taipei calendar day (UTC+8)", () => {
    expect(taipeiDayKey(new Date("2026-10-09T03:00:00Z"))).toBe("20261009");
  });

  it("rolls over to the next day at 16:00 UTC", () => {
    expect(taipeiDayKey(new Date("2026-10-09T15:59:59Z"))).toBe("20261009");
    expect(taipeiDayKey(new Date("2026-10-09T16:00:00Z"))).toBe("20261010");
  });

  it("handles month and year boundaries", () => {
    expect(taipeiDayKey(new Date("2026-12-31T16:30:00Z"))).toBe("20270101");
    expect(taipeiDayKey(new Date("2028-02-28T16:00:00Z"))).toBe("20280229");
  });
});

describe("formatOrderNo", () => {
  it("formats P{YYYYMMDD}-{0001}", () => {
    expect(formatOrderNo("20261009", 1)).toBe("P20261009-0001");
    expect(formatOrderNo("20261009", 42)).toBe("P20261009-0042");
    expect(formatOrderNo("20261009", 9999)).toBe("P20261009-9999");
  });

  it("keeps working past 9999 orders a day", () => {
    expect(formatOrderNo("20261009", 10000)).toBe("P20261009-10000");
  });

  it("rejects invalid input", () => {
    expect(() => formatOrderNo("2026-10-09", 1)).toThrow(RangeError);
    expect(() => formatOrderNo("20261009", 0)).toThrow(RangeError);
    expect(() => formatOrderNo("20261009", 1.5)).toThrow(RangeError);
  });
});
