import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { MemberTags, TagOptions } from "@/components/admin/member-tags";
import { Pagination } from "@/components/admin/pagination";
import {
  btn,
  Card,
  EmptyState,
  field,
  PageHeader,
  td,
  th,
} from "@/components/admin/ui";
import { SearchIcon } from "@/components/icons";
import { listMembers, listTags } from "@/lib/admin";
import { formatTaipeiTime } from "@/lib/format";
import {
  firstParam,
  memberFilterInput,
  type MemberFilter,
} from "@/lib/validators/admin";
import { requireAdmin } from "@/lib/session";

export const metadata: Metadata = { title: "會員｜後台" };

const AVATAR_TONES = [
  "bg-ok-bg text-ok-fg",
  "bg-info-bg text-info-fg",
  "bg-warn-bg text-warn-fg",
  "bg-[#f3e8fd] text-[#6a2ba8]",
  "bg-danger-bg text-danger-fg",
];

/** Same member, same avatar colour. */
function avatarTone(id: string) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) | 0;
  return AVATAR_TONES[Math.abs(h) % AVATAR_TONES.length];
}

export default function AdminMembersPage({
  searchParams,
}: PageProps<"/admin/members">) {
  return (
    <main className="grid grid-cols-1 gap-5">
      <PageHeader
        title="會員"
        description="用 LINE 登入過的客人。訪客訂單不會出現在這裡。"
      />
      <Suspense fallback={<p className="text-ink-4">載入中…</p>}>
        <Members searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

function membersHref(filter: MemberFilter, tag: number | undefined) {
  const qs = new URLSearchParams();
  if (filter.q) qs.set("q", filter.q);
  if (tag) qs.set("tag", String(tag));
  const s = qs.toString();
  return s ? `/admin/members?${s}` : "/admin/members";
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

  const chip = (on: boolean) =>
    `inline-flex h-9 items-center rounded-full border px-3.5 text-[13px] font-medium ${
      on
        ? "border-ink bg-ink text-white"
        : "border-admin-field bg-white text-ink-2 hover:border-ink-4"
    }`;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2.5">
        <form className="flex max-w-[420px] min-w-64 flex-1">
          {filter.tag && <input type="hidden" name="tag" value={filter.tag} />}
          <label
            className={`${field} text-ink-4 focus-within:border-accent focus-within:ring-accent-soft flex flex-1 items-center gap-2 focus-within:ring-3`}
          >
            <SearchIcon className="size-4 shrink-0" />
            <span className="sr-only">搜尋會員</span>
            <input
              type="search"
              name="q"
              defaultValue={filter.q ?? ""}
              placeholder="名稱、手機（按 Enter 搜尋）"
              className="text-ink min-w-0 flex-1 bg-transparent outline-none"
            />
          </label>
        </form>
        {tags.length > 0 && (
          <nav aria-label="依標籤篩選" className="flex flex-wrap gap-1.5">
            <Link
              href={membersHref(filter, undefined)}
              aria-current={!filter.tag ? "page" : undefined}
              className={chip(!filter.tag)}
            >
              全部
            </Link>
            {tags.map((t) => (
              <Link
                key={t.id}
                href={membersHref(filter, t.id)}
                aria-current={filter.tag === t.id ? "page" : undefined}
                className={chip(filter.tag === t.id)}
              >
                {t.name}
              </Link>
            ))}
          </nav>
        )}
        {filter.q && (
          <Link
            href={membersHref({ ...filter, q: undefined }, filter.tag)}
            className={`${btn.link} px-1 text-[13px]`}
          >
            清除搜尋
          </Link>
        )}
      </div>

      {rows.length === 0 ? (
        <EmptyState>沒有符合條件的會員</EmptyState>
      ) : (
        <Card>
          <TagOptions names={tags.map((t) => t.name)} />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-[13px]">
              <thead className="bg-[#fafbfc]">
                <tr>
                  <th className={th}>會員・標籤</th>
                  <th className={th}>手機</th>
                  <th className={th}>訂單</th>
                  <th className={th}>加入時間</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((m) => (
                  <tr
                    key={m.id}
                    className="border-admin-line-soft hover:bg-admin-hover border-t"
                  >
                    <td className={`${td} align-middle`}>
                      <div className="flex items-center gap-2.5">
                        <span
                          className={`grid size-8 shrink-0 place-items-center rounded-full text-[13px] font-semibold ${avatarTone(m.id)}`}
                        >
                          {m.name.slice(0, 1)}
                        </span>
                        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                          <span className="mr-0.5 font-medium">{m.name}</span>
                          {m.role === "admin" && (
                            <span className="border-admin-line text-ink-3 rounded border px-1.5 text-[11px]">
                              管理員
                            </span>
                          )}
                          <MemberTags userId={m.id} tags={m.tags} />
                        </div>
                      </div>
                    </td>
                    <td
                      className={`${td} font-admin-mono text-ink-2 align-middle`}
                    >
                      {m.phone ?? "—"}
                    </td>
                    <td className={`${td} align-middle`}>
                      {m.orderCount > 0 ? (
                        <Link
                          href={`/admin/orders?member=${m.id}`}
                          className={btn.link}
                        >
                          {m.orderCount} 筆
                        </Link>
                      ) : (
                        <span className="text-ink-4">0 筆</span>
                      )}
                      {m.lastOrderAt && (
                        <div className="text-ink-4 text-xs">
                          最近 {formatTaipeiTime(m.lastOrderAt)}
                        </div>
                      )}
                    </td>
                    <td className={`${td} text-ink-3 align-middle`}>
                      {formatTaipeiTime(m.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            path="/admin/members"
            params={filter}
            page={filter.page}
            total={total}
            unit="位"
          />
        </Card>
      )}
    </>
  );
}
