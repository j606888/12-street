"use client";

import { useState } from "react";
import { ImageIcon } from "@/components/icons";
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

/** The order's photo list with folder chips; long lists start collapsed. */
export function PhotoTable({ photos }: { photos: PhotoRow[] }) {
  const [folder, setFolder] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

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
                    <span className="bg-admin-chip grid size-8 shrink-0 place-items-center rounded-md text-[#8a909b]">
                      <ImageIcon className="size-4" />
                    </span>
                    <span className="font-admin-mono text-xs break-all">
                      {p.fileName}
                    </span>
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
    </>
  );
}
