"use client";

import { useMemo, useRef, useState } from "react";
import { PlusIcon, TrashIcon, XIcon } from "@/components/icons";
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
}: {
  bucket: string;
  entries: Entry[];
  notices: Notice[];
  uploader: PhotoUploader;
  /** Show a quantity per photo, counted in this unit (prints or ID-photo sets). */
  quantityUnit?: "張" | "組";
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
    entries.length > 0 &&
    entries.every((e) => e.quantity === entries[0].quantity)
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
    <div className="grid gap-3.5">
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
          className={`border-brand text-brand-dark flex min-h-21 w-full items-center justify-center gap-3 rounded-[18px] border-2 border-dashed text-[26px] font-extrabold transition-colors ${
            dragging ? "bg-brand-soft" : "bg-brand-tint"
          }`}
        >
          <PlusIcon className="size-7.5" />
          {entries.length ? "再加照片" : "加照片"}
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
          className="rounded-[14px] border border-amber-300 bg-amber-50 p-4 text-lg text-amber-900"
        >
          <div className="flex items-start justify-between gap-2">
            <p className="font-bold">這些檔案沒有加入：</p>
            <button
              type="button"
              onClick={() => uploader.dismissNotices(bucket)}
              className="-my-2 min-h-11 px-1 text-base underline"
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
        <p className="rounded-[14px] bg-orange-50 p-4 text-lg text-orange-900">
          有 {missing} 張照片上次沒傳完，請再選一次同一張，或拿掉它。
        </p>
      )}

      {entries.length > 0 && (
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-xl font-bold">已選 {entries.length} 張照片</h3>
          <span className="text-muted text-lg">
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

      {quantityUnit && entries.length > 1 && (
        <div className="bg-subtle flex items-center justify-between gap-2 rounded-[18px] py-2.5 pr-2.5 pl-4">
          <span className="text-xl font-bold">
            全部都{quantityUnit === "張" ? "洗" : "印"}
          </span>
          <span className="flex items-center gap-1">
            <StepButton
              onClick={() => setAll(bulkBase - 1)}
              label={`全部減一${quantityUnit}`}
            >
              −
            </StepButton>
            <span className="min-w-18 text-center text-xl font-bold">
              {sameQty ? (
                <>
                  <span className="text-[28px] font-extrabold">{sameQty}</span>{" "}
                  {quantityUnit}
                </>
              ) : (
                "不一樣"
              )}
            </span>
            <StepButton
              onClick={() => setAll(bulkBase + 1)}
              label={`全部加一${quantityUnit}`}
              primary
            >
              +
            </StepButton>
          </span>
        </div>
      )}

      {entries.length > 0 && quantityUnit && (
        <ul className="grid gap-2.5 md:grid-cols-2">
          {entries.map((e) => (
            <li
              key={e.localId}
              className="border-line bg-card grid content-start gap-2 rounded-[18px] border p-2"
            >
              <div className="flex items-center gap-2">
                <Thumb entry={e} className="size-17 min-w-12 shrink" />
                <div className="min-w-0 flex-1">
                  <Stepper
                    value={e.quantity}
                    onChange={(q) => uploader.setQuantity([e.localId], q)}
                    label={`${e.fileName} ${quantityUnit}數`}
                    unit={quantityUnit}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => void uploader.remove(e.localId)}
                  aria-label={`移除 ${e.fileName}`}
                  className="text-muted grid size-11 shrink-0 place-items-center rounded-xl"
                >
                  <TrashIcon className="size-6.5" />
                </button>
              </div>
              <RowStatus
                entry={e}
                duplicate={duplicates.has(e.localId)}
                onRetry={() => void uploader.retry(e.localId)}
              />
            </li>
          ))}
        </ul>
      )}

      {entries.length > 0 && !quantityUnit && (
        <ul className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 md:grid-cols-5">
          {entries.map((e) => (
            <li key={e.localId} className="relative">
              <Thumb entry={e} className="aspect-square w-full" />
              <button
                type="button"
                onClick={() => void uploader.remove(e.localId)}
                aria-label={`移除 ${e.fileName}`}
                className="absolute top-1 right-1 grid size-10 place-items-center rounded-full bg-[#241e1a]/75 text-white"
              >
                <XIcon className="size-5.5" />
              </button>
              <TileStatus
                entry={e}
                onRetry={() => void uploader.retry(e.localId)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Thumb({ entry: e, className }: { entry: Entry; className: string }) {
  return (
    <div
      className={`bg-subtle aspect-square overflow-hidden rounded-xl ${className}`}
    >
      {e.previewUrl ? (
        // Local blob: / presigned R2 URLs; next/image can't optimize either
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={e.previewUrl}
          alt={e.fileName}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="text-muted grid h-full place-items-center px-1 text-center text-xs break-all">
          {e.fileName}
        </div>
      )}
    </div>
  );
}

/** Upload progress / failure under a photo row; only a duplicate hint once uploaded. */
function RowStatus({
  entry: e,
  duplicate,
  onRetry,
}: {
  entry: Entry;
  duplicate: boolean;
  onRetry: () => void;
}) {
  if (e.status === "uploaded") {
    if (!duplicate) return null;
    return (
      <p className="px-1 pb-1 text-base font-bold text-[#7a4b00]">
        跟另一張一樣，可以拿掉一張
      </p>
    );
  }
  const bad = e.status === "failed" || e.status === "missing";
  return (
    <div
      className={`grid gap-1.5 px-1 pb-1 text-base font-bold ${
        bad ? "text-red-700" : "text-muted"
      }`}
    >
      <span className="flex items-center justify-between gap-2">
        <span>
          {STATUS_LABEL[e.status]}
          {e.status === "uploading" && ` ${Math.round(e.progress * 100)}%`}
        </span>
        {e.status === "failed" && e.file && (
          <button
            type="button"
            onClick={onRetry}
            className="-my-2 min-h-11 px-2 underline underline-offset-4"
          >
            再傳一次
          </button>
        )}
      </span>
      {(e.status === "uploading" || e.status === "confirming") && (
        <span className="bg-line h-2 overflow-hidden rounded-full">
          <span
            className="bg-brand block h-full rounded-full transition-[width]"
            style={{ width: `${e.progress * 100}%` }}
          />
        </span>
      )}
      {e.error && <span className="font-normal">{e.error}</span>}
    </div>
  );
}

/** Upload progress / failure laid over a thumbnail tile; nothing once uploaded. */
function TileStatus({
  entry: e,
  onRetry,
}: {
  entry: Entry;
  onRetry: () => void;
}) {
  if (e.status === "uploaded") return null;
  const bad = e.status === "failed" || e.status === "missing";
  return (
    <div
      className={`absolute inset-x-0 bottom-0 grid gap-1 rounded-b-xl p-1.5 text-[13px] font-medium text-white ${
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
      className="flex items-center justify-center gap-1"
    >
      <StepButton
        onClick={() => set(value - 1)}
        label={`減一${unit ?? ""}`}
        disabled={value <= min}
      >
        −
      </StepButton>
      <span
        className="min-w-16 text-center text-xl font-bold tabular-nums"
        aria-live="polite"
      >
        <span className="text-[30px] leading-none font-extrabold">{value}</span>
        {unit && ` ${unit}`}
      </span>
      <StepButton
        onClick={() => set(value + 1)}
        label={`加一${unit ?? ""}`}
        disabled={value >= MAX_QUANTITY}
        primary
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
  primary,
  children,
}: {
  onClick: () => void;
  label: string;
  disabled?: boolean;
  primary?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      disabled={disabled}
      className={`grid size-13 shrink-0 place-items-center rounded-full border-2 text-[32px] leading-none font-bold disabled:opacity-30 ${
        primary
          ? "border-brand bg-brand text-white"
          : "bg-card border-[#c9c2bb]"
      }`}
    >
      {children}
    </button>
  );
}
