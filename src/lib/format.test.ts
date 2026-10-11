import { describe, expect, it } from "vitest";
import {
  daysUntil,
  formatBytes,
  formatNtd,
  formatTaipeiDate,
  formatTaipeiTime,
} from "./format";

describe("formatNtd", () => {
  it("adds thousands separators", () => {
    expect(formatNtd(1380)).toBe("NT$ 1,380");
  });
});

describe("formatTaipeiTime", () => {
  it("shows the time in Asia/Taipei", () => {
    // 16:00 UTC is midnight the next day in Taipei
    expect(formatTaipeiTime(new Date("2026-10-10T16:00:00Z"))).toContain(
      "2026年10月11日",
    );
  });
});

describe("formatBytes", () => {
  it("picks a readable unit", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(12117274)).toBe("11.6 MB");
    expect(formatBytes(3 * 1024 ** 3)).toBe("3.0 GB");
  });
});

describe("formatTaipeiDate", () => {
  it("uses the Taipei calendar day and weekday", () => {
    expect(formatTaipeiDate(new Date("2026-10-10T16:00:00Z"))).toBe(
      "2026年10月11日 星期日",
    );
  });
});

describe("daysUntil", () => {
  const now = new Date("2026-10-11T00:00:00Z");
  it("rounds partial days up", () => {
    expect(daysUntil(new Date("2026-10-11T01:00:00Z"), now)).toBe(1);
    expect(daysUntil(new Date("2026-10-14T00:00:00Z"), now)).toBe(3);
  });
  it("never goes negative", () => {
    expect(daysUntil(new Date("2026-10-01T00:00:00Z"), now)).toBe(0);
  });
});
