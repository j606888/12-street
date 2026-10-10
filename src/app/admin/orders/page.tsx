import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Pagination } from "@/components/admin/pagination";
import {
  OrderStatusBadge,
  PaymentStatusBadge,
} from "@/components/admin/status-badges";
import { TagList } from "@/components/admin/tag-list";
import { PAYMENT_LABEL } from "@/components/payment-details";
import { listOrders } from "@/lib/admin";
import { formatNtd, formatTaipeiTime } from "@/lib/format";
import { ORDER_STATUS_LABEL, PAYMENT_STATUS_LABEL } from "@/lib/order-status";
import {
  ADMIN_ORDER_STATUSES,
  firstParam,
  orderFilterInput,
  PAYMENT_STATUSES,
} from "@/lib/validators/admin";
import { requireAdmin } from "@/lib/session";

export const metadata: Metadata = { title: "訂單｜後台" };

export default function AdminOrdersPage({
  searchParams,
}: PageProps<"/admin/orders">) {
  return (
    <main className="grid gap-4">
      <h1 className="text-2xl font-bold">訂單</h1>
      <Suspense fallback={<p className="text-neutral-400">載入中…</p>}>
        <Orders searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Orders({
  searchParams,
}: Pick<PageProps<"/admin/orders">, "searchParams">) {
  await requireAdmin();
  const sp = await searchParams;
  const filter = orderFilterInput.parse({
    payment: firstParam(sp.payment),
    status: firstParam(sp.status),
    member: firstParam(sp.member),
    q: firstParam(sp.q),
    page: firstParam(sp.page),
  });
  const { rows, total } = await listOrders(filter);

  return (
    <>
      <form className="flex flex-wrap items-end gap-3 text-sm">
        <label className="grid gap-1">
          付款狀態
          <select
            name="payment"
            defaultValue={filter.payment ?? ""}
            className="rounded-lg border bg-white px-3 py-2"
          >
            <option value="">全部</option>
            {PAYMENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {PAYMENT_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1">
          訂單狀態
          <select
            name="status"
            defaultValue={filter.status ?? ""}
            className="rounded-lg border bg-white px-3 py-2"
          >
            <option value="">全部</option>
            {ADMIN_ORDER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {ORDER_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1">
          搜尋
          <input
            name="q"
            defaultValue={filter.q ?? ""}
            placeholder="訂單編號、姓名、手機"
            className="rounded-lg border px-3 py-2"
          />
        </label>
        {filter.member && (
          <input type="hidden" name="member" value={filter.member} />
        )}
        <button className="rounded-lg bg-neutral-900 px-4 py-2 font-bold text-white">
          篩選
        </button>
        <Link href="/admin/orders" className="py-2 text-sky-700 underline">
          清除
        </Link>
      </form>
      {filter.member && (
        <p className="text-sm text-neutral-600">只顯示這位會員的訂單</p>
      )}

      {rows.length === 0 ? (
        <p className="rounded-xl bg-neutral-50 p-6 text-center text-neutral-600">
          沒有符合條件的訂單
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="border-b text-left text-neutral-500">
              <tr>
                <th className="py-2 font-normal">訂單編號</th>
                <th className="py-2 font-normal">送出時間</th>
                <th className="py-2 font-normal">客人</th>
                <th className="py-2 text-right font-normal">金額</th>
                <th className="py-2 pl-4 font-normal">付款</th>
                <th className="py-2 font-normal">訂單狀態</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.id} className="border-b align-top">
                  <td className="py-3">
                    <Link
                      href={`/admin/orders/${o.id}`}
                      className="font-mono font-bold text-sky-700 underline"
                    >
                      {o.orderNo}
                    </Link>
                  </td>
                  <td className="py-3 text-neutral-600">
                    {o.submittedAt && formatTaipeiTime(o.submittedAt)}
                  </td>
                  <td className="grid gap-1 py-3">
                    <span>
                      {o.contactName}
                      <span className="ml-1 text-xs text-neutral-400">
                        {o.userId ? "會員" : "訪客"}
                      </span>
                    </span>
                    <span className="text-neutral-500">{o.contactPhone}</span>
                    <TagList tags={o.tags} />
                  </td>
                  <td className="py-3 text-right">
                    {formatNtd(o.totalAmount)}
                  </td>
                  <td className="grid gap-1 py-3 pl-4">
                    <span className="text-neutral-600">
                      {o.paymentMethod && PAYMENT_LABEL[o.paymentMethod]}
                    </span>
                    <span>
                      <PaymentStatusBadge status={o.paymentStatus} />
                    </span>
                  </td>
                  <td className="py-3">
                    <OrderStatusBadge status={o.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination
        path="/admin/orders"
        params={filter}
        page={filter.page}
        total={total}
      />
    </>
  );
}
