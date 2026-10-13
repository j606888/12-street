import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { AdvanceStatusButton } from "@/components/admin/advance-status-button";
import { ConfirmPaymentButton } from "@/components/admin/payment-review";
import { OrderSearchBox } from "@/components/admin/search-box";
import {
  ExpiryPill,
  PaymentStatusBadge,
} from "@/components/admin/status-badges";
import { btn, Card, td, th } from "@/components/admin/ui";
import { ZipDownloadButton } from "@/components/admin/zip-download-button";
import { ChevronRightIcon } from "@/components/icons";
import { PAYMENT_LABEL } from "@/components/payment-details";
import {
  listStoredPhotos,
  newOrders,
  orderCounts,
  pendingPayments,
} from "@/lib/admin";
import {
  daysUntil,
  formatNtd,
  formatTaipeiDate,
  formatTaipeiTime,
} from "@/lib/format";
import { ORDER_STATUS_LABEL } from "@/lib/order-status";
import { presignGet } from "@/lib/r2";
import { requireAdmin } from "@/lib/session";
import { safeSegment } from "@/lib/zip-names";

export const metadata: Metadata = { title: "後台｜線上洗照片" };

export default function AdminHome() {
  return (
    <main className="grid grid-cols-1 gap-6">
      <header className="flex flex-wrap items-center gap-4">
        <div className="grid min-w-60 flex-1 gap-0.5">
          <h1 className="text-2xl font-bold tracking-tight">總覽</h1>
          <Suspense fallback={<p className="text-ink-3">載入中…</p>}>
            <Today />
          </Suspense>
        </div>
        <OrderSearchBox />
      </header>
      <Suspense fallback={<p className="text-ink-4">載入中…</p>}>
        <Overview />
      </Suspense>
    </main>
  );
}

async function Today() {
  await requireAdmin();
  const counts = await orderCounts();
  return (
    <p className="text-ink-3">
      {formatTaipeiDate(new Date())}・
      {counts.todo ? (
        <>
          有 <strong className="text-ink">{counts.todo} 筆</strong>訂單要處理
        </>
      ) : (
        "目前沒有要處理的訂單"
      )}
    </p>
  );
}

