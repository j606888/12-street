import { describe, expect, it } from "vitest";
import { isCronAuthorized } from "./cron-auth";

const secret = "s3cr3t-value-for-tests";

describe("isCronAuthorized", () => {
  it("accepts the bearer secret", () => {
    expect(isCronAuthorized(`Bearer ${secret}`, secret)).toBe(true);
  });

  it("rejects a wrong or missing header", () => {
    expect(isCronAuthorized(`Bearer ${secret}x`, secret)).toBe(false);
    expect(isCronAuthorized(secret, secret)).toBe(false);
    expect(isCronAuthorized(null, secret)).toBe(false);
  });

  it("rejects everything when the secret is unset or short", () => {
    expect(isCronAuthorized("Bearer ", "")).toBe(false);
    expect(isCronAuthorized("Bearer undefined", undefined)).toBe(false);
    expect(isCronAuthorized("Bearer short", "short")).toBe(false);
  });
});
