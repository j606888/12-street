"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { LIFF_SIGNED_OUT_KEY } from "@/components/liff-auto-login";

export function SignOutButton({ className }: { className?: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function signOut() {
    setPending(true);
    try {
      await authClient.signOut();
      try {
        sessionStorage.setItem(LIFF_SIGNED_OUT_KEY, "1");
      } catch {}
      router.push("/");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={signOut}
      disabled={pending}
      className={className ?? "text-muted py-2.5 text-base underline"}
    >
      {pending ? "登出中…" : "登出"}
    </button>
  );
}
