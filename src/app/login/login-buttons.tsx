"use client";

import { useState } from "react";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";

export function LoginButtons({ next }: { next: string }) {
  const [pending, setPending] = useState(false);

  async function signInWithLine() {
    setPending(true);
    await authClient.signIn.social({ provider: "line", callbackURL: next });
  }

  return (
    <div className="mt-1 grid gap-3">
      <button
        type="button"
        onClick={signInWithLine}
        disabled={pending}
        className="bg-line-green min-h-18 rounded-[18px] px-7 text-2xl font-bold text-white disabled:opacity-60"
      >
        {pending ? "前往 LINE…" : "用 LINE 登入"}
      </button>
      <Link
        href="/order"
        className="bg-card flex min-h-17 items-center justify-center rounded-[18px] border-2 border-[#c9c2bb] px-7 text-[22px] font-bold"
      >
        不登入，直接下單
      </Link>
    </div>
  );
}
