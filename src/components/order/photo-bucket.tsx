"use client";

import { useMemo, useRef, useState } from "react";
import { PlusIcon, XIcon } from "@/components/icons";
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
  quantityUnit,
  idPhotoSets,
}: {
  bucket: string;
  entries: Entry[];
  notices: Notice[];
  uploader: PhotoUploader;
  /** Show a quantity per photo, counted in this unit (prints or ID-photo sets). */
  quantityUnit?: "張" | "組";
  /** Show a set selector per photo (證件照). */
  idPhotoSets?: { id: number; name: string }[];
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

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
  const prints = entries.reduce((n, e) => n + e.quantity, 0);
  const sameQty =
    entries.length > 0 && entries.every((e) => e.quantity === entries[0].quantity)
      ? entries[0].quantity
      : null;
  const bulkBase = sameQty ?? Math.max(1, ...entries.map((e) => e.quantity));

  function pick(files: FileList | null) {
    if (files?.length) void uploader.addFiles(bucket, Array.from(files));
  }

  function setAll(q: number) {
    uploader.setQuantity(
      entries.map((e) => e.localId),
      Math.min(MAX_QUANTITY, Math.max(1, q)),
    );
  }

  return (
    <div className="grid gap-3">
      {entries.length > 0 && (
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-[15px] font-bold">已選 {entries.length} 張照片</h3>
          <span className="text-[13px] text-muted">
            {done < entries.length || failed > 0 ? (
              <>
                已上傳 {done}／{entries.length}
                {failed > 0 && (
                  <span className="text-red-700">，失敗 {failed} 張</span>
                )}
              </>
            ) : (
              quantityUnit && `共 ${prints} ${quantityUnit}`
            )}
          </span>
        </div>
      )}

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
      >
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className={`flex w-full items-center gap-3 rounded-2xl border-2 border-dashed px-4 py-3.5 text-left transition-colors ${
            dragging
              ? "border-brand bg-brand-soft"
              : "border-[#d9c3b3] bg-[#fdf8f4] hover:border-brand"
          }`}
        >
          <span className="grid size-10 shrink-0 place-items-center rounded-[10px] bg-brand text-white">
            <PlusIcon />
          </span>
          <span>
            <span className="block text-[15px] font-bold">
              {entries.length ? "加入更多照片" : "選擇照片"}
            </span>
            <span className="mt-0.5 block text-xs text-muted">
              可一次選多張，或拖曳到這裡 · 只收 JPG
            </span>
          </span>
        </button>
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
          className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
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
        <p className="rounded-xl bg-orange-50 p-3 text-sm text-orange-900">
          有 {missing}{" "}
          張照片上次沒有傳完。請再選一次同一張照片會自動接續上傳，或按 × 移除。
        </p>
      )}

      {quantityUnit && entries.length > 1 && (
        <div className="flex items-center justify-between rounded-xl bg-subtle px-3 py-2">
          <span className="text-[13px] font-semibold">
            每張都{quantityUnit === "張" ? "洗" : "印"}
          </span>
          <span className="flex items-center gap-1">
            <StepButton
              onClick={() => setAll(bulkBase - 1)}
              label={`全部減一${quantityUnit}`}
              className="rounded-[10px] border border-line bg-card"
            >
              −
            </StepButton>
            <span className="min-w-14 text-center text-[13px] font-bold">
              {sameQty ? `全部 ${sameQty} ${quantityUnit}` : "不一樣"}
            </span>
            <StepButton
              onClick={() => setAll(bulkBase + 1)}
              label={`全部加一${quantityUnit}`}
              className="rounded-[10px] border border-line bg-card"
            >
              +
            </StepButton>
          </span>
        </div>
      )}

      {entries.length > 0 && (
        <ul className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 md:grid-cols-5">
          {entries.map((e) => (
            <li key={e.localId} className="grid content-start gap-1.5">
              <div className="relative aspect-square overflow-hidden rounded-[10px] bg-subtle">
                {e.previewUrl ? (
                  // Local blob: / presigned R2 URLs; next/image can't optimize either
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={e.previewUrl}
                    alt={e.fileName}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="grid h-full place-items-center px-1 text-center text-xs text-muted">
                    {e.fileName}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => void uploader.remove(e.localId)}
                  aria-label={`移除 ${e.fileName}`}
                  className="absolute top-1 right-1 grid size-7 place-items-center rounded-full bg-[#241e1a]/75 text-white"
                >
                  <XIcon className="size-4" />
                </button>
                {duplicates.has(e.localId) && (
                  <span className="absolute bottom-1 left-1 rounded-md bg-[#fff4d6] px-1.5 py-0.5 text-[11px] font-bold text-[#7a4b00]">
                    可能重複
                  </span>
                )}
                <TileStatus entry={e} onRetry={() => void uploader.retry(e.localId)} />
              </div>
              {idPhotoSets && (
                <select
                  value={e.productId ?? ""}
                  onChange={(ev) =>
                    uploader.setIdPhotoSet(e.localId, Number(ev.target.value))
                  }
                  aria-label={`${e.fileName} 證件照組合`}
                  className="h-9 w-full rounded-[10px] border border-line bg-card px-1 text-xs"
                >
                  {idPhotoSets.map((set) => (
                    <option key={set.id} value={set.id}>
                      {set.name.replace(/^證件照：/, "")}
                    </option>
                  ))}
                </select>
              )}
              {quantityUnit && (
                <Stepper
                  value={e.quantity}
                  onChange={(q) => uploader.setQuantity([e.localId], q)}
                  label={`${e.fileName} ${quantityUnit}數`}
                  unit={quantityUnit}
                />
              )}
            </li>
          ))}
        </ul>
      )}
      {entries.some((e) => duplicates.has(e.localId)) && (
        <p className="text-sm text-amber-800">
          標示「可能重複」的是內容完全相同的檔案，如果不是故意的，可以移除多的那張。
        </p>
      )}
    </div>
  );
}

