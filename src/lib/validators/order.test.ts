import { describe, expect, it } from "vitest";
import { emailSchema, lookupOrderInput, orderNoSchema } from "./order";

describe("orderNoSchema", () => {
  it("normalizes case and whitespace", () => {
    expect(orderNoSchema.parse(" p20261010-0001 ")).toBe("P20261010-0001");
  });

  it("rejects other shapes", () => {
    for (const s of ["", "P2026101-0001", "20261010-0001", "P20261010-01"]) {
      expect(orderNoSchema.safeParse(s).success).toBe(false);
    }
  });
});

describe("lookupOrderInput", () => {
  it("normalizes the phone number", () => {
    expect(
      lookupOrderInput.parse({
        orderNo: "P20261010-0002",
        phone: "0987-654 321",
      }),
    ).toEqual({ orderNo: "P20261010-0002", phone: "0987654321" });
  });
});

describe("emailSchema", () => {
  it("trims and lowercases", () => {
    expect(emailSchema.parse("  Guest@Example.COM ")).toBe("guest@example.com");
  });

  it("rejects malformed addresses", () => {
    expect(emailSchema.safeParse("guest@").success).toBe(false);
    expect(emailSchema.safeParse("").success).toBe(false);
  });
});
