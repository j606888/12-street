"use client";

import { useState, useTransition } from "react";
import { updateOrderStatus, updatePaymentStatus } from "@/actions/admin";
import { field as fieldClass } from "./ui";

type Props = {
  orderId: string;
  field: "status" | "paymentStatus";
  value: string;
  options: Record<string, string>;
  label: string;
};

/** Select that saves the order or payment status as soon as it changes. */
export function StatusSelect({ orderId, field, value, options, label }: Props) {
  const [current, setCurrent] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save(next: string) {
    const prev = current;
    setCurrent(next);
    setError(null);
    startTransition(async () => {
      const res =
        field === "status"
          ? await updateOrderStatus({ orderId, status: next })
          : await updatePaymentStatus({ orderId, paymentStatus: next });
      if (!res.ok) {
        setCurrent(prev);
        setError(res.error);
      }
    });
  }

  return (
    <label className="grid gap-1 text-[13px]">
      <span className="text-ink-3">{label}</span>
      <select
        value={current}
        disabled={pending}
        onChange={(e) => save(e.target.value)}
        className={`${fieldClass} disabled:opacity-50`}
      >
        {Object.entries(options).map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}
      </select>
      {pending && <span className="text-ink-4">儲存中…</span>}
      {error && <span className="text-danger-fg">{error}</span>}
    </label>
  );
}
