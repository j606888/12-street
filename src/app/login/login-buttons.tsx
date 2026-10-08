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
    <div className="grid gap-3">
      <button
        type="button"
        onClick={signInWithLine}
        disabled={pending}
        className="rounded-lg bg-[#06C755] px-4 py-3 font-bold text-white disabled:opacity-60"
      >
        {pending ? "前往 LINE…" : "使用 LINE 登入"}
      </button>
      <Link href="/order" className="rounded-lg border px-4 py-3 text-center">
        以訪客身分下單
      </Link>
    </div>
  );
}
