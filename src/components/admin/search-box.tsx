"use client";

import { useEffect, useRef } from "react";
import { SearchIcon } from "@/components/icons";

/** Order search that jumps to the order list; "/" focuses it from anywhere. */
export function OrderSearchBox() {
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.isContentEditable ||
          ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName))
      )
        return;
      e.preventDefault();
      input.current?.focus();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <form
      action="/admin/orders"
      role="search"
      className="border-admin-line text-ink-4 focus-within:border-accent focus-within:ring-accent-soft flex h-10 w-full max-w-[360px] items-center gap-2 rounded-[10px] border bg-white px-3 focus-within:ring-3"
    >
      <SearchIcon className="size-4 shrink-0" />
      <input
        ref={input}
        type="search"
        name="q"
        aria-label="搜尋訂單"
        placeholder="搜尋訂單編號、姓名、手機"
        className="text-ink min-w-0 flex-1 bg-transparent outline-none"
      />
      <kbd className="border-admin-line font-admin-mono text-ink-4 rounded-[5px] border px-1.5 text-[11px] max-md:hidden">
        /
      </kbd>
    </form>
  );
}
