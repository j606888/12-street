import { describe, expect, it } from "vitest";
import {
  addMonths,
  closedNotice,
  formatDay,
  isClosed,
  monthGrid,
  noticeCells,
  taipeiToday,
  upcomingClosures,
} from "./shop-days";

// 2026-10-30 is a Friday; 10/31–11/1 is the weekend.

describe("taipeiToday", () => {
  it("uses the Taipei calendar day", () => {
    // 16:00 UTC is already midnight the next day in Taipei
    expect(taipeiToday(new Date("2026-10-29T15:59:00Z"))).toBe("2026-10-29");
    expect(taipeiToday(new Date("2026-10-29T16:00:00Z"))).toBe("2026-10-30");
  });
});

describe("isClosed", () => {
  it("closes weekends unless overridden", () => {
    expect(isClosed("2026-10-31", {})).toBe(true);
    expect(isClosed("2026-10-30", {})).toBe(false);
    expect(isClosed("2026-10-31", { "2026-10-31": true })).toBe(false);
    expect(isClosed("2026-11-11", { "2026-11-11": false })).toBe(true);
  });
});

describe("formatDay", () => {
  it("shows month/day and the weekday", () => {
    expect(formatDay("2026-11-02")).toBe("11/2（一）");
  });
});

describe("closedNotice", () => {
  it("stays quiet Monday to Thursday", () => {
    for (const day of ["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29"])
      expect(closedNotice(day, {})).toBeNull();
  });

  it("warns on Friday about the weekend", () => {
    const n = closedNotice("2026-10-30", {})!;
    expect(n.title).toBe("本店週六、週日公休");
    expect(n.closedDays).toEqual(["2026-10-31", "2026-11-01"]);
    expect(n.processDay).toBe("2026-11-02");
    expect(noticeCells(n).map((c) => [c.label, c.date, c.status])).toEqual([
      ["週五", "10/30", "今天"],
      ["週六", "10/31", "店休"],
      ["週日", "11/1", "店休"],
      ["週一", "11/2", "開始處理"],
    ]);
  });

  it("says today is closed on the weekend", () => {
    const sat = closedNotice("2026-10-31", {})!;
    expect(sat.title).toBe("今天店休");
    expect(sat.processDay).toBe("2026-11-02");
    expect(noticeCells(sat).map((c) => c.tone)).toEqual([
      "todayClosed",
      "closed",
      "process",
    ]);
    expect(closedNotice("2026-11-01", {})!.title).toBe("今天店休");
  });

  it("follows days set on the calendar", () => {
    const closedWed = { "2026-11-11": false };
    expect(closedNotice("2026-11-10", closedWed)!.title).toBe("明天店休");
    const wed = closedNotice("2026-11-11", closedWed)!;
    expect(wed.title).toBe("今天店休");
    expect(wed.processDay).toBe("2026-11-12");

    // Open on Saturday: Friday is quiet, Saturday warns about Sunday
    const openSat = { "2026-10-31": true };
    expect(closedNotice("2026-10-30", openSat)).toBeNull();
    const sat = closedNotice("2026-10-31", openSat)!;
    expect(sat.title).toBe("明天店休");
    expect(sat.processDay).toBe("2026-11-02");
  });

  it("folds a long closure into one cell", () => {
    const long = { "2026-11-23": false, "2026-11-24": false };
    const n = closedNotice("2026-11-20", long)!;
    expect(n.title).toBe("明天起店休 4 天");
    expect(n.processDay).toBe("2026-11-25");
    expect(noticeCells(n)).toEqual([
      { label: "週五", date: "11/20", status: "今天", tone: "today" },
      {
        label: "週六～週二",
        date: "11/21–11/24",
        status: "店休 4 天",
        tone: "closed",
        wide: true,
      },
      { label: "週三", date: "11/25", status: "開始處理", tone: "process" },
    ]);
  });
});

describe("monthGrid", () => {
  it("pads the month into Monday-first weeks", () => {
    const grid = monthGrid("2026-11"); // Nov 1 is a Sunday
    expect(grid.length).toBe(42);
    expect(grid.slice(0, 7)).toEqual([
      null,
      null,
      null,
      null,
      null,
      null,
      "2026-11-01",
    ]);
    expect(grid.filter(Boolean).length).toBe(30);
  });
});

describe("addMonths", () => {
  it("rolls over the year", () => {
    expect(addMonths("2026-12", 1)).toBe("2027-01");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
  });
});

describe("upcomingClosures", () => {
  it("lists closed runs with when the notice shows", () => {
    const [weekend, wed] = upcomingClosures(
      "2026-10-28",
      { "2026-11-04": false },
      2,
    );
    expect(weekend).toEqual({
      start: "2026-10-31",
      end: "2026-11-01",
      days: 2,
      manual: false,
      noticeFrom: "2026-10-30",
      processDay: "2026-11-02",
    });
    expect(wed).toMatchObject({ start: "2026-11-04", days: 1, manual: true });
  });
});
