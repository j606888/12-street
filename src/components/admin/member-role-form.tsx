"use client";

import { useState, useTransition } from "react";
import { setMemberRole } from "@/actions/admin";
import { btn } from "./ui";

/** 設為管理員／取消管理員, with a confirm step since it changes who can open the back office. */
export function MemberRoleForm({
  userId,
  isAdmin,
  isSelf,
}: {
  userId: string;
  isAdmin: boolean;
  isSelf: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    setError(null);
    startTransition(async () => {
      const res = await setMemberRole({
        userId,
        role: isAdmin ? "customer" : "admin",
      });
      setConfirming(false);
      if (!res.ok) setError(res.error);
    });
  }

  return (
    <div className="grid gap-3 px-5 py-4 text-[13px]">
      <p className="text-ink-2">
        {isAdmin
          ? "管理員：可以進後台看訂單、會員和照片。"
          : "一般會員：只能在前台下單、查自己的訂單。"}
      </p>
      {isSelf ? (
        <p className="text-ink-4 text-xs">
          這是你自己的帳號；要取消管理員請找其他管理員。
        </p>
      ) : confirming ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className={isAdmin ? "text-danger-fg" : "text-warn-fg"}>
            {isAdmin
              ? "確定取消這位會員的管理員權限？"
              : "確定讓這位會員可以進後台？"}
          </span>
          <button
            type="button"
            onClick={save}
            disabled={pending}
            className={isAdmin ? btn.danger : btn.primary}
          >
            {pending ? "儲存中…" : "確定"}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            disabled={pending}
            className={btn.secondary}
          >
            取消
          </button>
        </div>
      ) : (
        <div>
          <button
            type="button"
            onClick={() => {
              setError(null);
              setConfirming(true);
            }}
            className={isAdmin ? btn.danger : btn.secondary}
          >
            {isAdmin ? "取消管理員" : "設為管理員"}
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-danger-fg">
          {error}
        </p>
      )}
    </div>
  );
}
