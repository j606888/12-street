import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { AdvanceStatusButton } from "@/components/admin/advance-status-button";
import { Pagination } from "@/components/admin/pagination";
import {
  OrderStatusBadge,
  PaymentStatusBadge,
} from "@/components/admin/status-badges";
import { TagList } from "@/components/admin/tag-list";
import {
  btn,
  Card,
  EmptyState,
  field,
  PageHeader,
  td,
  th,
} from "@/components/admin/ui";
import { SearchIcon, XIcon } from "@/components/icons";
import { PAYMENT_LABEL } from "@/components/payment-details";
import { listOrders, memberName, orderCounts } from "@/lib/admin";
import { formatNtd, formatTaipeiTime } from "@/lib/format";
import { PAYMENT_STATUS_LABEL } from "@/lib/order-status";
import {
  firstParam,
  ORDER_TABS,
  orderFilterInput,
  PAYMENT_STATUSES,
  type OrderFilter,
  type OrderTab,
} from "@/lib/validators/admin";
import { requireAdmin } from "@/lib/session";

export const metadata: Metadata = { title: "訂單｜後台" };

const TAB_LABEL: Record<OrderTab, string> = {
  todo: "待處理",
  printing: "製作中",
  ready: "可取件",
  picked_up: "已取件",
  cancelled: "已取消",
  all: "全部",
};

