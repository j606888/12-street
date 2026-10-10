import Link from "next/link";
import { PAGE_SIZE } from "@/lib/admin";

/** Previous/next links that keep the other search params. */
export function Pagination({
  path,
  params,
  page,
  total,
}: {
  path: string;
  params: Record<string, string | number | undefined>;
  page: number;
  total: number;
}) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (pages === 1) return null;

  const href = (p: number) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== "" && k !== "page") qs.set(k, String(v));
    }
    if (p > 1) qs.set("page", String(p));
    const s = qs.toString();
    return s ? `${path}?${s}` : path;
  };

  return (
    <nav className="flex items-center justify-center gap-4 text-sm">
      {page > 1 ? (
        <Link href={href(page - 1)} className="py-2.5 text-sky-700 underline">
          上一頁
        </Link>
      ) : (
        <span className="text-neutral-300">上一頁</span>
      )}
      <span className="text-neutral-600">
        第 {page} / {pages} 頁（共 {total} 筆）
      </span>
      {page < pages ? (
        <Link href={href(page + 1)} className="py-2.5 text-sky-700 underline">
          下一頁
        </Link>
      ) : (
        <span className="text-neutral-300">下一頁</span>
      )}
    </nav>
  );
}
