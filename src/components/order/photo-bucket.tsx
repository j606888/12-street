"use client";

import { useImperativeHandle, useMemo, useRef, useState } from "react";
import {
  CheckIcon,
  ChevronDownIcon,
  MinusIcon,
  PlusIcon,
  UploadIcon,
  XIcon,
} from "@/components/icons";
import { MAX_QUANTITY } from "@/lib/validators/order";
import type { Entry, Notice, PhotoUploader } from "./use-photo-uploader";

const STATUS_LABEL: Record<Entry["status"], string> = {
  hashing: "檢查中…",
  converting: "轉成 JPG 中…",
  registering: "準備上傳…",
  queued: "等待上傳",
  uploading: "上傳中",
  confirming: "確認中…",
  uploaded: "已上傳",
  failed: "上傳失敗",
  missing: "未完成上傳",
};

/** Lets the screen around the bucket open the file picker. */
export type PhotoBucketHandle = { openPicker: () => void };

export function PhotoBucket({
  ref,
  bucket,
  entries,
  notices,
  uploader,
  quantityUnit,
  laminationPrice,
  idPhotoSets,
  backgroundRemovalPrice,
  onRemoveAll,
}: {
  ref?: React.Ref<PhotoBucketHandle>;
  bucket: string;
  entries: Entry[];
  notices: Notice[];
  uploader: PhotoUploader;
  /** Show a quantity per photo, counted in this unit (prints or ID-photo sets). */
  quantityUnit?: "張" | "組";
  /** Per-print lamination (護貝) price; pass it to let each photo pick how many prints to laminate. */
  laminationPrice?: number;
  /** ID-photo sets (證件照) in labelled sections; pass them to let each photo pick its own set. */
  idPhotoSets?: { label: string; sets: { id: number; name: string }[] }[];
  /** 去背 price per photo; pass it to give each photo a 去背 checkbox. */
  backgroundRemovalPrice?: number;
  /** Offer a confirmed "remove every photo" next to the count. */
  onRemoveAll?: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const openPicker = () => inputRef.current?.click();
  useImperativeHandle(ref, () => ({ openPicker }));

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
  const ids = entries.map((e) => e.localId);
  const laminatable = laminationPrice !== undefined;

  /** The value every photo shares, or null when they differ. */
  const shared = (pick: (e: Entry) => number) =>
    entries.length > 0 && entries.every((e) => pick(e) === pick(entries[0]))
      ? pick(entries[0])
      : null;
  const sameQty = shared((e) => e.quantity);
  const sameLam = shared((e) => e.laminateQuantity);
  const qtyBase = sameQty ?? Math.max(1, ...entries.map((e) => e.quantity));
  const lamBase =
    sameLam ?? Math.max(0, ...entries.map((e) => e.laminateQuantity));

  function pick(files: FileList | null) {
    if (files?.length) void uploader.addFiles(bucket, Array.from(files));
  }

  return (
    <div
      className={`grid gap-3.5 rounded-2xl ${
        dragging ? "outline-brand outline-2 outline-offset-4" : ""
      }`}
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
      <input
        ref={inputRef}
        type="file"
        accept="image/*,.heic,.heif"
        multiple
        hidden
        onChange={(e) => {
          pick(e.target.files);
          e.target.value = "";
        }}
      />

      {notices.length > 0 && (
        <div
          role="alert"
          className="rounded-[14px] border border-amber-300 bg-amber-50 p-3.5 text-base text-amber-900"
        >
          <div className="flex items-start justify-between gap-2">
            <p className="font-bold">這些檔案沒有加入：</p>
            <button
              type="button"
              onClick={() => uploader.dismissNotices(bucket)}
              className="-my-2 min-h-11 px-1 text-[15px] underline"
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
        <p className="rounded-[14px] bg-orange-50 p-3.5 text-base text-orange-900">
          有 {missing} 張照片上次沒傳完，請再選一次同一張，或拿掉它。
        </p>
      )}

      {entries.length === 0 && (
        <button
          type="button"
          onClick={openPicker}
          className={`border-field hover:border-brand hover:bg-brand-tint grid min-h-90 content-center justify-items-center gap-3.5 rounded-2xl border-2 border-dashed px-4 py-10 text-center transition-colors ${
            dragging ? "border-brand bg-brand-tint" : "bg-card"
          }`}
        >
          <span className="bg-brand-soft text-brand-dark grid size-18 place-items-center rounded-[20px]">
            <UploadIcon className="size-9" />
          </span>
          <span className="text-xl font-bold">
            點這裡選照片
            <span className="hidden pointer-fine:inline">，或把照片拖進來</span>
          </span>
          <span className="text-muted text-base leading-relaxed">
            可以一次選很多張
            <br />
            JPG、HEIC（iPhone）、PNG 都可以
          </span>
          <span className="border-brand text-brand-dark mt-1.5 inline-flex h-12 items-center gap-2 rounded-[14px] border-2 px-5.5 text-[17px] font-bold">
            <PlusIcon className="size-5" />
            從相簿選
          </span>
        </button>
      )}

      {entries.length > 0 && (
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h3 className="text-xl font-bold">已放 {entries.length} 張照片</h3>
          <span className="text-muted flex items-baseline gap-3 text-base">
            {done < entries.length || failed > 0 ? (
              <span>
                已上傳 {done}／{entries.length}
                {failed > 0 && (
                  <span className="text-red-700">，失敗 {failed} 張</span>
                )}
              </span>
            ) : (
              quantityUnit && (
                <span>
                  共 {prints} {quantityUnit}
                </span>
              )
            )}
            {onRemoveAll && <RemoveAll key={bucket} onConfirm={onRemoveAll} />}
          </span>
        </div>
      )}

      {quantityUnit && entries.length > 1 && (
        <div className="bg-subtle divide-line grid divide-y rounded-2xl pr-1.5 pl-3.5">
          <CountRow
            label={`全部${quantityUnit}數`}
            value={sameQty}
            unit={quantityUnit}
            size="lg"
            onMinus={() => uploader.setQuantity(ids, clampQty(qtyBase - 1))}
            onPlus={() => uploader.setQuantity(ids, clampQty(qtyBase + 1))}
            minusLabel={`全部減一${quantityUnit}`}
            plusLabel={`全部加一${quantityUnit}`}
          />
          {laminatable && (
            <CountRow
              label="全部護貝"
              note={`每張 +$${laminationPrice}`}
              value={sameLam}
              unit="張"
              size="lg"
              onMinus={() => uploader.setLaminateQuantity(ids, lamBase - 1)}
              onPlus={() => uploader.setLaminateQuantity(ids, lamBase + 1)}
              minusLabel="全部少護貝一張"
              plusLabel="全部多護貝一張"
            />
          )}
        </div>
      )}

      {entries.length > 0 && quantityUnit && (
        <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4">
          <li className="grid">
            <AddTile onClick={openPicker} dragging={dragging} />
          </li>
          {entries.map((e) => (
            <li
              key={e.localId}
              className="border-line bg-card grid content-start overflow-hidden rounded-2xl border"
            >
              <div className="relative">
                <Thumb entry={e} className="aspect-[3/2] w-full" />
                <RemoveButton
                  fileName={e.fileName}
                  onClick={() => void uploader.remove(e.localId)}
                />
              </div>
              <div className="grid px-1 pt-1 pb-1">
                <CountRow
                  label={`${quantityUnit}數`}
                  groupLabel={`${e.fileName} ${quantityUnit}數`}
                  value={e.quantity}
                  onMinus={() =>
                    uploader.setQuantity([e.localId], clampQty(e.quantity - 1))
                  }
                  onPlus={() =>
                    uploader.setQuantity([e.localId], clampQty(e.quantity + 1))
                  }
                  minusDisabled={e.quantity <= 1}
                  plusDisabled={e.quantity >= MAX_QUANTITY}
                  minusLabel={`減一${quantityUnit}`}
                  plusLabel={`加一${quantityUnit}`}
                />
                {laminatable && (
                  <CountRow
                    label="護貝"
                    groupLabel={`${e.fileName} 護貝張數`}
                    value={e.laminateQuantity}
                    active={e.laminateQuantity > 0}
                    onMinus={() =>
                      uploader.setLaminateQuantity(
                        [e.localId],
                        e.laminateQuantity - 1,
                      )
                    }
                    onPlus={() =>
                      uploader.setLaminateQuantity(
                        [e.localId],
                        e.laminateQuantity + 1,
                      )
                    }
                    minusDisabled={e.laminateQuantity <= 0}
                    plusDisabled={e.laminateQuantity >= e.quantity}
                    minusLabel="少護貝一張"
                    plusLabel="多護貝一張"
                  />
                )}
                {idPhotoSets && (
                  // A native select can't wrap long names in a narrow tile, so
                  // show the name in a wrapping label and lay the select over it.
                  // New photos have no set yet, so that state stands out.
                  <div
                    className={`focus-within:outline-brand relative mx-1 mt-1 mb-1.5 flex min-h-11 items-center gap-1 rounded-xl border-2 py-1.5 pr-1.5 pl-2.5 focus-within:outline-2 focus-within:outline-offset-1 ${
                      e.productId === undefined
                        ? "border-brand bg-brand-tint text-brand-dark"
                        : "border-field bg-card"
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className="min-w-0 flex-1 text-[15px] leading-snug font-bold"
                    >
                      {idPhotoSets
                        .flatMap((g) => g.sets)
                        .find((s) => s.id === e.productId)?.name ?? "請選尺寸"}
                    </span>
                    <ChevronDownIcon
                      className={`size-4 shrink-0 ${
                        e.productId === undefined ? "" : "text-muted"
                      }`}
                    />
                    <select
                      value={e.productId ?? ""}
                      onChange={(ev) =>
                        uploader.setIdPhotoSet(
                          [e.localId],
                          Number(ev.target.value),
                        )
                      }
                      aria-label={`${e.fileName} 證件照尺寸`}
                      className="absolute inset-0 size-full cursor-pointer opacity-0"
                    >
                      {e.productId === undefined && (
                        <option value="" disabled>
                          請選尺寸
                        </option>
                      )}
                      {idPhotoSets.map((g) => (
                        <optgroup key={g.label} label={g.label}>
                          {g.sets.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>
                )}
                {backgroundRemovalPrice !== undefined && (
                  <label
                    className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-xl pr-2 pl-2 ${
                      e.removeBackground ? "bg-brand-tint" : ""
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={e.removeBackground}
                      onChange={(ev) =>
                        uploader.setRemoveBackground(
                          [e.localId],
                          ev.target.checked,
                        )
                      }
                      aria-label={`${e.fileName} 去背，加 ${backgroundRemovalPrice} 元`}
                      className="peer sr-only"
                    />
                    <span
                      aria-hidden="true"
                      className="border-field peer-checked:border-brand peer-checked:bg-brand peer-focus-visible:outline-brand bg-card grid size-5.5 shrink-0 place-items-center rounded-md border-2 text-white peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2"
                    >
                      {e.removeBackground && <CheckIcon className="size-4" />}
                    </span>
                    <span className="flex-1 text-base font-bold">去背</span>
                    <span className="text-muted text-[15px] tabular-nums">
                      +${backgroundRemovalPrice}
                    </span>
                  </label>
                )}
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
          <li className="grid aspect-square">
            <AddTile onClick={openPicker} dragging={dragging} compact />
          </li>
          {entries.map((e) => (
            <li key={e.localId} className="relative">
              <Thumb entry={e} className="aspect-square w-full rounded-xl" />
              <RemoveButton
                fileName={e.fileName}
                onClick={() => void uploader.remove(e.localId)}
              />
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

const clampQty = (n: number) => Math.min(MAX_QUANTITY, Math.max(1, n));

/** Dashed first cell of the photo grid: opens the picker, and lights up while dragging. */
function AddTile({
  onClick,
  dragging,
  compact,
}: {
  onClick: () => void;
  dragging: boolean;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`border-field hover:border-brand hover:bg-brand-tint grid content-center justify-items-center gap-2 rounded-2xl border-2 border-dashed p-3 text-center transition-colors ${
        compact ? "" : "min-h-56"
      } ${dragging ? "border-brand bg-brand-tint" : "bg-card"}`}
    >
      <span
        className={`bg-brand-soft text-brand-dark grid place-items-center rounded-2xl ${
          compact ? "size-10" : "size-13"
        }`}
      >
        <PlusIcon className={compact ? "size-5" : "size-6.5"} />
      </span>
      <span className="text-brand-dark text-[17px] font-bold">再加照片</span>
      {!compact && (
        <span className="text-muted text-[15px]">JPG、HEIC、PNG</span>
      )}
    </button>
  );
}

/** "全部拿掉" with an inline yes/no, so one tap can't wipe a whole size (or order). */
export function RemoveAll({
  label = "全部拿掉",
  onConfirm,
}: {
  label?: string;
  onConfirm: () => void;
}) {
  const [asking, setAsking] = useState(false);
  if (!asking)
    return (
      <button
        type="button"
        onClick={() => setAsking(true)}
        className="-my-2 min-h-11 font-bold underline underline-offset-4"
      >
        {label}
      </button>
    );
  return (
    <span className="-my-2 flex items-center gap-3">
      <span className="text-foreground font-bold">確定{label}？</span>
      <button
        type="button"
        onClick={onConfirm}
        className="min-h-11 font-bold text-red-700 underline underline-offset-4"
      >
        確定
      </button>
      <button
        type="button"
        onClick={() => setAsking(false)}
        className="min-h-11 underline underline-offset-4"
      >
        取消
      </button>
    </span>
  );
}

function Thumb({ entry: e, className }: { entry: Entry; className: string }) {
  return (
    <div className={`bg-subtle overflow-hidden ${className}`}>
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

/** Round ✕ on a thumbnail's top-right corner; the tap target is larger than the disc. */
function RemoveButton({
  fileName,
  onClick,
}: {
  fileName: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`移除 ${fileName}`}
      className="absolute top-0 right-0 grid size-12 place-items-center text-white"
    >
      <span className="bg-foreground/80 grid size-8 place-items-center rounded-full">
        <XIcon className="size-4" />
      </span>
    </button>
  );
}

/** "Label  −  n  +" row: per-photo counts and the apply-to-all rows above the grid. */
function CountRow({
  label,
  groupLabel,
  note,
  value,
  unit,
  size = "md",
  active,
  onMinus,
  onPlus,
  minusDisabled,
  plusDisabled,
  minusLabel,
  plusLabel,
}: {
  label: string;
  /** Accessible name when the visible label alone is ambiguous. */
  groupLabel?: string;
  note?: string;
  /** null = the photos differ. */
  value: number | null;
  unit?: string;
  size?: "md" | "lg";
  /** Tinted background, e.g. when a photo has prints to laminate. */
  active?: boolean;
  onMinus: () => void;
  onPlus: () => void;
  minusDisabled?: boolean;
  plusDisabled?: boolean;
  minusLabel: string;
  plusLabel: string;
}) {
  const lg = size === "lg";
  return (
    <div
      role="group"
      aria-label={groupLabel ?? label}
      className={`flex items-center ${lg ? "min-h-14 gap-1" : "rounded-xl pl-2"} ${
        active ? "bg-brand-tint" : ""
      }`}
    >
      <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2">
        <span className={`font-bold ${lg ? "text-[17px]" : "text-base"}`}>
          {label}
        </span>
        {note && (
          <span className="text-muted text-sm font-semibold">{note}</span>
        )}
      </span>
      <StepButton
        onClick={onMinus}
        label={minusLabel}
        disabled={minusDisabled}
        size={size}
      >
        <MinusIcon className={lg ? "size-4.5" : "size-4"} />
      </StepButton>
      <span
        className={`text-center font-bold tabular-nums ${
          lg ? "min-w-14 text-lg" : "min-w-7.5 text-[21px]"
        }`}
        aria-live="polite"
      >
        {value === null ? "不一樣" : unit ? `${value} ${unit}` : value}
      </span>
      <StepButton
        onClick={onPlus}
        label={plusLabel}
        disabled={plusDisabled}
        size={size}
        primary
      >
        <PlusIcon className={lg ? "size-4.5" : "size-4"} />
      </StepButton>
    </div>
  );
}

/** Upload progress / failure under a photo card; only a duplicate hint once uploaded. */
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
      <p className="px-3 pb-2 text-sm font-bold text-amber-800">
        跟另一張一樣，可以拿掉一張
      </p>
    );
  }
  const bad = e.status === "failed" || e.status === "missing";
  return (
    <div
      className={`grid gap-1.5 px-3 pb-2 text-sm font-bold ${
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
        <span className="bg-line h-1.5 overflow-hidden rounded-full">
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
        bad ? "bg-red-800/85" : "bg-foreground/65"
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
        size="lg"
      >
        <MinusIcon className="size-4.5" />
      </StepButton>
      <span
        className="min-w-14 text-center text-lg font-bold tabular-nums"
        aria-live="polite"
      >
        {value}
        {unit && ` ${unit}`}
      </span>
      <StepButton
        onClick={() => set(value + 1)}
        label={`加一${unit ?? ""}`}
        disabled={value >= MAX_QUANTITY}
        size="lg"
        primary
      >
        <PlusIcon className="size-4.5" />
      </StepButton>
    </div>
  );
}

/** Round −/+ button: the visible disc sits inside a larger tap target. */
function StepButton({
  onClick,
  label,
  disabled,
  primary,
  size,
  children,
}: {
  onClick: () => void;
  label: string;
  disabled?: boolean;
  primary?: boolean;
  size: "md" | "lg";
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      disabled={disabled}
      className={`grid shrink-0 place-items-center disabled:opacity-35 ${
        size === "lg" ? "size-12" : "size-11"
      }`}
    >
      <span
        className={`grid place-items-center rounded-full ${
          size === "lg" ? "size-10" : "size-9"
        } ${
          primary
            ? "bg-brand text-white"
            : "border-field bg-card border-[1.5px]"
        }`}
      >
        {children}
      </span>
    </button>
  );
}
