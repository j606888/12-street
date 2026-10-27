"use client";

import { useState, useTransition } from "react";
import { setMemberCash } from "@/actions/admin";

/**
 * Switch for 取件時付現金 on /order (LINE). Off by default; the in-store /guest
 * link offers cash to everyone regardless.
 */
export function MemberCashForm({
  userId,
  allowCash: initial,
}: {
  userId: string;
  allowCash: boolean;
}) {
  const [allowCash, setAllowCash] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggle() {
    const next = !allowCash;
    setAllowCash(next);
    setError(null);
    startTransition(async () => {
      const res = await setMemberCash({ userId, allowCash: next });
      if (!res.ok) {
        setAllowCash(!next);
        setError(res.error);
      }
    });
  }

  return (
    <div className="grid gap-3 px-5 py-4 text-[13px]">
      <div className="flex items-center justify-between gap-4">
        <span id={`cash-${userId}`} className="font-medium">
          可以選「取件時付現金」
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={allowCash}
          aria-labelledby={`cash-${userId}`}
          onClick={toggle}
          disabled={pending}
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-60 ${
            allowCash ? "bg-[#1f7a45]" : "bg-admin-field"
          }`}
        >
          <span
            className={`inline-block size-5 rounded-full bg-white shadow transition-transform ${
              allowCash ? "translate-x-5.5" : "translate-x-0.5"
            }`}
          />
        </button>
      </div>
      <p className="text-ink-3">
        {allowCash
          ? "這位會員用 LINE 下單時，可以選取件時付現金。"
          : "這位會員用 LINE 下單時，只能選 LINE MONEY 或銀行轉帳。"}
        店內的免登入下單網址不受影響，一律可以付現金。
      </p>
      {error && (
        <p role="alert" className="text-danger-fg">
          {error}
        </p>
      )}
    </div>
  );
}
