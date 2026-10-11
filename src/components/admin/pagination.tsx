import Link from "next/link";
import { PAGE_SIZE } from "@/lib/admin";
import { btn } from "./ui";

/** Table footer: "第 1–50 筆，共 N 筆" plus previous/next links that keep the other params. */
export function Pagination({
  path,
  params,
  page,
  total,
  unit = "筆",
}: {
  path: string;
  params: Record<string, string | number | undefined>;
  page: number;
  total: number;
  unit?: string;
}) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const from = Math.min(total, (page - 1) * PAGE_SIZE + 1);
  const to = Math.min(total, page * PAGE_SIZE);

  const href = (p: number) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== "" && k !== "page") qs.set(k, String(v));
    }
    if (p > 1) qs.set("page", String(p));
    const s = qs.toString();
    return s ? `${path}?${s}` : path;
  };

  const off = `${btn.secondary} pointer-events-none text-[#a3a8b1]`;

  return (
    <nav
      aria-label="分頁"
      className="border-admin-line-soft text-ink-3 flex flex-wrap items-center gap-3 border-t px-5 py-3 text-[13px]"
    >
      <span className="flex-1">
        第 {from}–{to} {unit}，共 {total} {unit}
      </span>
      {pages > 1 && (
        <>
          {page > 1 ? (
            <Link href={href(page - 1)} className={btn.secondary}>
              上一頁
            </Link>
          ) : (
            <span aria-disabled="true" className={off}>
              上一頁
            </span>
          )}
          {page < pages ? (
            <Link href={href(page + 1)} className={btn.secondary}>
              下一頁
            </Link>
          ) : (
            <span aria-disabled="true" className={off}>
              下一頁
            </span>
          )}
        </>
      )}
    </nav>
  );
}
