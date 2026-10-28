// Which days the shop is open (營業日), the closed-day notice on the order
// page and the admin calendar's helpers. Days are "YYYY-MM-DD" strings on the
// Asia/Taipei calendar. Sat/Sun are closed unless /admin/calendar says
// otherwise; only days that differ from that default are stored (shop_days).

/** A Taipei calendar day, e.g. "2026-10-30". */
export type DayKey = string;
/** A calendar month, e.g. "2026-11". */
export type MonthKey = string;
/** Days set on the admin calendar: day → open. */
export type DayOverrides = Record<DayKey, boolean>;

const WEEKDAYS = "日一二三四五六";

const taipeiDay = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Taipei",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Today's date in Taipei. */
export function taipeiToday(now: Date): DayKey {
  const parts = taipeiDay.formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

const toUtc = (day: DayKey) => new Date(`${day}T00:00:00Z`);
const fromUtc = (d: Date): DayKey => d.toISOString().slice(0, 10);

export function addDays(day: DayKey, n: number): DayKey {
  const d = toUtc(day);
  d.setUTCDate(d.getUTCDate() + n);
  return fromUtc(d);
}

/** 0 = Sunday … 6 = Saturday */
export const weekday = (day: DayKey) => toUtc(day).getUTCDay();

export function isClosedByDefault(day: DayKey) {
  const w = weekday(day);
  return w === 0 || w === 6;
}

export function isClosed(day: DayKey, overrides: DayOverrides) {
  const open = overrides[day];
  return open === undefined ? isClosedByDefault(day) : !open;
}

/** "11/2" */
export const formatShortDay = (day: DayKey) =>
  `${Number(day.slice(5, 7))}/${Number(day.slice(8, 10))}`;

/** "11/2（一）" */
export const formatDay = (day: DayKey) =>
  `${formatShortDay(day)}（${WEEKDAYS[weekday(day)]}）`;

/** "週一" */
export const weekdayLabel = (day: DayKey) => `週${WEEKDAYS[weekday(day)]}`;

// ---- Closed-day notice on /order ----

/** How far ahead to look for the next open day. */
export const NOTICE_LOOKAHEAD = 60;

export type ClosedNotice = {
  today: DayKey;
  title: string;
  closedToday: boolean;
  /** The closed run: from today if closed, otherwise from tomorrow. */
  closedDays: DayKey[];
  /** First open day after today; orders sent today are handled then. */
  processDay: DayKey;
};

/**
 * Shown on a closed day and on the day before one; other days get null. Also
 * null when nothing is open within the lookahead, since there's no date to promise.
 */
export function closedNotice(
  today: DayKey,
  overrides: DayOverrides,
): ClosedNotice | null {
  const closedToday = isClosed(today, overrides);
  let day = addDays(today, 1);
  if (!closedToday && !isClosed(day, overrides)) return null;

  const closedDays = closedToday ? [today] : [];
  for (let i = 0; i < NOTICE_LOOKAHEAD && isClosed(day, overrides); i++) {
    closedDays.push(day);
    day = addDays(day, 1);
  }
  if (isClosed(day, overrides)) return null;
  return {
    today,
    title: noticeTitle(closedToday, closedDays),
    closedToday,
    closedDays,
    processDay: day,
  };
}

function noticeTitle(closedToday: boolean, closedDays: DayKey[]) {
  if (closedToday) return "今天店休";
  if (closedDays.length === 2 && weekday(closedDays[0]) === 6)
    return "本店週六、週日公休";
  return closedDays.length === 1
    ? "明天店休"
    : `明天起店休 ${closedDays.length} 天`;
}

export type NoticeCell = {
  label: string;
  date: string;
  status: string;
  tone: "today" | "todayClosed" | "closed" | "process";
  /** Several closed days folded into one cell, two columns wide. */
  wide?: boolean;
};

/** The day strip in the notice: today → closed days → the day work resumes. */
export function noticeCells(n: ClosedNotice): NoticeCell[] {
  const cells: NoticeCell[] = [];
  const later = n.closedToday ? n.closedDays.slice(1) : n.closedDays;
  if (n.closedToday)
    cells.push({
      label: `${weekdayLabel(n.today)} 今天`,
      date: formatShortDay(n.today),
      status: "店休",
      tone: "todayClosed",
    });
  else
    cells.push({
      label: weekdayLabel(n.today),
      date: formatShortDay(n.today),
      status: "今天",
      tone: "today",
    });

  // Up to two closed days get a cell each; a longer run is folded into one
  if (later.length <= 2)
    for (const day of later)
      cells.push({
        label: weekdayLabel(day),
        date: formatShortDay(day),
        status: "店休",
        tone: "closed",
      });
  else {
    const first = later[0];
    const last = later[later.length - 1];
    cells.push({
      label: `${weekdayLabel(first)}～${weekdayLabel(last)}`,
      date: `${formatShortDay(first)}–${formatShortDay(last)}`,
      status: `店休 ${later.length} 天`,
      tone: "closed",
      wide: true,
    });
  }

  cells.push({
    label: weekdayLabel(n.processDay),
    date: formatShortDay(n.processDay),
    status: "開始處理",
    tone: "process",
  });
  return cells;
}

// ---- Admin calendar ----

export const monthOf = (day: DayKey): MonthKey => day.slice(0, 7);

export function addMonths(month: MonthKey, n: number): MonthKey {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return fromUtc(d).slice(0, 7);
}

/** "2026 年 11 月" */
export const formatMonth = (month: MonthKey) =>
  `${month.slice(0, 4)} 年 ${Number(month.slice(5, 7))} 月`;

/** The month's days in Monday-first weeks, padded with nulls. */
export function monthGrid(month: MonthKey): (DayKey | null)[] {
  const first: DayKey = `${month}-01`;
  const lead = (weekday(first) + 6) % 7;
  const days: (DayKey | null)[] = Array(lead).fill(null);
  for (let day = first; monthOf(day) === month; day = addDays(day, 1))
    days.push(day);
  while (days.length % 7) days.push(null);
  return days;
}

export type Closure = {
  start: DayKey;
  end: DayKey;
  days: number;
  /** Some day in it was set by hand rather than the default week. */
  manual: boolean;
  /** Customers see the notice from this day through `end`. */
  noticeFrom: DayKey;
  processDay: DayKey;
};

/** The next `limit` closed runs from today on, within about half a year. */
export function upcomingClosures(
  today: DayKey,
  overrides: DayOverrides,
  limit: number,
): Closure[] {
  const out: Closure[] = [];
  let run: DayKey[] = [];
  for (let i = 0; i < 190 && out.length < limit; i++) {
    const day = addDays(today, i);
    if (isClosed(day, overrides)) {
      run.push(day);
      continue;
    }
    if (!run.length) continue;
    out.push({
      start: run[0],
      end: run[run.length - 1],
      days: run.length,
      manual: run.some((d) => d in overrides),
      noticeFrom: run[0] > today ? addDays(run[0], -1) : today,
      processDay: day,
    });
    run = [];
  }
  return out;
}
