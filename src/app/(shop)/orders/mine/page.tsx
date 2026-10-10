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
import { listMemberOrders } from "@/lib/order-view";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "我的訂單｜線上洗照片" };

export default function MyOrdersPage() {
  return (
    <main className="mx-auto grid w-full max-w-2xl gap-6 px-4 py-10">
      <h1 className="text-2xl font-bold">我的訂單</h1>
      <Suspense fallback={<p className="text-neutral-400">載入中…</p>}>
        <OrderList />
      </Suspense>
      <Link href="/" className="text-center text-sm text-sky-700 underline">
        回首頁
      </Link>
    </main>
  );
}

async function OrderList() {
  const user = await requireUser("/orders/mine");
  const rows = await listMemberOrders(user.id);

  if (!rows.length) {
    return (
      <div className="grid gap-3 rounded-xl bg-neutral-50 p-6 text-center">
        <p className="text-neutral-600">還沒有訂單。</p>
        <Link href="/order" className="text-sky-700 underline">
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
            className="grid gap-2 rounded-xl border p-4 hover:bg-neutral-50"
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-mono font-bold">{o.orderNo}</span>
              <span className="font-bold">{formatNtd(o.totalAmount)}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              {o.submittedAt && (
                <span className="text-neutral-500">
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
