import { describe, expect, it } from "vitest";
import {
  addMemberTagInput,
  firstParam,
  memberFilterInput,
  orderFilterInput,
  photoViewInput,
  updateMemberInput,
  updateMemberNoteInput,
} from "./admin";

describe("orderFilterInput", () => {
  it("keeps valid filters", () => {
    expect(
      orderFilterInput.parse({
        payment: "pending_review",
        tab: "ready",
        q: " 0912 ",
        page: "3",
      }),
    ).toEqual({
      payment: "pending_review",
      tab: "ready",
      q: "0912",
      page: 3,
    });
  });

  it("drops invalid values instead of failing", () => {
    expect(
      orderFilterInput.parse({ payment: "free", tab: "draft", page: "-2" }),
    ).toEqual({ tab: "todo", payment: undefined, page: 1 });
  });

  it("defaults to the todo tab, or all orders when searching", () => {
    expect(orderFilterInput.parse({}).tab).toBe("todo");
    expect(orderFilterInput.parse({ q: "0912" }).tab).toBe("all");
    expect(orderFilterInput.parse({ member: "u1" }).tab).toBe("all");
    expect(orderFilterInput.parse({ payment: "paid" }).tab).toBe("all");
    expect(orderFilterInput.parse({ q: "0912", tab: "ready" }).tab).toBe(
      "ready",
    );
  });
});

describe("photoViewInput", () => {
  it("falls back to soonest expiry", () => {
    expect(photoViewInput.parse("big")).toBe("big");
    expect(photoViewInput.parse("nope")).toBe("soon");
    expect(photoViewInput.parse(undefined)).toBe("soon");
  });
});

describe("addMemberTagInput", () => {
  const parse = (name: string) =>
    addMemberTagInput.safeParse({ userId: "u1", name });

  it("trims the name", () => {
    expect(parse("  常客 ").data?.name).toBe("常客");
  });

  it("rejects empty, long or multi-line names", () => {
    expect(parse("   ").success).toBe(false);
    expect(parse("一".repeat(21)).success).toBe(false);
    expect(parse("a\nb").success).toBe(false);
    expect(parse("一".repeat(20)).success).toBe(true);
  });
});

describe("updateMemberInput", () => {
  const parse = (name: string, phone: string) =>
    updateMemberInput.safeParse({ userId: "u1", name, phone });

  it("normalizes the phone and trims the name", () => {
    expect(parse(" 小明 ", "0912-345-678").data).toEqual({
      userId: "u1",
      name: "小明",
      phone: "0912345678",
    });
  });

  it("treats a blank phone as none", () => {
    expect(parse("小明", "  ").data?.phone).toBeNull();
  });

  it("rejects a bad phone or an empty name", () => {
    expect(parse("小明", "12345").success).toBe(false);
    expect(parse("  ", "0912345678").success).toBe(false);
  });
});

describe("updateMemberNoteInput", () => {
  it("keeps line breaks and caps the length", () => {
    const parse = (note: string) =>
      updateMemberNoteInput.safeParse({ userId: "u1", note });
    expect(parse(" 第一行\n第二行 ").data?.note).toBe("第一行\n第二行");
    expect(parse("").data?.note).toBe("");
    expect(parse("一".repeat(2001)).success).toBe(false);
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
