import { describe, expect, it } from "vitest";
import { firstParam, memberFilterInput, orderFilterInput } from "./admin";

describe("orderFilterInput", () => {
  it("keeps valid filters", () => {
    expect(
      orderFilterInput.parse({
        payment: "pending_review",
        status: "ready",
        q: " 0912 ",
        page: "3",
      }),
    ).toEqual({
      payment: "pending_review",
      status: "ready",
      q: "0912",
      page: 3,
    });
  });

  it("drops invalid values instead of failing", () => {
    expect(
      orderFilterInput.parse({ payment: "free", status: "draft", page: "-2" }),
    ).toEqual({ payment: undefined, status: undefined, page: 1 });
  });
});

describe("memberFilterInput", () => {
  it("parses the tag id", () => {
    expect(memberFilterInput.parse({ tag: "2" }).tag).toBe(2);
    expect(memberFilterInput.parse({ tag: "x" }).tag).toBeUndefined();
  });
});

describe("firstParam", () => {
  it("takes the first of repeated params", () => {
    expect(firstParam(["a", "b"])).toBe("a");
    expect(firstParam("a")).toBe("a");
    expect(firstParam(undefined)).toBeUndefined();
  });
});
