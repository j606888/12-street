"use client";

import { useState, useTransition } from "react";
import { addMemberTag, removeMemberTag } from "@/actions/admin";
import { XIcon } from "@/components/icons";
import { TAG_CHIP } from "./tag-list";

type Tag = { id: number; name: string };

const OPTIONS_ID = "member-tag-options";

/** Autocomplete list shared by every MemberTags on the page; render it once. */
export function TagOptions({ names }: { names: string[] }) {
  return (
    <datalist id={OPTIONS_ID}>
      {names.map((n) => (
        <option key={n} value={n} />
      ))}
    </datalist>
  );
}

/**
 * A member's tags with × to remove and a "＋ 標籤" box to type a new one
 * (Enter adds, Esc closes). Updates optimistically and rolls back on failure.
 */
export function MemberTags({
  userId,
  tags: initial,
}: {
  userId: string;
  tags: Tag[];
}) {
  const [tags, setTags] = useState(initial);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function add(raw: string) {
    const name = raw.trim();
    if (!name) return;
    if (tags.some((t) => t.name === name)) {
      setError(null);
      return;
    }
    const temp = { id: -Date.now(), name };
    setTags((ts) => [...ts, temp]);
    setError(null);
    startTransition(async () => {
      const res = await addMemberTag({ userId, name });
      if (res.ok) {
        setTags((ts) => ts.map((t) => (t.id === temp.id ? res.tag : t)));
      } else {
        setTags((ts) => ts.filter((t) => t.id !== temp.id));
        setError(res.error);
      }
    });
  }

  function remove(tag: Tag) {
    setTags((ts) => ts.filter((t) => t.id !== tag.id));
    setError(null);
    startTransition(async () => {
      const res = await removeMemberTag({ userId, tagId: tag.id });
      if (!res.ok) {
        setTags((ts) => [...ts, tag]);
        setError(res.error);
      }
    });
  }

  return (
    <>
      {tags.map((t) => (
        <span key={t.id} className={`${TAG_CHIP} gap-0.5 pr-0.5`}>
          {t.name}
          <button
            type="button"
            onClick={() => remove(t)}
            disabled={pending || t.id < 0}
            aria-label={`移除標籤 ${t.name}`}
            className="text-ink-4 hover:bg-admin-field hover:text-ink grid size-5 place-items-center rounded disabled:opacity-50"
          >
            <XIcon className="size-2.5" />
          </button>
        </span>
      ))}
      {adding ? (
        <input
          autoFocus
          list={OPTIONS_ID}
          maxLength={20}
          aria-label="新增標籤"
          placeholder="輸入標籤，Enter 加上"
          onKeyDown={(e) => {
            if (e.key === "Escape") setAdding(false);
            if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
            e.preventDefault();
            add(e.currentTarget.value);
            e.currentTarget.value = "";
          }}
          onBlur={() => setAdding(false)}
          className="border-accent ring-accent-soft h-[26px] w-40 rounded-md border px-2 text-xs ring-3 outline-none"
        />
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="text-ink-3 hover:border-ink-4 hover:text-ink h-6 rounded-md border border-dashed border-[#c9ced6] bg-white px-2 text-xs"
        >
          ＋ 標籤
        </button>
      )}
      {error && (
        <span role="alert" className="text-danger-fg text-xs">
          {error}
        </span>
      )}
    </>
  );
}
