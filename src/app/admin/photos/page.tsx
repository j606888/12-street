import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { OrderStatusBadge } from "@/components/admin/status-badges";
import { listStoredPhotos } from "@/lib/admin";
import { formatBytes, formatTaipeiTime } from "@/lib/format";
import { requireAdmin } from "@/lib/session";

export const metadata: Metadata = { title: "照片｜後台" };

export default function AdminPhotosPage() {
  return (
    <main className="grid gap-4">
      <h1 className="text-2xl font-bold">照片</h1>
      <p className="text-sm text-neutral-600">
        目前還存著照片的訂單，最快到期的在前面。照片保存一個月後自動刪除，也可以到訂單詳情提早刪除。
      </p>
      <Suspense fallback={<p className="text-neutral-400">載入中…</p>}>
        <StoredPhotos />
      </Suspense>
    </main>
  );
}

async function StoredPhotos() {
  await requireAdmin();
  const rows = await listStoredPhotos();
  if (!rows.length) {
    return (
      <p className="rounded-xl bg-neutral-50 p-6 text-center text-neutral-600">
        目前沒有存放中的照片
      </p>
    );
  }
  const totalBytes = rows.reduce((s, r) => s + r.bytes, 0);
  const totalPhotos = rows.reduce((s, r) => s + r.photoCount, 0);

  return (
    <>
      <p className="text-sm">
        共 {rows.length} 筆訂單、{totalPhotos} 張照片、
        {formatBytes(totalBytes)}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="border-b text-left text-neutral-500">
            <tr>
              <th className="py-2 font-normal">訂單編號</th>
              <th className="py-2 font-normal">客人</th>
              <th className="py-2 font-normal">訂單狀態</th>
              <th className="py-2 text-right font-normal">照片</th>
              <th className="py-2 text-right font-normal">大小</th>
              <th className="py-2 pl-4 font-normal">最早到期</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.orderId} className="border-b">
                <td className="py-2">
                  <Link
                    href={`/admin/orders/${r.orderId}`}
                    className="font-mono text-sky-700 underline"
                  >
                    {r.orderNo}
                  </Link>
                </td>
                <td className="py-2">{r.contactName}</td>
                <td className="py-2">
                  <OrderStatusBadge status={r.status} />
                </td>
                <td className="py-2 text-right">{r.photoCount} 張</td>
                <td className="py-2 text-right text-neutral-600">
                  {formatBytes(r.bytes)}
                </td>
                <td className="py-2 pl-4 text-neutral-600">
                  {r.expiresAt && formatTaipeiTime(r.expiresAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
