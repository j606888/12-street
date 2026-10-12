"use client";

import { useRef, useState } from "react";
import { getPhotoUrl } from "@/actions/admin";
import { ImageIcon, XIcon } from "@/components/icons";
import { td, th } from "./ui";

export type PhotoRow = {
  id: string;
  fileName: string;
  folder: string;
  quantity: string;
  size: string;
  pending: boolean;
};

const PREVIEW = 20;

type Preview = { id: string; fileName: string; url: string | null; error?: string };

/** The order's photo list with folder chips; long lists start collapsed. */
export function PhotoTable({
  orderId,
  photos,
}: {
  orderId: string;
  photos: PhotoRow[];
}) {
  const [folder, setFolder] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);

  // Only the clicked photo is fetched, as the full-size original from R2.
  async function open(p: PhotoRow) {
    setPreview({ id: p.id, fileName: p.fileName, url: null });
    dialog.current?.showModal();
    const r = await getPhotoUrl({ orderId, photoId: p.id }).catch(() => null);
    setPreview((cur) =>
      cur?.id !== p.id
        ? cur
        : r?.ok
          ? { ...cur, url: r.url }
          : { ...cur, error: r?.error ?? "讀取失敗，請再試一次" },
    );
  }

  const folders = [...new Set(photos.map((p) => p.folder))];
  const filtered = folder ? photos.filter((p) => p.folder === folder) : photos;
  const visible = showAll ? filtered : filtered.slice(0, PREVIEW);

  const chip = (on: boolean) =>
    `h-7 rounded-full px-3 text-xs font-medium ${
      on ? "bg-ink text-white" : "bg-admin-chip text-ink-2 hover:bg-admin-field"
    }`;

  return (
    <>
      {folders.length > 1 && (
        <div
          role="group"
          aria-label="依資料夾篩選"
          className="flex flex-wrap gap-2 px-5 pt-3"
        >
          <button
            type="button"
            aria-pressed={folder === null}
            onClick={() => setFolder(null)}
            className={chip(folder === null)}
          >
            全部 {photos.length}
          </button>
          {folders.map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={folder === f}
              onClick={() => setFolder(f)}
              className={chip(folder === f)}
            >
              {f}・{photos.filter((p) => p.folder === f).length}
            </button>
          ))}
        </div>
      )}
      <div className="overflow-x-auto pt-2">
        <table className="w-full min-w-[520px] text-[13px]">
          <thead>
            <tr>
              <th className={th}>檔名</th>
              <th className={th}>資料夾</th>
              <th className={`${th} text-right`}>數量</th>
              <th className={`${th} text-right`}>大小</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((p) => (
              <tr
                key={p.id}
                className="border-admin-line-soft hover:bg-admin-hover border-t"
              >
                <td className={`${td} py-2.5`}>
                  <span className="flex items-center gap-2.5">
                    {p.pending ? (
                      <>
                        <span className="bg-admin-chip grid size-8 shrink-0 place-items-center rounded-md text-[#8a909b]">
                          <ImageIcon className="size-4" />
                        </span>
                        <span className="font-admin-mono text-xs break-all">
                          {p.fileName}
                        </span>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => open(p)}
                        aria-label={`預覽 ${p.fileName}`}
                        className="group -my-1.5 flex min-h-11 items-center gap-2.5 text-left"
                      >
                        <span className="bg-admin-chip group-hover:text-accent grid size-8 shrink-0 place-items-center rounded-md text-[#8a909b]">
                          <ImageIcon className="size-4" />
                        </span>
                        <span className="font-admin-mono group-hover:text-accent text-xs break-all underline-offset-2 group-hover:underline">
                          {p.fileName}
                        </span>
                      </button>
                    )}
                    {p.pending && (
                      <span className="bg-danger-bg text-danger-fg rounded px-1.5 text-[11px] font-semibold whitespace-nowrap">
                        未上傳完成
                      </span>
                    )}
                  </span>
                </td>
                <td className={`${td} text-ink-2 py-2.5`}>{p.folder}</td>
                <td className={`${td} py-2.5 text-right tabular-nums`}>
                  {p.quantity}
                </td>
                <td
                  className={`${td} text-ink-3 py-2.5 text-right tabular-nums`}
                >
                  {p.size}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {filtered.length > PREVIEW && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="border-admin-line-soft text-accent hover:text-accent-dark h-11 w-full border-t bg-[#fafbfc] text-[13px] font-medium"
        >
          {showAll ? "收合" : `顯示全部 ${filtered.length} 張`}
        </button>
      )}
      <dialog
        ref={dialog}
        onClose={() => setPreview(null)}
        onClick={(e) => e.target === e.currentTarget && dialog.current?.close()}
        aria-label={preview?.fileName ?? "照片預覽"}
        className="m-auto max-h-[92vh] max-w-[92vw] rounded-xl bg-white p-0 backdrop:bg-black/70"
      >
        {preview && (
          <div className="flex flex-col">
            <div className="border-admin-line-soft flex items-center gap-3 border-b px-4 py-2">
              <span className="font-admin-mono min-w-0 flex-1 truncate text-xs">
                {preview.fileName}
              </span>
              {preview.url && (
                <a
                  href={preview.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent hover:text-accent-dark text-[13px] font-medium whitespace-nowrap"
                >
                  開新分頁
                </a>
              )}
              <button
                type="button"
                onClick={() => dialog.current?.close()}
                aria-label="關閉"
                className="text-ink-3 hover:text-ink -mr-2 grid size-11 place-items-center"
              >
                <XIcon className="size-5" />
              </button>
            </div>
            {preview.url ? (
              // Presigned R2 URL straight to the browser; next/image would proxy it.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={preview.url}
                alt={preview.fileName}
                className="max-h-[calc(92vh-3.5rem)] max-w-[92vw] object-contain"
              />
            ) : (
              <p className="text-ink-3 px-10 py-16 text-center text-[13px]">
                {preview.error ?? "載入原圖中…（原圖檔案較大，請稍候）"}
              </p>
            )}
          </div>
        )}
      </dialog>
    </>
  );
}
