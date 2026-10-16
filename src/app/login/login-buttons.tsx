"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { LineButtonContent, lineButtonClass } from "@/components/line-login";

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
        className={`${lineButtonClass("lg")} disabled:cursor-wait`}
      >
        <LineButtonContent size="lg">
          {pending ? "前往 LINE…" : "用 LINE 登入"}
        </LineButtonContent>
      </button>
    </div>
  );
}
