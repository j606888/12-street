"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

const LIFF_ID = process.env.NEXT_PUBLIC_LIFF_ID;

/** Set by the sign-out button so we don't sign straight back in. */
export const LIFF_SIGNED_OUT_KEY = "liff-signed-out";

/**
 * Opened from the LINE app through a LIFF URL: sign in with the LIFF ID token
 * so the customer never sees the login page. Elsewhere it does nothing.
 */
export function LiffAutoLogin() {
  const router = useRouter();

  useEffect(() => {
    // Only the LINE in-app browser can be a LIFF client; skip loading the SDK elsewhere
    if (!LIFF_ID || !/\bLine\//i.test(navigator.userAgent)) return;
    let cancelled = false;

    (async () => {
      const { default: liff } = await import("@line/liff");
      // Also follows `liff.state` to the path in the LIFF URL
      await liff.init({ liffId: LIFF_ID });
      if (cancelled || !liff.isInClient()) return;
      if (sessionStorage.getItem(LIFF_SIGNED_OUT_KEY)) return;

      const { data: session } = await authClient.getSession();
      const token = liff.getIDToken();
      if (cancelled || session || !token) return;

      const { error } = await authClient.signIn.social({
        provider: "line",
        idToken: { token, nonce: liff.getDecodedIDToken()?.nonce },
      });
      if (cancelled || error) return;

      if (location.pathname === "/login") {
        const next = new URLSearchParams(location.search).get("next");
        // Only allow same-site relative redirects
        router.replace(next?.startsWith("/") && !next.startsWith("//") ? next : "/");
      } else {
        router.refresh();
      }
    })().catch((err) => console.error("LIFF login failed", err));

    return () => {
      cancelled = true;
    };
  }, [router]);

  return null;
}
