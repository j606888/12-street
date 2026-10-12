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
      <label className="grid gap-1.5 text-[17px] font-bold">
        訂單編號
        <input
          name="orderNo"
          required
          defaultValue={state.orderNo}
          placeholder="例：P20261010-0001"
          autoComplete="off"
          autoCapitalize="characters"
          className="border-field bg-card focus:outline-brand h-13.5 rounded-[14px] border-2 px-4 font-mono text-lg font-medium focus:outline-2 focus:outline-offset-1"
        />
      </label>
      <label className="grid gap-1.5 text-[17px] font-bold">
        手機號碼
        <input
          name="phone"
          type="tel"
          required
          defaultValue={state.phone}
          placeholder="下單時填寫的手機，例：0912345678"
          autoComplete="tel"
          inputMode="tel"
          className="border-field bg-card focus:outline-brand h-13.5 rounded-[14px] border-2 px-4 text-lg font-medium focus:outline-2 focus:outline-offset-1"
        />
      </label>
      {state.error && (
        <p role="alert" className="text-base text-red-700">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="bg-brand hover:bg-brand-dark flex h-13.5 items-center justify-center rounded-[14px] px-4 text-lg font-bold text-white disabled:opacity-50"
      >
        {pending ? "查詢中…" : "查詢"}
      </button>
    </form>
  );
}
