"use client";

import { useState, useTransition } from "react";
import { updatePaymentStatus } from "@/actions/admin";
import { CheckIcon } from "@/components/icons";
import type { PaymentStatus } from "@/lib/order-status";
import { btn } from "./ui";

const CONFIRM =
  "inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-[10px] bg-[#1f7a45] px-4 text-sm font-semibold text-white hover:bg-[#1a6a3c] disabled:opacity-50";

/**
 * Payment actions on the order page: 確認收款 / 金額不符 while a payment waits for
 * review, 標記已付款 otherwise, and 復原 for the change made here.
 */
export function PaymentReview({
  orderId,
  status: initial,
  paidAtLabel,
}: {
  orderId: string;
  status: PaymentStatus;
  paidAtLabel: string | null;
}) {
  const [status, setStatus] = useState(initial);
  const [prev, setPrev] = useState<PaymentStatus | null>(null);
  // Follow changes made elsewhere on the page (e.g. 手動修改狀態)
  const [seen, setSeen] = useState(initial);
  if (initial !== seen) {
    setSeen(initial);
    if (initial !== status) {
      setStatus(initial);
      setPrev(null);
    }
  }
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save(next: PaymentStatus, undo: PaymentStatus | null) {
    const before = status;
    setStatus(next);
    setError(null);
    startTransition(async () => {
      const res = await updatePaymentStatus({ orderId, paymentStatus: next });
      if (res.ok) {
        setPrev(undo);
      } else {
        setStatus(before);
        setError(res.error);
      }
    });
  }

  const undoButton = prev && (
    <button
      type="button"
      onClick={() => save(prev, null)}
      disabled={pending}
      className={`${btn.link} py-1.5 text-[13px]`}
    >
      復原
    </button>
  );

  return (
    <div className="grid gap-2 text-[13px]">
      {status === "pending_review" && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => save("paid", "pending_review")}
            disabled={pending}
            className={CONFIRM}
          >
            <CheckIcon className="size-4" />
            確認收款
          </button>
          <button
            type="button"
            onClick={() => save("unpaid", "pending_review")}
            disabled={pending}
            className={`${btn.secondary} h-10`}
          >
            金額不符
          </button>
        </div>
      )}
      {status === "paid" && (
        <p className="text-ok-fg flex items-center justify-between gap-2">
          {prev
            ? "已確認收款"
            : `已確認收款${paidAtLabel ? `：${paidAtLabel}` : ""}`}
          {undoButton ?? (
            <button
              type="button"
              onClick={() => save("unpaid", "paid")}
              disabled={pending}
              className={`${btn.link} py-1.5 text-[13px]`}
            >
              改回未付款
            </button>
          )}
        </p>
      )}
      {status === "unpaid" && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-ink-3">
            {prev === "pending_review"
              ? "已改回未付款，請聯絡客人確認"
              : "尚未付款"}
          </span>
          {undoButton ?? (
            <button
              type="button"
              onClick={() => save("paid", "unpaid")}
              disabled={pending}
              className={btn.secondary}
            >
              標記已付款
            </button>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="text-danger-fg">
          {error}
        </p>
      )}
    </div>
  );
}

/** One-click 確認收款 for the overview queue; the row drops out on refresh. */
export function ConfirmPaymentButton({ orderId }: { orderId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <span className="inline-grid justify-items-end gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const res = await updatePaymentStatus({
              orderId,
              paymentStatus: "paid",
            });
            if (!res.ok) setError(res.error);
          })
        }
        className={btn.primary}
      >
        <CheckIcon className="size-3.5" />
        {pending ? "儲存中…" : "確認收款"}
      </button>
      {error && (
        <span role="alert" className="text-danger-fg text-xs">
          {error}
        </span>
      )}
    </span>
  );
}
