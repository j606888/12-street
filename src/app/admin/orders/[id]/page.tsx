import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import {
  AdvanceStatusButton,
  CancelOrderButton,
} from "@/components/admin/advance-status-button";
import { DeletePhotosButton } from "@/components/admin/delete-photos-button";
import { MemberTags, TagOptions } from "@/components/admin/member-tags";
import { PaymentReview } from "@/components/admin/payment-review";
import { PhotoTable } from "@/components/admin/photo-table";
import { StatusSelect } from "@/components/admin/status-select";
import {
  OrderStatusBadge,
  PaymentStatusBadge,
} from "@/components/admin/status-badges";
import { btn, Card } from "@/components/admin/ui";
import { ZipDownloadButton } from "@/components/admin/zip-download-button";
import {
  ArrowLeftIcon,
  ChevronRightIcon,
  NoteIcon,
  MailIcon,
  PhoneIcon,
} from "@/components/icons";
import { OrderLines } from "@/components/order/order-detail";
import { PAYMENT_LABEL } from "@/components/payment-details";
import { listTags, loadOrderPhotos, memberNote, tagsByUser } from "@/lib/admin";
import { db } from "@/lib/db";
import { formatBytes, formatNtd, formatTaipeiTime } from "@/lib/format";
import {
  ORDER_STATUS_LABEL,
  PAYMENT_STATUS_LABEL,
  type OrderStatus,
} from "@/lib/order-status";
import { presignGet } from "@/lib/r2";
import { isPastRetention, RETENTION_DAYS } from "@/lib/retention";
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
    <main className="grid grid-cols-1 gap-5">
      <Link
        href="/admin/orders"
        className="text-accent hover:text-accent-dark flex w-fit items-center gap-1 py-1.5 text-[13px] font-medium"
      >
        <ArrowLeftIcon className="size-3.5" />
        訂單列表
      </Link>
      <Suspense fallback={<p className="text-ink-4">載入中…</p>}>
        <AdminOrder params={params} />
      </Suspense>
    </main>
  );
}

const STEPS: OrderStatus[] = ["submitted", "printing", "ready", "picked_up"];

