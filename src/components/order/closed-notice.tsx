"use client";

import { useEffect, useRef } from "react";
import { CalendarXIcon } from "@/components/icons";
import {
  formatDay,
  noticeCells,
  type ClosedNotice,
  type NoticeCell,
} from "@/lib/shop-days";

const CELL_TONE: Record<NoticeCell["tone"], string> = {
  today: "border-foreground bg-card",
  todayClosed: "border-foreground bg-subtle",
  closed: "border-subtle bg-subtle text-muted",
  process: "border-brand bg-brand text-white",
};

/**
 * Pops up on the order page on a closed day or the day before one, telling
 * when today's orders will be handled. Shown on every visit that day.
 */
export function ClosedNoticeDialog({ notice }: { notice: ClosedNotice }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cells = noticeCells(notice);
  const columns = cells.reduce((n, c) => n + (c.wide ? 2 : 1), 0);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  return (
    <dialog
      ref={dialog}
      onClick={(e) => e.target === e.currentTarget && dialog.current?.close()}
      aria-labelledby="closed-notice-title"
      aria-describedby="closed-notice-desc"
      className="bg-card text-foreground backdrop:bg-foreground/60 m-auto w-[calc(100%-40px)] max-w-sm rounded-[20px] p-0 shadow-2xl"
    >
      <div className="grid justify-items-center gap-4.5 px-5 pt-7 pb-5 text-center">
        <span className="bg-brand-tint text-brand-dark grid size-16 place-items-center rounded-full">
          <CalendarXIcon className="size-8" />
        </span>
        <div className="grid gap-2">
          <h2
            id="closed-notice-title"
            className="text-2xl leading-snug font-bold"
          >
            {notice.title}
          </h2>
          <p
            id="closed-notice-desc"
            className="text-muted text-[17px] leading-relaxed"
          >
            {notice.closedToday && "還是可以下單。"}今天送出的訂單，將於
            <b className="text-brand-dark my-0.5 block text-[26px] leading-snug font-bold tabular-nums">
              {formatDay(notice.processDay)}
            </b>
            開始處理，請預留取件時間。
          </p>
        </div>
        <ol
          aria-label="接下來幾天"
          className="grid w-full gap-1.5"
          style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        >
          {cells.map((c) => (
            <li
              key={c.date}
              className={`grid justify-items-center gap-px rounded-xl border-2 py-2 ${
                CELL_TONE[c.tone]
              } ${c.wide ? "col-span-2" : ""}`}
            >
              <span className="text-[13px]">{c.label}</span>
              <span className="text-base font-bold tabular-nums">{c.date}</span>
              <span className="text-[13px] font-bold">{c.status}</span>
            </li>
          ))}
        </ol>
        <button
          type="button"
          onClick={() => dialog.current?.close()}
          className="bg-brand hover:bg-brand-dark mt-0.5 h-13.5 w-full rounded-[14px] text-lg font-bold text-white"
        >
          我知道了，開始選照片
        </button>
      </div>
    </dialog>
  );
}
