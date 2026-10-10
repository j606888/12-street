"use client";

import { useState, useTransition } from "react";
import { setMemberTag } from "@/actions/admin";
import { tagTone } from "@/components/admin/tag-tone";

type Props = {
  userId: string;
  tag: { id: number; name: string; color: string };
  on: boolean;
};

/** Pill that adds or removes a member tag. */
export function TagToggle({ userId, tag, on }: Props) {
  const [active, setActive] = useState(on);
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();

  function toggle() {
    const next = !active;
    setActive(next);
    setError(false);
    startTransition(async () => {
      const res = await setMemberTag({ userId, tagId: tag.id, on: next });
      if (!res.ok) {
        setActive(!next);
        setError(true);
      }
    });
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      aria-pressed={active}
      title={
        error ? "儲存失敗，請再試一次" : active ? "按一下移除" : "按一下加上"
      }
      className={`rounded-full border px-3 py-1.5 text-xs disabled:opacity-50 ${
        active
          ? tagTone(tag.color)
          : "border-dashed text-neutral-400 hover:text-neutral-700"
      } ${error ? "ring-2 ring-red-400" : ""}`}
    >
      {tag.name}
    </button>
  );
}
