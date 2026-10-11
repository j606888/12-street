"use client";

import { useState, useTransition } from "react";
import { updateMemberNote } from "@/actions/admin";
import { formatTaipeiTime } from "@/lib/format";
import { MEMBER_NOTE_MAX } from "@/lib/validators/admin";
import { btn } from "./ui";

/** The shop's free-text note on a member; customers never see it. */
export function MemberNoteForm({
  userId,
  note: initial,
  updatedAt: initialUpdatedAt,
}: {
  userId: string;
  note: string;
  updatedAt: Date | null;
}) {
  const [note, setNote] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [updatedAt, setUpdatedAt] = useState(initialUpdatedAt);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const dirty = note.trim() !== saved;

  function save() {
    setError(null);
    startTransition(async () => {
      const res = await updateMemberNote({ userId, note });
      if (res.ok) {
        setNote(note.trim());
        setSaved(note.trim());
        setUpdatedAt(res.updatedAt);
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <div className="grid gap-3 px-5 py-4">
      <label className="grid gap-1.5">
        <span className="sr-only">備註</span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={6}
          maxLength={MEMBER_NOTE_MAX}
          placeholder="例如：上次照片放了兩個月才來拿、喜歡亮面相紙…（只有店家看得到）"
          className="border-admin-field text-ink focus:border-accent focus:ring-accent-soft min-h-32 resize-y rounded-[10px] border bg-white px-3 py-2.5 text-sm leading-relaxed outline-none focus:ring-3"
        />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={pending || !dirty}
          className={btn.primary}
        >
          {pending ? "儲存中…" : "儲存備註"}
        </button>
        <span className="text-ink-4 text-xs tabular-nums">
          {note.length} / {MEMBER_NOTE_MAX}
        </span>
        <span className="text-ink-4 flex-1 text-right text-xs">
          {dirty
            ? "尚未儲存"
            : updatedAt && `最後更新 ${formatTaipeiTime(updatedAt)}`}
        </span>
      </div>
      {error && (
        <p role="alert" className="text-danger-fg text-[13px]">
          {error}
        </p>
      )}
    </div>
  );
}
