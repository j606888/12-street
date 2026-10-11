"use client";

import { useState } from "react";
import { makeZip } from "client-zip";
import { getZipFiles } from "@/actions/admin";
import { DownloadIcon } from "@/components/icons";
import { btn } from "./ui";

type SaveFilePicker = (options: {
  suggestedName: string;
  types: { description: string; accept: Record<string, string[]> }[];
}) => Promise<{ createWritable(): Promise<WritableStream<Uint8Array>> }>;

/**
 * Zips the order's photos in the browser straight from R2 (presigned GETs),
 * so nothing passes through a Vercel Function.
 */
export function ZipDownloadButton({
  orderId,
  fileName,
  variant = "button",
}: {
  orderId: string;
  fileName: string;
  /** "icon": a square icon-only button for table rows */
  variant?: "button" | "large" | "icon";
}) {
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = progress !== null;

  async function download() {
    setError(null);
    setProgress("準備中…");

    let writable: WritableStream<Uint8Array> | null = null;
    try {
      // Ask for the save location first, while we still have the user gesture
      const picker = (window as { showSaveFilePicker?: SaveFilePicker })
        .showSaveFilePicker;
      if (picker) {
        const handle = await picker({
          suggestedName: fileName,
          types: [
            { description: "ZIP", accept: { "application/zip": [".zip"] } },
          ],
        });
        writable = await handle.createWritable();
      }

      const res = await getZipFiles({ orderId });
      if (!res.ok) throw new Error(res.error);
      const { files } = res;
      let done = 0;
      setProgress(`打包中 0 / ${files.length}`);

      async function* entries() {
        for (const f of files) {
          const r = await fetch(f.url);
          if (!r.ok) throw new Error(`下載失敗：${f.name}`);
          yield { name: f.name, input: r };
          setProgress(`打包中 ${++done} / ${files.length}`);
        }
      }
      const zip = makeZip(entries());

      if (writable) {
        await zip.pipeTo(writable);
      } else {
        // Fallback (no File System Access API): buffer in memory
        const blob = await new Response(zip).blob();
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = fileName;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
      }
      setProgress(null);
    } catch (err) {
      await writable?.abort().catch(() => {});
      setProgress(null);
      if ((err as Error).name === "AbortError") return; // picker cancelled
      setError(
        err instanceof TypeError
          ? "無法連到照片儲存空間（請確認 R2 CORS 設定）"
          : (err as Error).message,
      );
    }
  }

  const icon = variant === "icon";
  return (
    <span className="inline-grid justify-items-end gap-1 align-middle">
      <button
        type="button"
        onClick={download}
        disabled={busy}
        aria-label={icon ? "下載照片 ZIP" : undefined}
        title={icon ? "下載照片 ZIP" : undefined}
        className={`${btn.secondary} ${
          icon && !busy
            ? "w-9 px-0"
            : variant === "large"
              ? "h-10 px-3.5 text-sm"
              : ""
        }`}
      >
        {(!busy || !icon) && <DownloadIcon className="size-4" />}
        {icon ? busy && progress : (progress ?? "下載照片 ZIP")}
      </button>
      {error && (
        <span
          role="alert"
          className="text-danger-fg max-w-72 text-right text-xs"
        >
          {error}
        </span>
      )}
    </span>
  );
}
