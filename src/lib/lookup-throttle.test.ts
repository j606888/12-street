import { describe, expect, it } from "vitest";
import {
  isLookupThrottled,
  LOOKUP_MAX_FAILURES,
  lookupWindowStart,
} from "./lookup-throttle";

describe("lookup throttle", () => {
  it("looks back one hour", () => {
    expect(lookupWindowStart(new Date("2026-10-10T05:00:00Z"))).toEqual(
      new Date("2026-10-10T04:00:00Z"),
    );
  });

  it("blocks once the failure limit is reached", () => {
    expect(isLookupThrottled(0)).toBe(false);
    expect(isLookupThrottled(LOOKUP_MAX_FAILURES - 1)).toBe(false);
    expect(isLookupThrottled(LOOKUP_MAX_FAILURES)).toBe(true);
  });
});
