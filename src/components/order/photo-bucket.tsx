"use client";

import { useMemo, useRef, useState } from "react";
import { MAX_QUANTITY } from "@/lib/validators/order";
import type { Entry, Notice, PhotoUploader } from "./use-photo-uploader";

const STATUS_LABEL: Record<Entry["status"], string> = {
  hashing: "檢查中…",
  registering: "準備上傳…",
  queued: "等待上傳",
  uploading: "上傳中",
  confirming: "確認中…",
  uploaded: "已上傳",
  failed: "上傳失敗",
  missing: "未完成上傳",
};

export function PhotoBucket({
  bucket,
  entries,
  notices,
  uploader,
  withQuantity,
}: {
  bucket: string;
  entries: Entry[];
  notices: Notice[];
  uploader: PhotoUploader;
  withQuantity: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [bulkQty, setBulkQty] = useState(1);

  // Duplicate hint: same SHA-256 inside this group (informational only)
  const duplicates = useMemo(() => {
    const byHash = new Map<string, string[]>();
    for (const e of entries) {
      if (!e.sha256) continue;
      byHash.set(e.sha256, [...(byHash.get(e.sha256) ?? []), e.localId]);
    }
    return new Set([...byHash.values()].filter((ids) => ids.length > 1).flat());
  }, [entries]);

  const done = entries.filter((e) => e.status === "uploaded").length;
  const failed = entries.filter((e) => e.status === "failed").length;
  const missing = entries.filter((e) => e.status === "missing").length;

  function pick(files: FileList | null) {
    if (files?.length) void uploader.addFiles(bucket, Array.from(files));
  }

  return (
    <div className="grid gap-3">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          pick(e.dataTransfer.files);
        }}
        className={`grid place-items-center gap-2 rounded-lg border-2 border-dashed px-4 py-6 text-center ${
          dragging ? "border-sky-500 bg-sky-50" : "border-neutral-300"
        }`}
      >
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white"
        >
          選擇照片
        </button>
        <p className="text-xs text-neutral-500">
          可一次選多張，或把照片拖曳到這裡。只接受 JPG／JPEG。
        </p>
        <input
          ref={inputRef}
          type="file"
          accept=".jpg,.jpeg,image/jpeg"
          multiple
          hidden
          onChange={(e) => {
            pick(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {notices.length > 0 && (
        <div
          role="alert"
          className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
        >
          <div className="flex items-start justify-between gap-2">
            <p className="font-medium">以下檔案沒有加入：</p>
            <button
              type="button"
              onClick={() => uploader.dismissNotices(bucket)}
              className="text-xs underline"
            >
              關閉
            </button>
          </div>
          <ul className="mt-1 list-disc pl-5">
            {notices.map((n, i) => (
              <li key={i}>{n.message}</li>
            ))}
          </ul>
        </div>
      )}

      {missing > 0 && (
        <p className="rounded-md bg-orange-50 p-3 text-sm text-orange-900">
          有 {missing}{" "}
          張照片上次沒有傳完。請再選一次同一張照片會自動接續上傳，或按「移除」。
        </p>
      )}

      {entries.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-neutral-600">
          <span>
            已上傳 {done}／{entries.length} 張
            {failed > 0 && (
              <span className="text-red-600">，失敗 {failed} 張</span>
            )}
          </span>
          {withQuantity && entries.length > 1 && (
            <span className="flex items-center gap-1">
              全部設為
              <QuantityInput
                value={bulkQty}
                onChange={setBulkQty}
                label="批次張數"
              />
              張
              <button
                type="button"
                onClick={() =>
                  uploader.setQuantity(
                    entries.map((e) => e.localId),
                    bulkQty,
                  )
                }
                className="rounded border px-2 py-1"
              >
                套用
              </button>
            </span>
          )}
        </div>
      )}

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {entries.map((e) => (
          <li
            key={e.localId}
            className="grid gap-1 rounded-lg border bg-white p-2 text-xs"
          >
            <div className="relative aspect-square overflow-hidden rounded bg-neutral-100">
              {e.previewUrl ? (
                // Local blob: / presigned R2 URLs; next/image can't optimize either
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={e.previewUrl}
                  alt={e.fileName}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="grid h-full place-items-center text-neutral-400">
                  無預覽
                </div>
              )}
              {duplicates.has(e.localId) && (
                <span className="absolute top-1 left-1 rounded bg-amber-400 px-1.5 py-0.5 font-medium text-amber-950">
                  重複照片
                </span>
              )}
            </div>
            <p className="truncate" title={e.fileName}>
              {e.fileName}
            </p>
            <StatusLine entry={e} />
            <div className="flex items-center justify-between gap-1">
              {withQuantity ? (
                <span className="flex items-center gap-1">
                  <QuantityInput
                    value={e.quantity}
                    onChange={(q) => uploader.setQuantity([e.localId], q)}
                    label={`${e.fileName} 張數`}
                  />
                  張
                </span>
              ) : (
                <span />
              )}
              <span className="flex gap-2">
                {e.status === "failed" && e.file && (
                  <button
                    type="button"
                    onClick={() => void uploader.retry(e.localId)}
                    className="text-sky-700 underline"
                  >
                    重傳
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void uploader.remove(e.localId)}
                  className="text-neutral-500 underline"
                >
                  移除
                </button>
              </span>
            </div>
          </li>
        ))}
      </ul>
      {entries.some((e) => duplicates.has(e.localId)) && (
        <p className="text-sm text-amber-800">
          標示「重複照片」的是內容完全相同的檔案，如果不是故意的，可以移除多的那張。
        </p>
      )}
    </div>
  );
}

function StatusLine({ entry: e }: { entry: Entry }) {
  const color =
    e.status === "uploaded"
      ? "text-green-700"
      : e.status === "failed" || e.status === "missing"
        ? "text-red-600"
        : "text-neutral-500";
  return (
    <div className="grid gap-1">
      <span className={color}>
        {STATUS_LABEL[e.status]}
        {e.status === "uploading" && ` ${Math.round(e.progress * 100)}%`}
      </span>
      {(e.status === "uploading" || e.status === "confirming") && (
        <div className="h-1 overflow-hidden rounded bg-neutral-200">
          <div
            className="h-full bg-sky-500 transition-[width]"
            style={{ width: `${e.progress * 100}%` }}
          />
        </div>
      )}
      {e.error && <span className="text-red-600">{e.error}</span>}
    </div>
  );
}

export function QuantityInput({
  value,
  onChange,
  label,
  min = 1,
}: {
  value: number;
  onChange: (n: number) => void;
  label: string;
  min?: number;
}) {
  return (
    <input
      type="number"
      inputMode="numeric"
      min={min}
      max={MAX_QUANTITY}
      value={value}
      aria-label={label}
      onChange={(ev) => {
        const n = Math.trunc(Number(ev.target.value));
        if (Number.isFinite(n))
          onChange(Math.min(MAX_QUANTITY, Math.max(min, n)));
      }}
      className="w-14 rounded border px-1.5 py-1 text-right"
    />
  );
}
