"use client";

import { useState, useTransition } from "react";
import { updateOrderStatus } from "@/actions/admin";
import { ChevronRightIcon } from "@/components/icons";
import type { PaymentMethod } from "@/components/payment-details";
import type { OrderStatus, PaymentStatus } from "@/lib/order-status";
import { btn } from "./ui";

const NEXT: Partial<Record<OrderStatus, [OrderStatus, string]>> = {
  submitted: ["printing", "開始製作"],
  printing: ["ready", "標記可取件"],
  ready: ["picked_up", "客人已取件"],
};

/**
 * Moves the order one step along 已送出 → 製作中 → 可取件 → 已取件. Starting
 * production before a non-cash payment is confirmed asks first; picking up an
 * unpaid order offers 取件並收款 so the payment is confirmed in the same click.
 */
export function AdvanceStatusButton({
  orderId,
  status,
  paymentMethod,
  paymentStatus,
  size = "sm",
}: {
  orderId: string;
  status: OrderStatus;
  paymentMethod: PaymentMethod | null;
  paymentStatus: PaymentStatus;
  size?: "sm" | "lg";
}) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const next = NEXT[status];
  if (!next) return null;
  const [target, label] = next;

  const needsWarning =
    target === "printing" &&
    paymentMethod !== "cash_on_pickup" &&
    paymentStatus !== "paid";

  const collectPayment = target === "picked_up" && paymentStatus !== "paid";

  function save(markPaid?: boolean) {
    setError(null);
    startTransition(async () => {
      const res = await updateOrderStatus({
        orderId,
        status: target,
        markPaid,
      });
      setConfirming(false);
      if (!res.ok) setError(res.error);
    });
  }

  const look =
    status === "submitted" || size === "lg" ? btn.primary : btn.secondary;
  const big = size === "lg" ? "h-10 px-4 text-sm" : "";

  return (
    <span className="inline-grid justify-items-end gap-1">
      {confirming ? (
        <span className="flex flex-wrap items-center justify-end gap-2">
          <span className="text-warn-fg text-[13px]">
            付款還沒確認，確定要開始製作？
          </span>
          <button
            type="button"
            onClick={() => save()}
            disabled={pending}
            className={btn.primary}
          >
            {pending ? "儲存中…" : "確定"}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            disabled={pending}
            className={btn.secondary}
          >
            取消
          </button>
        </span>
      ) : collectPayment ? (
        <span className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => save()}
            disabled={pending}
            className={`${btn.secondary} ${big}`}
          >
            只取件
          </button>
          <button
            type="button"
            onClick={() => save(true)}
            disabled={pending}
            className={`${btn.primary} ${big}`}
          >
            {pending ? "儲存中…" : "取件並收款"}
          </button>
        </span>
      ) : (
        <button
          type="button"
          onClick={() => (needsWarning ? setConfirming(true) : save())}
          disabled={pending}
          className={`${look} ${big}`}
        >
          {pending ? "儲存中…" : label}
          {size === "lg" && !pending && <ChevronRightIcon className="size-4" />}
        </button>
      )}
      {error && (
        <span role="alert" className="text-danger-fg text-xs">
          {error}
        </span>
      )}
    </span>
  );
}

/** Two-step 取消這筆訂單. */
export function CancelOrderButton({ orderId }: { orderId: string }) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function cancel() {
    startTransition(async () => {
      const res = await updateOrderStatus({ orderId, status: "cancelled" });
      setConfirming(false);
      if (!res.ok) setError(res.error);
    });
  }

  return confirming ? (
    <span className="flex flex-wrap items-center justify-end gap-2 text-[13px]">
      <span className="text-danger-fg">確定要取消這筆訂單嗎？</span>
      <button
        type="button"
        onClick={cancel}
        disabled={pending}
        className={btn.danger}
      >
        {pending ? "儲存中…" : "確定取消"}
      </button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        disabled={pending}
        className={btn.secondary}
      >
        不要取消
      </button>
    </span>
  ) : (
    <span className="grid justify-items-end gap-1">
      <button
        type="button"
        onClick={() => {
          setError(null);
          setConfirming(true);
        }}
        className="text-danger-fg py-1.5 text-[13px] hover:underline"
      >
        取消這筆訂單
      </button>
      {error && (
        <span role="alert" className="text-danger-fg text-xs">
          {error}
        </span>
      )}
    </span>
  );
}
