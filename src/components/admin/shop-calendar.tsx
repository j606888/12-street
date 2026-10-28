"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { setShopDay } from "@/actions/admin";
import { btn, Card, PILL } from "@/components/admin/ui";
import {
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "@/components/icons";
import {
  addDays,
  addMonths,
  formatDay,
  formatMonth,
  formatShortDay,
  isClosed,
  isClosedByDefault,
  monthGrid,
  monthOf,
  upcomingClosures,
  type DayKey,
  type DayOverrides,
  type MonthKey,
} from "@/lib/shop-days";

const STRIPES =
  "bg-[repeating-linear-gradient(135deg,#eef0f3_0_7px,#e5e8ec_7px_14px)]";
const navBtn =
  "border-admin-field text-ink hover:bg-admin-hover grid size-10 place-items-center rounded-lg border bg-white";

type Status = { text: string; saved?: boolean; error?: boolean };

/**
 * Month view of the shop calendar. A click flips a day between open and
 * closed and saves right away; the default week (Sat/Sun closed) isn't stored.
 */
export function ShopCalendar({
  month,
  today,
  overrides: initial,
}: {
  month: MonthKey;
  today: DayKey;
  overrides: DayOverrides;
}) {
  const [overrides, setOverrides] = useState(initial);
  const [status, setStatus] = useState<Status | null>(null);
  const [, startTransition] = useTransition();

  function toggle(day: DayKey) {
    const before = overrides[day];
    const open = isClosed(day, overrides);
    const apply = (value: boolean | undefined) =>
      setOverrides((cur) => {
        const next = { ...cur };
        if (value === undefined) delete next[day];
        else next[day] = value;
        return next;
      });
    apply(open === !isClosedByDefault(day) ? undefined : open);
    const change = `${formatDay(day)} 改成${open ? "上班" : "店休"}`;
    setStatus({ text: `儲存中：${change}` });
    startTransition(async () => {
      const res = await setShopDay({ day, open }).catch(() => null);
      if (res?.ok) {
        setStatus({ text: `已儲存：${change}`, saved: true });
        return;
      }
      apply(before);
      setStatus({ text: res?.error ?? "儲存失敗，請再試一次", error: true });
    });
  }

  const todayClosed = isClosed(today, overrides);
  const tomorrowClosed = isClosed(addDays(today, 1), overrides);

  return (
    <div className="flex flex-wrap items-start gap-5">
      <section
        aria-label="營業日月曆"
        className="border-admin-line min-w-0 flex-[999_1_520px] overflow-hidden rounded-xl border bg-white"
      >
        <div className="border-admin-line-soft flex flex-wrap items-center gap-2 border-b py-3 pr-4 pl-3">
          <Link
            href={`/admin/calendar?month=${addMonths(month, -1)}`}
            aria-label="上個月"
            className={navBtn}
          >
            <ChevronLeftIcon className="size-[18px]" />
          </Link>
          <h2 className="min-w-30 text-center text-base font-semibold tabular-nums">
            {formatMonth(month)}
          </h2>
          <Link
            href={`/admin/calendar?month=${addMonths(month, 1)}`}
            aria-label="下個月"
            className={navBtn}
          >
            <ChevronRightIcon className="size-[18px]" />
          </Link>
          <p
            aria-live="polite"
            className={`ml-auto flex items-center gap-1.5 text-[13px] ${
              status?.error
                ? "text-danger-fg"
                : status?.saved
                  ? "text-ok-fg"
                  : "text-ink-4"
            }`}
          >
            {status?.saved && <CheckIcon className="size-3.5" />}
            {status?.text ?? "改完自動儲存"}
          </p>
          {month !== monthOf(today) && (
            <Link href="/admin/calendar" className={btn.secondary}>
              回到本月
            </Link>
          )}
        </div>

        <div className="text-ink-3 flex flex-wrap gap-4 px-5 pt-3 text-xs">
          <span className="flex items-center gap-1.5">
            <span className="border-admin-line size-3.5 rounded border bg-white" />
            上班
          </span>
          <span className="flex items-center gap-1.5">
            <span
              className={`border-admin-field size-3.5 rounded border ${STRIPES}`}
            />
            店休
          </span>
          <span className="flex items-center gap-1.5">
            <span className="bg-accent size-2 rounded-full" />
            和預設不同（手動改過）
          </span>
        </div>

        <div className="grid gap-1.5 px-2.5 pt-3 pb-5 sm:px-5">
          <div
            aria-hidden="true"
            className="text-ink-4 grid grid-cols-7 gap-1 text-center text-xs font-medium sm:gap-1.5"
          >
            {[..."一二三四五六日"].map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
            {monthGrid(month).map((day, i) =>
              day ? (
                <DayCell
                  key={day}
                  day={day}
                  today={today}
                  overrides={overrides}
                  onToggle={toggle}
                />
              ) : (
                <span key={`pad-${i}`} aria-hidden="true" />
              ),
            )}
          </div>
        </div>
      </section>

      <Card title="接下來的店休" className="min-w-0 flex-[1_1_280px]">
        <div className="border-admin-line-soft bg-admin-hover grid gap-0.5 border-b px-5 py-3.5">
          <span className="font-semibold">
            今天 {formatDay(today)}・{todayClosed ? "店休" : "上班"}
          </span>
          <span className="text-ink-3 text-[13px]">
            {todayClosed
              ? "客人打開下單頁會看到「今天店休」"
              : tomorrowClosed
                ? "明天店休，客人今天就會看到提醒"
                : "客人今天不會看到店休提醒"}
          </span>
        </div>
        <ul className="divide-admin-line-soft divide-y">
          {upcomingClosures(today, overrides, 6).map((c) => (
            <li key={c.start} className="grid gap-1 px-5 py-3">
              <div className="flex items-start gap-2">
                <span className="flex-1 font-semibold tabular-nums">
                  {c.days === 1
                    ? formatDay(c.start)
                    : `${formatDay(c.start)}～${formatDay(c.end)}`}
                </span>
                {c.manual && (
                  <span className={`${PILL} bg-accent-soft text-accent-dark`}>
                    手動
                  </span>
                )}
                <span className={`${PILL} bg-admin-chip text-ink-2`}>
                  {c.days} 天
                </span>
              </div>
              <span className="text-ink-3 text-[13px] tabular-nums">
                客人看到提醒：
                {c.noticeFrom === c.end
                  ? formatShortDay(c.end)
                  : `${formatShortDay(c.noticeFrom)}–${formatShortDay(c.end)}`}
              </span>
              <span className="text-ink-2 text-[13px] tabular-nums">
                {formatDay(c.processDay)} 開始處理訂單
              </span>
            </li>
          ))}
        </ul>
        <p className="border-admin-line-soft text-ink-4 border-t px-5 pt-3 pb-4 text-xs leading-relaxed">
          客人在店休日和店休前一天打開下單頁，會跳出店休提醒（一天一次）。
        </p>
      </Card>
    </div>
  );
}

function DayCell({
  day,
  today,
  overrides,
  onToggle,
}: {
  day: DayKey;
  today: DayKey;
  overrides: DayOverrides;
  onToggle: (day: DayKey) => void;
}) {
  const closed = isClosed(day, overrides);
  const manual = day in overrides;
  const past = day < today;
  const label =
    `${formatDay(day)}${closed ? "店休" : "上班"}` +
    (manual ? "，手動改過" : "") +
    (past ? "" : `。點一下改成${closed ? "上班" : "店休"}`);
  return (
    <button
      type="button"
      onClick={() => onToggle(day)}
      disabled={past}
      aria-label={label}
      className={`enabled:hover:border-accent relative flex min-h-19 min-w-0 flex-col items-start justify-between rounded-[10px] border p-1 text-left disabled:cursor-default disabled:opacity-45 sm:p-2 ${
        closed ? `${STRIPES} text-ink-2` : "bg-white"
      } ${
        manual
          ? "border-[#9fb3ef]"
          : closed
            ? "border-admin-field"
            : "border-admin-line"
      }`}
    >
      <span
        className={`grid h-6 min-w-6 place-items-center rounded-full px-1 text-sm font-semibold tabular-nums ${
          day === today ? "bg-accent text-white" : ""
        }`}
      >
        {Number(day.slice(8))}
      </span>
      {(closed || manual) && (
        <span
          className={`rounded-md border px-1 py-0.5 text-xs font-semibold whitespace-nowrap sm:px-1.5 ${
            closed
              ? "border-ink-2 bg-ink-2 text-white"
              : "bg-accent-soft text-accent-dark border-[#c8d4f7]"
          }`}
        >
          {closed ? "店休" : "上班"}
        </span>
      )}
      {manual && (
        <span
          aria-hidden="true"
          className="bg-accent absolute top-1.5 right-1.5 size-2 rounded-full"
        />
      )}
    </button>
  );
}