function StatusSteps({ status }: { status: OrderStatus }) {
  const current = STEPS.indexOf(status);
  return (
    <ol className="grid grid-cols-4 gap-2">
      {STEPS.map((s, i) => {
        const done = i < current;
        const now = i === current;
        return (
          <li
            key={s}
            aria-current={now ? "step" : undefined}
            className="grid gap-2"
          >
            <span
              className={`h-1 rounded-full ${i <= current ? "bg-ink" : "bg-admin-line"}`}
            />
            <span className="flex items-center gap-2">
              <span
                className={`grid size-[22px] shrink-0 place-items-center rounded-full text-xs font-semibold ${
                  done
                    ? "bg-ink text-white"
                    : now
                      ? "text-ink ring-ink bg-white ring-2 ring-inset"
                      : "bg-admin-chip text-ink-4"
                }`}
              >
                {done ? "✓" : i + 1}
              </span>
              <span
                className={`text-[13px] ${now ? "font-semibold" : done ? "text-ink-2" : "text-ink-4"}`}
              >
                {ORDER_STATUS_LABEL[s]}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
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

  const [photoList, allTags, memberTags, note, proofUrl] = await Promise.all([
    loadOrderPhotos(order.id),
    listTags(),
    member ? tagsByUser([member.id]) : null,
    member ? memberNote(member.id) : null,
    order.transferProofKey ? presignGet(order.transferProofKey) : null,
  ]);
  const stored = photoList.filter((p) => p.status !== "deleted");
  const uploaded = stored.filter((p) => p.status === "uploaded");
  const zipName = `${order.orderNo}_${safeSegment(order.contactName ?? "")}.zip`;
  const expiresAt = stored.reduce<Date | null>(
    (min, p) => (!min || p.expiresAt < min ? p.expiresAt : min),
    null,
  );
  const cancelled = order.status === "cancelled";

  return (
    <>
      <header className="flex flex-wrap items-center gap-4">
        <div className="grid min-w-72 flex-1 gap-1.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="font-admin-mono text-2xl font-medium tracking-tight">
              {order.orderNo}
            </h1>
            <OrderStatusBadge status={order.status} />
            <PaymentStatusBadge status={order.paymentStatus} long />
          </div>
          <p className="text-ink-3 text-[13px]">
            {order.submittedAt &&
              `送出時間 ${formatTaipeiTime(order.submittedAt)}・`}
            {order.contactName}・{formatNtd(order.totalAmount)}
          </p>
        </div>
        <div className="flex flex-wrap items-start gap-2">
          {uploaded.length > 0 && (
            <ZipDownloadButton
              orderId={order.id}
              fileName={zipName}
              variant="large"
            />
          )}
          <AdvanceStatusButton
            orderId={order.id}
            status={order.status}
            paymentMethod={order.paymentMethod}
            paymentStatus={order.paymentStatus}
            size="lg"
          />
        </div>
      </header>

      {!cancelled && (
        <section
          aria-label="訂單進度"
          className="border-admin-line grid gap-2.5 rounded-xl border bg-white px-6 py-[18px]"
        >
          <StatusSteps status={order.status} />
          {order.status !== "picked_up" && (
            <div className="flex justify-end">
              <CancelOrderButton orderId={order.id} />
            </div>
          )}
        </section>
      )}

      <div className="flex flex-wrap items-start gap-5">
        <div className="grid min-w-0 flex-[999_1_560px] grid-cols-1 gap-5">
          <Card title="明細">
            <div className="overflow-x-auto px-5 py-3">
              <OrderLines order={order} />
            </div>
          </Card>

          <Card
            title={
              <span className="grid gap-0.5">
                照片（{uploaded.length} 張，
                {formatBytes(uploaded.reduce((s, p) => s + p.sizeBytes, 0))}）
                {expiresAt && (
                  <span className="text-ink-3 text-[13px] font-normal">
                    保存到 {formatTaipeiTime(expiresAt)}
                  </span>
                )}
              </span>
            }
          >
            {stored.length === 0 ? (
              <p className="text-ink-3 px-5 py-6 text-[13px]">
                {photoList.length ? "照片已刪除。" : "這筆訂單沒有照片。"}
              </p>
            ) : (
              <PhotoTable
                photos={stored.map((p) => ({
                  id: p.id,
                  fileName: p.fileName,
                  folder: p.folder,
                  quantity: p.quantity
                    ? `${p.quantity.n} ${p.quantity.unit}`
                    : "—",
                  size: formatBytes(p.sizeBytes),
                  pending: p.status === "pending",
                }))}
              />
            )}
          </Card>

          {stored.length > 0 && (
            <section className="flex flex-wrap items-center gap-3 rounded-xl border border-[#f3c9c4] bg-white px-5 py-4">
              <div className="min-w-64 flex-1">
                <h2 className="font-semibold">刪除照片</h2>
                <p className="text-ink-3 text-[13px]">
                  照片會在保存期限後自動刪除；客人取件後也可以先刪掉，刪除後無法復原。
                </p>
              </div>
              <DeletePhotosButton orderId={order.id} />
            </section>
          )}
        </div>

        <div className="grid min-w-0 flex-[1_1_320px] grid-cols-1 gap-5">
          <Card title="付款">
            <div className="grid gap-3.5 px-5 py-4">
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[13px]">
                <dt className="text-ink-4">方式</dt>
                <dd>
                  {order.paymentMethod
                    ? PAYMENT_LABEL[order.paymentMethod]
                    : "—"}
                </dd>
                {order.bankLast5 && (
                  <>
                    <dt className="text-ink-4">帳號末五碼</dt>
                    <dd className="font-admin-mono">{order.bankLast5}</dd>
                  </>
                )}
                <dt className="text-ink-4">應收</dt>
                <dd className="font-semibold">
                  {formatNtd(order.totalAmount)}
                </dd>
              </dl>
              {proofUrl && (
                <a
                  href={proofUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="border-admin-line bg-admin-bg block overflow-hidden rounded-[10px] border"
                >
                  {/* Presigned R2 URL; next/image would proxy it through a Function */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={proofUrl}
                    alt="轉帳截圖（點一下開新分頁看大圖）"
                    className="max-h-64 w-full object-contain"
                  />
                </a>
              )}
              {order.paymentMethod === "bank_transfer" &&
                !order.transferProofKey &&
                order.submittedAt &&
                isPastRetention(order.submittedAt) && (
                  <p className="text-ink-3 text-[13px]">
                    轉帳截圖（如有上傳）已超過 {RETENTION_DAYS}{" "}
                    天保存期限，已自動刪除。
                  </p>
                )}
              <PaymentReview
                orderId={order.id}
                status={order.paymentStatus}
                paidAtLabel={order.paidAt && formatTaipeiTime(order.paidAt)}
              />
            </div>
          </Card>

          <Card title="客人">
            <div className="grid gap-3.5 px-5 py-4">
              <div className="flex items-center gap-3">
                <span className="bg-ok-bg text-ok-fg grid size-10 shrink-0 place-items-center rounded-full font-semibold">
                  {order.contactName?.slice(0, 1)}
                </span>
                <div className="grid min-w-0 flex-1 gap-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="mr-0.5 font-semibold">
                      {order.contactName}
                    </span>
                    {member && (
                      <MemberTags
                        userId={member.id}
                        tags={memberTags?.get(member.id) ?? []}
                      />
                    )}
                  </div>
                  <span className="text-ink-4 text-xs">
                    {member ? (
                      <>
                        LINE 會員：
                        <Link
                          href={`/admin/members/${member.id}`}
                          className={btn.link}
                        >
                          {member.name}
                        </Link>
                      </>
                    ) : (
                      "訪客"
                    )}
                  </span>
                </div>
              </div>
              {order.contactPhone && (
                <a
                  href={`tel:${order.contactPhone.replace(/[^\d+]/g, "")}`}
                  className="font-admin-mono text-accent hover:text-accent-dark flex w-fit items-center gap-2 py-1 text-[13px]"
                >
                  <PhoneIcon className="size-4" />
                  {order.contactPhone}
                </a>
              )}
              {order.contactEmail && (
                <a
                  href={`mailto:${order.contactEmail}`}
                  className="font-admin-mono text-accent hover:text-accent-dark flex w-fit items-center gap-2 py-1 text-[13px] break-all"
                >
                  <MailIcon className="size-4 shrink-0" />
                  {order.contactEmail}
                </a>
              )}
              {member && note && (
                <div className="grid gap-1 rounded-lg border border-[#f4e3b5] bg-[#fffbef] px-3 py-2.5 text-[13px]">
                  <div className="text-warn-fg flex items-center gap-1.5 text-xs font-medium">
                    <NoteIcon className="size-3.5" />
                    <span className="flex-1">店家備註</span>
                    <Link
                      href={`/admin/members/${member.id}`}
                      className={btn.link}
                    >
                      編輯
                    </Link>
                  </div>
                  <p className="text-ink-2 whitespace-pre-line">{note}</p>
                </div>
              )}
              {member && (
                <Link
                  href={`/admin/orders?member=${member.id}`}
                  className="bg-admin-bg text-accent hover:text-accent-dark flex items-center justify-between rounded-lg px-3 py-2.5 text-[13px] font-medium"
                >
                  這位會員的所有訂單
                  <ChevronRightIcon className="size-4" />
                </Link>
              )}
              {member && <TagOptions names={allTags.map((t) => t.name)} />}
            </div>
          </Card>

          {order.note && (
            <Card title="客人備註">
              <p className="text-ink-2 m-5 mt-4 rounded-lg border border-[#f4e3b5] bg-[#fffbef] px-3 py-2.5 text-[13px] whitespace-pre-line">
                {order.note}
              </p>
            </Card>
          )}

          <details className="group border-admin-line rounded-xl border bg-white">
            <summary className="text-ink-2 cursor-pointer px-5 py-3.5 text-[13px] font-medium select-none">
              手動修改狀態
              <span className="text-ink-4 ml-1 font-normal">
                （改回上一步、恢復已取消的訂單）
              </span>
            </summary>
            <div className="border-admin-line-soft grid gap-3 border-t px-5 py-4">
              <StatusSelect
                key={`s-${order.status}`}
                orderId={order.id}
                field="status"
                value={order.status}
                options={pick(ADMIN_ORDER_STATUSES, ORDER_STATUS_LABEL)}
                label="訂單狀態"
              />
              <StatusSelect
                key={`p-${order.paymentStatus}`}
                orderId={order.id}
                field="paymentStatus"
                value={order.paymentStatus}
                options={pick(PAYMENT_STATUSES, PAYMENT_STATUS_LABEL)}
                label="付款狀態"
              />
            </div>
          </details>
        </div>
      </div>
    </>
  );
}