/** Upload progress / failure laid over the thumbnail; nothing once uploaded. */
function TileStatus({ entry: e, onRetry }: { entry: Entry; onRetry: () => void }) {
  if (e.status === "uploaded") return null;
  const bad = e.status === "failed" || e.status === "missing";
  return (
    <div
      className={`absolute inset-x-0 bottom-0 grid gap-1 p-1.5 text-[11px] font-medium text-white ${
        bad ? "bg-red-800/85" : "bg-[#241e1a]/65"
      }`}
    >
      <span className="flex items-center justify-between gap-1">
        <span className="truncate">
          {STATUS_LABEL[e.status]}
          {e.status === "uploading" && ` ${Math.round(e.progress * 100)}%`}
        </span>
        {e.status === "failed" && e.file && (
          <button type="button" onClick={onRetry} className="underline">
            重傳
          </button>
        )}
      </span>
      {(e.status === "uploading" || e.status === "confirming") && (
        <span className="h-1 overflow-hidden rounded bg-white/30">
          <span
            className="block h-full bg-white transition-[width]"
            style={{ width: `${e.progress * 100}%` }}
          />
        </span>
      )}
      {e.error && <span className="line-clamp-2">{e.error}</span>}
    </div>
  );
}

export function Stepper({
  value,
  onChange,
  label,
  unit,
  min = 1,
}: {
  value: number;
  onChange: (n: number) => void;
  label: string;
  unit?: string;
  min?: number;
}) {
  const set = (n: number) => onChange(Math.min(MAX_QUANTITY, Math.max(min, n)));
  return (
    <div
      role="group"
      aria-label={label}
      className="flex h-9 items-center justify-between rounded-[10px] border border-line bg-card"
    >
      <StepButton
        onClick={() => set(value - 1)}
        label={`減一${unit ?? ""}`}
        disabled={value <= min}
      >
        −
      </StepButton>
      <span className="text-sm font-bold tabular-nums" aria-live="polite">
        {value}
        {unit && <span className="sr-only"> {unit}</span>}
      </span>
      <StepButton
        onClick={() => set(value + 1)}
        label={`加一${unit ?? ""}`}
        disabled={value >= MAX_QUANTITY}
      >
        +
      </StepButton>
    </div>
  );
}

function StepButton({
  onClick,
  label,
  disabled,
  className = "",
  children,
}: {
  onClick: () => void;
  label: string;
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      disabled={disabled}
      className={`grid size-9 place-items-center text-lg leading-none disabled:opacity-30 ${className}`}
    >
      {children}
    </button>
  );
}
