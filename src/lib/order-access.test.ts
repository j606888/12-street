import { describe, expect, it } from "vitest";
import { addAccessId, MAX_ACCESS_IDS, parseAccessIds } from "./order-access";

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

describe("parseAccessIds", () => {
  it("returns nothing for a missing or empty cookie", () => {
    expect(parseAccessIds(undefined)).toEqual([]);
    expect(parseAccessIds("")).toEqual([]);
  });

  it("drops values that are not uuids", () => {
    expect(parseAccessIds(`${id(1)},P20261010-0001,,${id(2)}`)).toEqual([
      id(1),
      id(2),
    ]);
  });

  it("caps the list", () => {
    const value = Array.from({ length: 15 }, (_, i) => id(i)).join(",");
    expect(parseAccessIds(value)).toHaveLength(MAX_ACCESS_IDS);
  });
});

describe("addAccessId", () => {
  it("starts a new list", () => {
    expect(addAccessId(undefined, id(1))).toBe(id(1));
  });

  it("moves an existing id to the front without duplicating it", () => {
    expect(addAccessId(`${id(1)},${id(2)}`, id(2))).toBe(`${id(2)},${id(1)}`);
  });

  it("drops the oldest id when full", () => {
    const full = Array.from({ length: MAX_ACCESS_IDS }, (_, i) => id(i));
    const next = addAccessId(full.join(","), id(99)).split(",");
    expect(next).toHaveLength(MAX_ACCESS_IDS);
    expect(next[0]).toBe(id(99));
    expect(next).not.toContain(id(MAX_ACCESS_IDS - 1));
  });
});
