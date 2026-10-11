"use client";

import { useState, useTransition } from "react";
import { updateMember } from "@/actions/admin";
import { btn, field } from "./ui";

/** Name and phone of a member, saved together. */
export function MemberProfileForm({
  userId,
  name,
  phone,
}: {
  userId: string;
  name: string;
  phone: string | null;
}) {
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null,
  );
  const [pending, startTransition] = useTransition();

  function save(form: FormData) {
    setMessage(null);
    startTransition(async () => {
      const res = await updateMember({
        userId,
        name: form.get("name"),
        phone: form.get("phone"),
      });
      setMessage(
        res.ok ? { ok: true, text: "已儲存" } : { ok: false, text: res.error },
      );
    });
  }

  return (
    <form action={save} className="grid gap-3.5 px-5 py-4">
      <label className="grid gap-1.5 text-[13px]">
        <span className="text-ink-3 font-medium">姓名</span>
        <input
          name="name"
          defaultValue={name}
          required
          maxLength={50}
          className={field}
        />
      </label>
      <label className="grid gap-1.5 text-[13px]">
        <span className="text-ink-3 font-medium">手機</span>
        <input
          name="phone"
          type="tel"
          inputMode="tel"
          defaultValue={phone ?? ""}
          placeholder="0912-345-678"
          className={`${field} font-admin-mono`}
        />
        <span className="text-ink-4 text-xs">
          只改會員資料；已送出的訂單會保留下單時填的聯絡電話。
        </span>
      </label>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className={btn.primary}>
          {pending ? "儲存中…" : "儲存"}
        </button>
        {message && (
          <span
            role={message.ok ? "status" : "alert"}
            className={`text-[13px] ${message.ok ? "text-ok-fg" : "text-danger-fg"}`}
          >
            {message.text}
          </span>
        )}
      </div>
    </form>
  );
}
