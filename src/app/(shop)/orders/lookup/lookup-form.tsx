"use client";

import { useActionState } from "react";
import { lookupOrder, type LookupState } from "@/actions/lookup";

export function LookupForm() {
  const [state, action, pending] = useActionState<LookupState, FormData>(
    lookupOrder,
    {},
  );

  return (
    <form action={action} className="grid gap-4">
      <label className="grid gap-1 text-sm">
        訂單編號
        <input
          name="orderNo"
          required
          defaultValue={state.orderNo}
          placeholder="例：P20261010-0001"
          autoComplete="off"
          autoCapitalize="characters"
          className="rounded-lg border px-3 py-2 font-mono text-base"
        />
      </label>
      <label className="grid gap-1 text-sm">
        手機號碼
        <input
          name="phone"
          type="tel"
          required
          defaultValue={state.phone}
          placeholder="下單時填寫的手機，例：0912345678"
          autoComplete="tel"
          inputMode="tel"
          className="rounded-lg border px-3 py-2 text-base"
        />
      </label>
      {state.error && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-neutral-900 px-4 py-3 font-bold text-white disabled:opacity-50"
      >
        {pending ? "查詢中…" : "查詢"}
      </button>
    </form>
  );
}
