"use client";

import { useState, useTransition } from "react";
import { deleteOrderPhotos } from "@/actions/admin";

/** Two-step button: first click asks, second click deletes. */
export function DeletePhotosButton({ orderId }: { orderId: string }) {
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
    <div className="grid gap-2 text-sm">
      {confirming ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-red-700">
            確定要刪除這筆訂單的所有照片嗎？刪除後無法復原。
          </span>
          <button
            type="button"
            onClick={remove}
            disabled={pending}
            className="rounded-lg bg-red-600 px-3 py-1.5 font-bold text-white disabled:opacity-50"
          >
            {pending ? "刪除中…" : "確定刪除"}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            disabled={pending}
            className="rounded-lg border px-3 py-1.5"
          >
            取消
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => {
            setMessage(null);
            setConfirming(true);
          }}
          className="w-fit rounded-lg border border-red-300 px-3 py-1.5 text-red-700"
        >
          刪除照片
        </button>
      )}
      {message && <p className="text-neutral-600">{message}</p>}
    </div>
  );
}
