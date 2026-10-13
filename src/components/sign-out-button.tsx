"use client";

import { useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { isLineApp } from "@/components/liff-auto-login";

const noop = () => () => {};

export function SignOutButton({ className }: { className?: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  // Hidden inside LINE: the LINE account is the login (LIFF signs straight back in).
  // Rendered as hidden on the server too, so web visitors see it after hydration.
  const inLine = useSyncExternalStore(noop, isLineApp, () => true);

  async function signOut() {
    setPending(true);
    try {
      await authClient.signOut();
      router.push("/");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  if (inLine) return null;

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
