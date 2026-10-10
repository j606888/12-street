import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { DeletePhotosButton } from "@/components/admin/delete-photos-button";
import { StatusSelect } from "@/components/admin/status-select";
import { TagToggle } from "@/components/admin/tag-toggle";
import { ZipDownloadButton } from "@/components/admin/zip-download-button";
import { OrderLines } from "@/components/order/order-detail";
import { PAYMENT_LABEL } from "@/components/payment-details";
import { listTags, loadOrderPhotos, tagsByUser } from "@/lib/admin";
import { db } from "@/lib/db";
import { formatBytes, formatTaipeiTime } from "@/lib/format";
import { ORDER_STATUS_LABEL, PAYMENT_STATUS_LABEL } from "@/lib/order-status";
import { presignGet } from "@/lib/r2";
import { requireAdmin } from "@/lib/session";
import { ADMIN_ORDER_STATUSES, PAYMENT_STATUSES } from "@/lib/validators/admin";
import { safeSegment } from "@/lib/zip-names";
import { orders, user } from "@/db/schema";

export const metadata: Metadata = { title: "訂單詳情｜後台" };

const pick = <K extends string>(
  keys: readonly K[],
  labels: Record<K, string>,
) => Object.fromEntries(keys.map((k) => [k, labels[k]]));

export default function AdminOrderPage({
  params,
}: PageProps<"/admin/orders/[id]">) {
  return (
    <main className="grid gap-6">
      <Link href="/admin/orders" className="text-sm text-sky-700 underline">
        ← 訂單列表
      </Link>
      <Suspense fallback={<p className="text-neutral-400">載入中…</p>}>
        <AdminOrder params={params} />
      </Suspense>
    </main>
  );
}

async function AdminOrder({
  params,
}: Pick<PageProps<"/admin/orders/[id]">, "params">) {
  await requireAdmin();
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();

  const [row] = await db
    .select({ order: orders, member: { id: user.id, name: user.name } })
    .from(orders)
    .leftJoin(user, eq(user.id, orders.userId))
    .where(eq(orders.id, id.data));
  if (!row || row.order.status === "draft") notFound();
  const { order, member } = row;

  const [photoList, allTags, memberTags, proofUrl] = await Promise.all([
    loadOrderPhotos(order.id),
    listTags(),
    member ? tagsByUser([member.id]) : null,
    order.transferProofKey ? presignGet(order.transferProofKey) : null,
  ]);
  const stored = photoList.filter((p) => p.status !== "deleted");
  const uploaded = stored.filter((p) => p.status === "uploaded");
  const tagIds = new Set(
    (member && memberTags?.get(member.id)?.map((t) => t.id)) || [],
  );
  const zipName = `${order.orderNo}_${safeSegment(order.contactName ?? "")}.zip`;

  return (
    <>
      <div className="grid gap-1">
        <h1 className="font-mono text-2xl font-bold">{order.orderNo}</h1>
        {order.submittedAt && (
          <p className="text-sm text-neutral-500">
            送出時間：{formatTaipeiTime(order.submittedAt)}
          </p>
        )}
      </div>

      <section className="grid gap-4 rounded-xl border p-4 sm:grid-cols-2">
        <StatusSelect
          orderId={order.id}
          field="status"
          value={order.status}
          options={pick(ADMIN_ORDER_STATUSES, ORDER_STATUS_LABEL)}
          label="訂單狀態"
        />
        <StatusSelect
          orderId={order.id}
          field="paymentStatus"
          value={order.paymentStatus}
          options={pick(PAYMENT_STATUSES, PAYMENT_STATUS_LABEL)}
          label="付款狀態"
        />
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        <section className="grid content-start gap-2 text-sm">
          <h2 className="text-lg font-bold">客人</h2>
          <p>
            {order.contactName}・{order.contactPhone}
          </p>
          {member ? (
            <>
              <p className="text-neutral-600">
                LINE 會員：{member.name}（
                <Link
                  href={`/admin/orders?member=${member.id}`}
                  className="text-sky-700 underline"
                >
                  所有訂單
                </Link>
                ）
              </p>
              <div className="flex flex-wrap gap-1">
                {allTags.map((t) => (
                  <TagToggle
                    key={t.id}
                    userId={member.id}
                    tag={t}
                    on={tagIds.has(t.id)}
                  />
                ))}
              </div>
            </>
          ) : (
            <p className="text-neutral-600">訪客</p>
          )}
          {order.note && (
            <p className="whitespace-pre-line text-neutral-600">
              備註：{order.note}
            </p>
          )}
        </section>

        <section className="grid content-start gap-2 text-sm">
          <h2 className="text-lg font-bold">付款</h2>
          <p>{order.paymentMethod && PAYMENT_LABEL[order.paymentMethod]}</p>
          {order.bankLast5 && (
            <p>
              帳號末五碼：<span className="font-mono">{order.bankLast5}</span>
            </p>
          )}
          {proofUrl && (
            <a
              href={proofUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-fit text-sky-700 underline"
            >
              查看轉帳截圖
            </a>
          )}
          {order.paidAt && (
            <p className="text-neutral-600">
              標記已付款：{formatTaipeiTime(order.paidAt)}
            </p>
          )}
        </section>
      </div>

      <section className="grid gap-2">
        <h2 className="text-lg font-bold">明細</h2>
        <OrderLines order={order} />
      </section>

      <section className="grid gap-3">
        <h2 className="text-lg font-bold">
          照片（{uploaded.length} 張，
          {formatBytes(uploaded.reduce((s, p) => s + p.sizeBytes, 0))}）
        </h2>
        {uploaded.length > 0 && (
          <ZipDownloadButton orderId={order.id} fileName={zipName} />
        )}
        {stored.length === 0 ? (
          <p className="text-sm text-neutral-600">
            {photoList.length ? "照片已刪除。" : "這筆訂單沒有照片。"}
          </p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="border-b text-left text-neutral-500">
                  <tr>
                    <th className="py-2 font-normal">資料夾</th>
                    <th className="py-2 font-normal">檔名</th>
                    <th className="py-2 font-normal">數量</th>
                    <th className="py-2 text-right font-normal">大小</th>
                    <th className="py-2 pl-4 font-normal">保存到</th>
                  </tr>
                </thead>
                <tbody>
                  {stored.map((p) => (
                    <tr key={p.id} className="border-b">
                      <td className="py-2 text-neutral-600">{p.folder}</td>
                      <td className="py-2">
                        {p.fileName}
                        {p.status === "pending" && (
                          <span className="ml-1 text-xs text-red-600">
                            未上傳完成
                          </span>
                        )}
                      </td>
                      <td className="py-2">
                        {p.quantity && `${p.quantity.n} ${p.quantity.unit}`}
                      </td>
                      <td className="py-2 text-right text-neutral-600">
                        {formatBytes(p.sizeBytes)}
                      </td>
                      <td className="py-2 pl-4 text-neutral-600">
                        {formatTaipeiTime(p.expiresAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="grid gap-1 rounded-xl border border-red-100 p-4">
              <p className="text-sm text-neutral-600">
                照片會在保存期限後自動刪除；客人取件後也可以提早刪除。
              </p>
              <DeletePhotosButton orderId={order.id} />
            </div>
          </>
        )}
      </section>
    </>
  );
}