async function Overview() {
  await requireAdmin();
  const [counts, payments, fresh, stored] = await Promise.all([
    orderCounts(),
    pendingPayments(),
    newOrders(8),
    listStoredPhotos(),
  ]);
  const proofUrls = await Promise.all(
    payments.map((p) =>
      p.transferProofKey ? presignGet(p.transferProofKey) : null,
    ),
  );
  const now = new Date();
  const expiring = stored
    .filter((r) => r.expiresAt && daysUntil(r.expiresAt, now) <= 7)
    .slice(0, 5);

  const flow = [
    {
      label: "付款待確認",
      n: counts.pendingReview,
      hint: "核對轉帳截圖或 LINE MONEY",
      href: "/admin/orders?tab=all&payment=pending_review",
      dot: "bg-warn-dot",
      urgent: true,
    },
    {
      label: "新訂單",
      n: counts.submitted,
      hint: "已送出，還沒開始製作",
      href: "/admin/orders?tab=todo",
      dot: "bg-warn-dot",
      urgent: true,
    },
    {
      label: "製作中",
      n: counts.printing,
      hint: "做好後標記「可取件」",
      href: "/admin/orders?tab=printing",
      dot: "bg-accent",
    },
    {
      label: "可取件",
      n: counts.ready,
      hint: "等客人來店取件",
      href: "/admin/orders?tab=ready",
      dot: "bg-ok-dot",
    },
  ];

  return (
    <>
      <section
        aria-label="訂單流程"
        className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3"
      >
        {flow.map((c) => (
          <Link
            key={c.label}
            href={c.href}
            className="border-admin-line grid gap-2.5 rounded-xl border bg-white px-[18px] py-4 hover:border-[#c9ced6] hover:shadow-[0_2px_8px_rgba(21,23,28,.06)]"
          >
            <span className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 font-medium">
                <span className={`size-2 rounded-full ${c.dot}`} />
                {c.label}
              </span>
              {c.urgent && c.n > 0 && (
                <span className="bg-warn-bg text-warn-fg rounded-full px-2 text-xs font-semibold">
                  要處理
                </span>
              )}
            </span>
            <span className="text-[32px] leading-none font-semibold tracking-tight tabular-nums">
              {c.n}
            </span>
            <span className="text-ink-3 text-[13px]">{c.hint}</span>
          </Link>
        ))}
      </section>

      <div className="flex flex-wrap items-start gap-5">
        <div className="grid min-w-0 flex-[999_1_560px] grid-cols-1 gap-5">
          <Card
            title="付款待確認"
            action={
              <Link
                href="/admin/orders?tab=all&payment=pending_review"
                className={`${btn.link} text-[13px]`}
              >
                查看全部
              </Link>
            }
          >
            {payments.length === 0 ? (
              <p className="text-ink-3 px-5 py-8 text-center">都確認完了</p>
            ) : (
              <ul>
                {payments.map((p, i) => (
                  <li
                    key={p.id}
                    className="border-admin-line-soft hover:bg-admin-hover flex flex-wrap items-center gap-4 border-t px-5 py-3.5 first:border-t-0"
                  >
                    <div className="grid min-w-48 flex-1 gap-0.5">
                      <span className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/admin/orders/${p.id}`}
                          className={`${btn.link} font-admin-mono text-[13px]`}
                        >
                          {p.orderNo}
                        </Link>
                        <span className="text-ink-4 text-xs">
                          {p.submittedAt && formatTaipeiTime(p.submittedAt)}
                        </span>
                      </span>
                      <span className="font-medium">
                        {p.contactName}
                        <span className="text-ink-4 font-normal">
                          ・{p.paymentMethod && PAYMENT_LABEL[p.paymentMethod]}
                        </span>
                      </span>
                    </div>
                    {p.bankLast5 && (
                      <span className="font-admin-mono text-ink-2 text-[13px]">
                        末五碼 {p.bankLast5}
                      </span>
                    )}
                    <span className="w-24 text-right font-semibold tabular-nums">
                      {formatNtd(p.totalAmount)}
                    </span>
                    <span className="flex gap-2">
                      {proofUrls[i] && (
                        <a
                          href={proofUrls[i]}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={btn.secondary}
                        >
                          看截圖
                        </a>
                      )}
                      <ConfirmPaymentButton orderId={p.id} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card
            title="新訂單・待開始製作"
            action={
              <Link
                href="/admin/orders?tab=todo"
                className={`${btn.link} text-[13px]`}
              >
                查看全部
              </Link>
            }
          >
            {fresh.length === 0 ? (
              <p className="text-ink-3 px-5 py-8 text-center">沒有新訂單</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-[13px]">
                  <thead>
                    <tr>
                      <th className={th}>訂單編號</th>
                      <th className={th}>客人</th>
                      <th className={th}>內容</th>
                      <th className={th}>付款</th>
                      <th className={`${th} text-right`}>金額</th>
                      <th className={th}>
                        <span className="sr-only">操作</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {fresh.map((o) => (
                      <tr
                        key={o.id}
                        className="border-admin-line-soft hover:bg-admin-hover border-t"
                      >
                        <td className={`${td} whitespace-nowrap`}>
                          <Link
                            href={`/admin/orders/${o.id}`}
                            className={`${btn.link} font-admin-mono`}
                          >
                            {o.orderNo}
                          </Link>
                          <div className="text-ink-4 text-xs">
                            {o.submittedAt && formatTaipeiTime(o.submittedAt)}
                          </div>
                        </td>
                        <td className={`${td} whitespace-nowrap`}>
                          {o.contactName}
                        </td>
                        <td className={`${td} text-ink-2`}>{o.summary}</td>
                        <td className={`${td} whitespace-nowrap`}>
                          <PaymentStatusBadge status={o.paymentStatus} />
                          <div className="text-ink-4 mt-1 text-xs">
                            {o.paymentMethod && PAYMENT_LABEL[o.paymentMethod]}
                          </div>
                        </td>
                        <td
                          className={`${td} text-right font-semibold whitespace-nowrap tabular-nums`}
                        >
                          {formatNtd(o.totalAmount)}
                        </td>
                        <td className={`${td} text-right whitespace-nowrap`}>
                          <span className="inline-flex items-start gap-1.5">
                            <ZipDownloadButton
                              orderId={o.id}
                              fileName={`${o.orderNo}_${safeSegment(o.contactName ?? "")}.zip`}
                              variant="icon"
                            />
                            <AdvanceStatusButton
                              orderId={o.id}
                              status={o.status}
                              paymentMethod={o.paymentMethod}
                              paymentStatus={o.paymentStatus}
                            />
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>

        <div className="grid min-w-0 flex-[1_1_300px] grid-cols-1 gap-5">
          <Card
            title="照片即將刪除"
            action={
              <Link href="/admin/photos" className={`${btn.link} text-[13px]`}>
                全部
              </Link>
            }
          >
            <p className="text-ink-3 px-5 pt-3 text-[13px]">
              7 天內到期的訂單。還沒取件的話，記得先聯絡客人。
            </p>
            {expiring.length === 0 ? (
              <p className="text-ink-4 px-5 py-6 text-[13px]">
                7 天內沒有要刪除的照片
              </p>
            ) : (
              <ul className="px-3 py-2">
                {expiring.map((r) => (
                  <li key={r.orderId}>
                    <Link
                      href={`/admin/orders/${r.orderId}`}
                      className="hover:bg-admin-hover flex items-center gap-3 rounded-lg px-2 py-2.5"
                    >
                      <ExpiryPill days={daysUntil(r.expiresAt!, now)} />
                      <span className="grid min-w-0 flex-1">
                        <span className="font-medium">{r.contactName}</span>
                        <span className="text-ink-4 truncate text-xs">
                          {r.orderNo}・{ORDER_STATUS_LABEL[r.status]}・
                          {r.photoCount} 張
                        </span>
                      </span>
                      <ChevronRightIcon className="size-4 text-[#8a909b]" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="處理流程">
            <ol className="text-ink-2 grid gap-2.5 px-5 py-4 text-[13px]">
              {[
                "確認收款（現金於取件時收）",
                "下載照片 ZIP，開始製作",
                "做好後標記可取件",
                "客人取件後，可提早刪除照片",
              ].map((s, i) => (
                <li key={s} className="flex gap-2.5">
                  <span className="bg-admin-chip grid size-[22px] shrink-0 place-items-center rounded-full text-xs font-semibold">
                    {i + 1}
                  </span>
                  {s}
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>
    </>
  );
}
