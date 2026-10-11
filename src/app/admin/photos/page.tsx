import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { DeletePhotosButton } from "@/components/admin/delete-photos-button";
import { ExpiryPill, OrderStatusBadge } from "@/components/admin/status-badges";
import {
  btn,
  Card,
  EmptyState,
  PageHeader,
  td,
  th,
} from "@/components/admin/ui";
import { PhoneIcon } from "@/components/icons";
import { listStoredPhotos } from "@/lib/admin";
import { daysUntil, formatBytes, formatTaipeiTime } from "@/lib/format";
import { requireAdmin } from "@/lib/session";
import { firstParam, photoViewInput } from "@/lib/validators/admin";

export const metadata: Metadata = { title: "照片｜後台" };

const VIEWS = [
  { key: "soon", label: "最快到期" },
  { key: "picked", label: "已取件・可刪除" },
  { key: "big", label: "最佔空間" },
] as const;

export default function AdminPhotosPage({
  searchParams,
}: PageProps<"/admin/photos">) {
  return (
    <main className="grid grid-cols-1 gap-5">
      <PageHeader
        title="照片保存"
        description="照片上傳後保存 1 個月，到期由系統自動刪除。客人取件後也可以提早刪除。"
      />
      <Suspense fallback={<p className="text-ink-4">載入中…</p>}>
        <StoredPhotos searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function StoredPhotos({
  searchParams,
}: Pick<PageProps<"/admin/photos">, "searchParams">) {
  await requireAdmin();
  const view = photoViewInput.parse(firstParam((await searchParams).view));
  const all = await listStoredPhotos();
  if (!all.length) return <EmptyState>目前沒有存放中的照片</EmptyState>;

  const now = new Date();
  const days = (r: (typeof all)[number]) =>
    r.expiresAt ? daysUntil(r.expiresAt, now) : 0;
  const notPickedSoon = all.filter(
    (r) => r.status !== "picked_up" && r.status !== "cancelled" && days(r) <= 7,
  ).length;

  const rows =
    view === "picked"
      ? all.filter((r) => r.status === "picked_up")
      : view === "big"
        ? [...all].sort((a, b) => b.bytes - a.bytes)
        : all;

  const stats = [
    { label: "存放中的訂單", value: all.length, unit: "筆" },
    {
      label: "照片",
      value: all.reduce((s, r) => s + r.photoCount, 0),
      unit: "張",
    },
    {
      label: "佔用空間",
      value: formatBytes(all.reduce((s, r) => s + r.bytes, 0)),
    },
  ];

  return (
    <>
      <section
        aria-label="保存概況"
        className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3"
      >
        {stats.map((s) => (
          <div
            key={s.label}
            className="border-admin-line grid gap-1.5 rounded-xl border bg-white px-[18px] py-4"
          >
            <span className="text-ink-3 text-[13px]">{s.label}</span>
            <span className="text-[28px] leading-tight font-semibold tracking-tight tabular-nums">
              {s.value}{" "}
              {s.unit && (
                <span className="text-ink-3 text-sm font-medium">{s.unit}</span>
              )}
            </span>
          </div>
        ))}
        <div
          className={`grid gap-1.5 rounded-xl border px-[18px] py-4 ${
            notPickedSoon
              ? "border-[#f4ddaf] bg-[#fff8ec] text-[#6e4200]"
              : "border-admin-line bg-white"
          }`}
        >
          <span
            className={`text-[13px] font-medium ${notPickedSoon ? "text-warn-fg" : "text-ink-3"}`}
          >
            7 天內到期・尚未取件
          </span>
          <span className="text-[28px] leading-tight font-semibold tracking-tight tabular-nums">
            {notPickedSoon} <span className="text-sm font-medium">筆</span>
          </span>
        </div>
      </section>

      <nav aria-label="排序與篩選" className="flex flex-wrap gap-1.5">
        {VIEWS.map((v) => (
          <Link
            key={v.key}
            href={
              v.key === "soon" ? "/admin/photos" : `/admin/photos?view=${v.key}`
            }
            aria-current={view === v.key ? "page" : undefined}
            className={`inline-flex h-9 items-center rounded-full border px-3.5 text-[13px] font-medium ${
              view === v.key
                ? "border-ink bg-ink text-white"
                : "border-admin-field text-ink-2 hover:border-ink-4 bg-white"
            }`}
          >
            {v.label}
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <EmptyState>沒有已取件、還存著照片的訂單</EmptyState>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-[13px]">
              <thead className="bg-[#fafbfc]">
                <tr>
                  <th className={th}>到期</th>
                  <th className={th}>訂單編號</th>
                  <th className={th}>客人</th>
                  <th className={th}>訂單狀態</th>
                  <th className={`${th} text-right`}>照片</th>
                  <th className={`${th} text-right`}>大小</th>
                  <th className={th}>
                    <span className="sr-only">操作</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.orderId}
                    className="border-admin-line-soft hover:bg-admin-hover border-t"
                  >
                    <td className={td}>
                      <ExpiryPill days={days(r)} />
                      <div className="text-ink-4 mt-1 text-xs">
                        {r.expiresAt && formatTaipeiTime(r.expiresAt)}
                      </div>
                    </td>
                    <td className={td}>
                      <Link
                        href={`/admin/orders/${r.orderId}`}
                        className={`${btn.link} font-admin-mono`}
                      >
                        {r.orderNo}
                      </Link>
                    </td>
                    <td className={`${td} font-medium`}>{r.contactName}</td>
                    <td className={td}>
                      <OrderStatusBadge status={r.status} />
                    </td>
                    <td className={`${td} text-right tabular-nums`}>
                      {r.photoCount} 張
                    </td>
                    <td className={`${td} text-ink-3 text-right tabular-nums`}>
                      {formatBytes(r.bytes)}
                    </td>
                    <td className={`${td} text-right`}>
                      {r.status === "picked_up" ? (
                        <DeletePhotosButton
                          orderId={r.orderId}
                          label="提早刪除"
                        />
                      ) : (
                        r.status === "ready" &&
                        days(r) <= 7 &&
                        r.contactPhone && (
                          <a
                            href={`tel:${r.contactPhone.replace(/[^\d+]/g, "")}`}
                            className={btn.secondary}
                          >
                            <PhoneIcon className="size-3.5" />
                            聯絡客人
                          </a>
                        )
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}
