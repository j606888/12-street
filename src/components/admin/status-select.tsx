"use client";

import { useState, useTransition } from "react";
import { updateOrderStatus, updatePaymentStatus } from "@/actions/admin";

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
    <label className="grid gap-1 text-sm">
      <span className="text-neutral-600">{label}</span>
      <select
        value={current}
        disabled={pending}
        onChange={(e) => save(e.target.value)}
        className="rounded-lg border bg-white px-3 py-2 text-base disabled:opacity-50"
      >
        {Object.entries(options).map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}
      </select>
      {pending && <span className="text-neutral-400">儲存中…</span>}
      {error && <span className="text-red-600">{error}</span>}
    </label>
  );
}
