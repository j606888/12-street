import { describe, expect, it } from "vitest";
import { cutoff, RETENTION_DAYS, RETENTION_MS } from "./retention";

describe("retention", () => {
  it("keeps files for 30 days", () => {
    expect(RETENTION_DAYS).toBe(30);
    expect(RETENTION_MS).toBe(30 * 24 * 60 * 60 * 1000);
  });

  it("computes the cutoff before now", () => {
    expect(
      cutoff(new Date("2026-10-31T00:00:00Z"), RETENTION_MS).toISOString(),
    ).toBe("2026-10-01T00:00:00.000Z");
  });
});
