"use client";

import { useState, useTransition } from "react";
import { deleteOrderPhotos } from "@/actions/admin";
import { TrashIcon } from "@/components/icons";
import { btn } from "./ui";

/** Two-step button: first click asks, second click deletes. */
export function DeletePhotosButton({
  orderId,
  label = "刪除照片",
}: {
  orderId: string;
  label?: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function remove() {
    startTransition(async () => {
      const res = await deleteOrderPhotos({ orderId });
      setConfirming(false);
      setMessage(res.ok ? `已刪除 ${res.deleted} 張照片` : res.error);
    });
  }

  return (
    <span className="inline-grid justify-items-end gap-1.5 text-[13px]">
      {confirming ? (
        <span className="flex flex-wrap items-center justify-end gap-2">
          <span className="text-danger-fg">
            確定要刪除這筆訂單的所有照片嗎？刪除後無法復原。
          </span>
          <button
            type="button"
            onClick={remove}
            disabled={pending}
            className={`${btn.danger} bg-danger-fg border-transparent text-white hover:bg-[#8f1b16]`}
          >
            {pending ? "刪除中…" : "確定刪除"}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            disabled={pending}
            className={btn.secondary}
          >
            取消
          </button>
        </span>
      ) : (
        <button
          type="button"
          onClick={() => {
            setMessage(null);
            setConfirming(true);
          }}
          className={btn.danger}
        >
          <TrashIcon className="size-3.5" />
          {label}
        </button>
      )}
      {message && <span className="text-ink-3">{message}</span>}
    </span>
  );
}