export default function AdminOrdersPage({
  searchParams,
}: PageProps<"/admin/orders">) {
  return (
    <main className="grid grid-cols-1 gap-5">
      <PageHeader title="訂單" description="依送出時間排序，最新在上" />
      <Suspense fallback={<p className="text-ink-4">載入中…</p>}>
        <Orders searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

/** /admin/orders?… keeping the current filters, with some replaced. */
function ordersHref(filter: OrderFilter, change: Partial<OrderFilter>) {
  const next = { ...filter, page: 1, ...change };
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(next)) {
    if (v !== undefined && v !== "" && !(k === "page" && v === 1))
      qs.set(k, String(v));
  }
  return `/admin/orders?${qs}`;
}

async function Orders({
  searchParams,
}: Pick<PageProps<"/admin/orders">, "searchParams">) {
  await requireAdmin();
  const sp = await searchParams;
  const filter = orderFilterInput.parse({
    tab: firstParam(sp.tab),
    payment: firstParam(sp.payment),
    member: firstParam(sp.member),
    q: firstParam(sp.q),
    page: firstParam(sp.page),
  });
  const [{ rows, total }, counts, member] = await Promise.all([
    listOrders(filter),
    orderCounts(),
    filter.member ? memberName(filter.member) : null,
  ]);
  const searching = Boolean(filter.q || filter.payment || filter.member);

  return (
    <>
      <nav
        aria-label="訂單狀態"
        className="border-admin-line flex flex-wrap gap-1 border-b"
      >
        {ORDER_TABS.map((t) => {
          const on = t === filter.tab;
          return (
            <Link
              key={t}
              href={ordersHref(filter, { tab: t })}
              aria-current={on ? "page" : undefined}
              className={`-mb-px flex h-11 items-center gap-2 border-b-2 px-3.5 ${
                on
                  ? "border-ink text-ink font-semibold"
                  : "text-ink-3 hover:text-ink border-transparent font-medium"
              }`}
            >
              {TAB_LABEL[t]}
              <span
                className={`rounded-full px-1.5 text-xs font-semibold tabular-nums ${
                  on ? "bg-ink text-white" : "bg-admin-chip text-ink-2"
                }`}
              >
                {counts[t]}
              </span>
            </Link>
          );
        })}
      </nav>

      <form className="flex flex-wrap items-center gap-2.5">
        {filter.member && (
          <input type="hidden" name="member" value={filter.member} />
        )}
        <label
          className={`${field} text-ink-4 focus-within:border-accent focus-within:ring-accent-soft flex max-w-[420px] min-w-64 flex-1 items-center gap-2 focus-within:ring-3`}
        >
          <SearchIcon className="size-4 shrink-0" />
          <span className="sr-only">搜尋</span>
          <input
            type="search"
            name="q"
            defaultValue={filter.q ?? ""}
            placeholder="訂單編號、姓名、手機"
            className="text-ink min-w-0 flex-1 bg-transparent outline-none"
          />
        </label>
        <label
          className={`${field} text-ink-3 flex items-center gap-2 pr-1 text-[13px]`}
        >
          付款
          <select
            name="payment"
            defaultValue={filter.payment ?? ""}
            className="text-ink h-9 bg-transparent outline-none"
          >
            <option value="">全部</option>
            {PAYMENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {PAYMENT_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <button className={`${btn.primary} h-10`}>篩選</button>
        {filter.member && (
          <span className="bg-accent-soft text-accent-dark inline-flex h-8 items-center gap-1 rounded-full pr-1 pl-3 text-[13px] font-medium">
            會員：{member ?? "（找不到）"}
            <Link
              href={ordersHref(filter, { member: undefined })}
              aria-label="移除會員篩選"
              className="grid size-6 place-items-center rounded-full hover:bg-[#dce5fc]"
            >
              <XIcon className="size-3" />
            </Link>
          </span>
        )}
        {searching && (
          <Link href="/admin/orders" className={`${btn.link} px-1 text-[13px]`}>
            清除篩選
          </Link>
        )}
      </form>

      {rows.length === 0 ? (
        <EmptyState>沒有符合條件的訂單</EmptyState>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-[13px]">
              <thead className="bg-[#fafbfc]">
                <tr>
                  <th className={th}>訂單編號</th>
                  <th className={th}>客人</th>
                  <th className={th}>內容</th>
                  <th className={`${th} text-right`}>金額</th>
                  <th className={`${th} pl-6`}>付款</th>
                  <th className={th}>狀態</th>
                  <th className={`${th} text-right`}>下一步</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((o) => (
                  <tr
                    key={o.id}
                    className="border-admin-line-soft hover:bg-admin-hover border-t"
                  >
                    <td className={td}>
                      <Link
                        href={`/admin/orders/${o.id}`}
                        className={`${btn.link} font-admin-mono`}
                      >
                        {o.orderNo}
                      </Link>
                      <div className="text-ink-4 mt-0.5 text-xs">
                        {o.submittedAt && formatTaipeiTime(o.submittedAt)}
                      </div>
                    </td>
                    <td className={td}>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="mr-0.5 font-medium">
                          {o.contactName}
                        </span>
                        {!o.userId && (
                          <span className="border-admin-line text-ink-3 rounded border px-1.5 text-[11px]">
                            訪客
                          </span>
                        )}
                        <TagList tags={o.tags} />
                      </div>
                      <div className="font-admin-mono text-ink-4 mt-0.5 text-xs">
                        {o.contactPhone}
                      </div>
                    </td>
                    <td className={`${td} text-ink-2 max-w-64`}>{o.summary}</td>
                    <td
                      className={`${td} text-right font-semibold tabular-nums`}
                    >
                      {formatNtd(o.totalAmount)}
                    </td>
                    <td className={`${td} pl-6`}>
                      <PaymentStatusBadge status={o.paymentStatus} />
                      <div className="text-ink-4 mt-1 text-xs">
                        {o.paymentMethod && PAYMENT_LABEL[o.paymentMethod]}
                      </div>
                    </td>
                    <td className={td}>
                      <OrderStatusBadge status={o.status} />
                    </td>
                    <td className={`${td} py-2.5 text-right whitespace-nowrap`}>
                      <AdvanceStatusButton
                        orderId={o.id}
                        status={o.status}
                        paymentMethod={o.paymentMethod}
                        paymentStatus={o.paymentStatus}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            path="/admin/orders"
            params={filter}
            page={filter.page}
            total={total}
          />
        </Card>
      )}
    </>
  );
}
