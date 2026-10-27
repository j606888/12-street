"use client";

import { useEffect } from "react";
import { initLiff } from "@/components/liff-auto-login";

/** LIFF contexts where liff.sendMessages() posts into the chat it was opened from. */
const CHAT_CONTEXTS = new Set(["utou", "room", "group"]);

/**
 * Opened through LIFF from a LINE chat (e.g. the shop's rich menu): posts the
 * order number into that chat once, so the order shows up in the conversation
 * with the shop. Needs the `chat_message.write` scope on the LIFF app.
 * Elsewhere it does nothing.
 */
export function LiffOrderMessage({
  orderNo,
  text,
}: {
  orderNo: string;
  text: string;
}) {
  useEffect(() => {
    const ready = initLiff();
    if (!ready) return;
    const key = `liff-order-sent:${orderNo}`;
    try {
      if (localStorage.getItem(key)) return;
    } catch {
      // Storage blocked: may send again on reload, which is harmless
    }

    let cancelled = false;
    (async () => {
      const liff = await ready;
      const type = liff.getContext()?.type;
      if (cancelled || !liff.isInClient() || !type || !CHAT_CONTEXTS.has(type))
        return;
      // Mark first so a reload mid-send can't post the order twice
      try {
        localStorage.setItem(key, "1");
      } catch {}
      await liff.sendMessages([{ type: "text", text }]);
    })().catch((err) => console.error("LIFF sendMessages failed", err));

    return () => {
      cancelled = true;
    };
  }, [orderNo, text]);

  return null;
}
