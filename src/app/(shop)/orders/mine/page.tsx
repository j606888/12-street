import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { formatNtd, formatTaipeiTime } from "@/lib/format";
import {
  ORDER_STATUS_LABEL,
  orderStatusTone,
  PAYMENT_STATUS_LABEL,
  paymentStatusTone,
} from "@/lib/order-status";
import { SignOutButton } from "@/components/sign-out-button";
import { listMemberOrders } from "@/lib/order-view";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "我的訂單｜線上洗照片" };

export default function MyOrdersPage() {
  return (
    <main className="mx-auto grid w-full max-w-2xl gap-6 px-4 py-10">
      <h1 className="text-[28px] leading-tight font-bold">我的訂單</h1>
      <Suspense fallback={<p className="text-muted">載入中…</p>}>
        <OrderList />
      </Suspense>
      <Link
        href="/order"
        className="text-brand-dark py-2.5 text-center text-base underline"
      >
        回到下單頁
      </Link>
      <SignOutButton className="text-muted py-2.5 text-center text-base underline" />
    </main>
  );
}

async function OrderList() {
  const user = await requireUser("/orders/mine");
  const rows = await listMemberOrders(user.id);

  if (!rows.length) {
    return (
      <div className="bg-subtle grid gap-3 rounded-2xl p-6 text-center">
        <p className="text-muted">還沒有訂單。</p>
        <Link href="/order" className="text-brand-dark underline">
          開始下單
        </Link>
      </div>
    );
  }

  return (
    <ul className="grid gap-3">
      {rows.map((o) => (
        <li key={o.id}>
          <Link
            href={`/orders/${o.id}`}
            className="border-line bg-card hover:bg-brand-tint grid gap-2 rounded-2xl border p-4"
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-mono font-bold">{o.orderNo}</span>
              <span className="font-bold">{formatNtd(o.totalAmount)}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-base">
              {o.submittedAt && (
                <span className="text-muted">
                  {formatTaipeiTime(o.submittedAt)}
                </span>
              )}
              <span
                className={`rounded-full px-2 py-0.5 ${orderStatusTone(o.status)}`}
              >
                {ORDER_STATUS_LABEL[o.status]}
              </span>
              <span
                className={`rounded-full px-2 py-0.5 ${paymentStatusTone(o.paymentStatus)}`}
              >
                {PAYMENT_STATUS_LABEL[o.paymentStatus]}
              </span>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
