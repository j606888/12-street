import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Pagination } from "@/components/admin/pagination";
import { TagToggle } from "@/components/admin/tag-toggle";
import { listMembers, listTags } from "@/lib/admin";
import { formatTaipeiTime } from "@/lib/format";
import { firstParam, memberFilterInput } from "@/lib/validators/admin";
import { requireAdmin } from "@/lib/session";

export const metadata: Metadata = { title: "會員｜後台" };

export default function AdminMembersPage({
  searchParams,
}: PageProps<"/admin/members">) {
  return (
    <main className="grid gap-4">
      <h1 className="text-2xl font-bold">會員</h1>
      <Suspense fallback={<p className="text-neutral-400">載入中…</p>}>
        <Members searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Members({
  searchParams,
}: Pick<PageProps<"/admin/members">, "searchParams">) {
  await requireAdmin();
  const sp = await searchParams;
  const filter = memberFilterInput.parse({
    tag: firstParam(sp.tag),
    q: firstParam(sp.q),
    page: firstParam(sp.page),
  });
  const [{ rows, total }, tags] = await Promise.all([
    listMembers(filter),
    listTags(),
  ]);

  return (
    <>
      <form className="flex flex-wrap items-end gap-3 text-sm">
        <label className="grid gap-1">
          標籤
          <select
            name="tag"
            defaultValue={filter.tag ?? ""}
            className="rounded-lg border bg-white px-3 py-2"
          >
            <option value="">全部</option>
            {tags.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1">
          搜尋
          <input
            name="q"
            defaultValue={filter.q ?? ""}
            placeholder="名稱、手機"
            className="rounded-lg border px-3 py-2"
          />
        </label>
        <button className="rounded-lg bg-neutral-900 px-4 py-2 font-bold text-white">
          篩選
        </button>
        <Link href="/admin/members" className="py-2 text-sky-700 underline">
          清除
        </Link>
      </form>
      <p className="text-sm text-neutral-500">點標籤可以加上或移除。</p>

      {rows.length === 0 ? (
        <p className="rounded-xl bg-neutral-50 p-6 text-center text-neutral-600">
          沒有符合條件的會員
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b text-left text-neutral-500">
              <tr>
                <th className="py-2 font-normal">會員</th>
                <th className="py-2 font-normal">手機</th>
                <th className="py-2 font-normal">加入時間</th>
                <th className="py-2 font-normal">訂單</th>
                <th className="py-2 font-normal">標籤</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.id} className="border-b align-top">
                  <td className="py-3">
                    {m.name}
                    {m.role === "admin" && (
                      <span className="ml-1 text-xs text-neutral-400">
                        管理員
                      </span>
                    )}
                  </td>
                  <td className="py-3 text-neutral-600">{m.phone ?? "—"}</td>
                  <td className="py-3 text-neutral-600">
                    {formatTaipeiTime(m.createdAt)}
                  </td>
                  <td className="py-3">
                    {m.orderCount > 0 ? (
                      <Link
                        href={`/admin/orders?member=${m.id}`}
                        className="text-sky-700 underline"
                      >
                        {m.orderCount} 筆
                      </Link>
                    ) : (
                      <span className="text-neutral-400">0 筆</span>
                    )}
                    {m.lastOrderAt && (
                      <p className="text-xs text-neutral-500">
                        最近 {formatTaipeiTime(m.lastOrderAt)}
                      </p>
                    )}
                  </td>
                  <td className="py-3">
                    <div className="flex flex-wrap gap-1">
                      {tags.map((t) => (
                        <TagToggle
                          key={t.id}
                          userId={m.id}
                          tag={t}
                          on={m.tags.some((x) => x.id === t.id)}
                        />
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination
        path="/admin/members"
        params={filter}
        page={filter.page}
        total={total}
      />
    </>
  );
}
