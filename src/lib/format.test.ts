import { describe, expect, it } from "vitest";
import { formatBytes, formatNtd, formatTaipeiTime } from "./format";

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
