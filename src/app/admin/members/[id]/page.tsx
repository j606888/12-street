import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MemberNoteForm } from "@/components/admin/member-note-form";
import { MemberProfileForm } from "@/components/admin/member-profile-form";
import { MemberTags, TagOptions } from "@/components/admin/member-tags";
import {
  OrderStatusBadge,
  PaymentStatusBadge,
} from "@/components/admin/status-badges";
import { Avatar, btn, Card, td, th } from "@/components/admin/ui";
import { ArrowLeftIcon, ChevronRightIcon } from "@/components/icons";
import { getMember, listOrders, listTags } from "@/lib/admin";
import { formatNtd, formatTaipeiTime } from "@/lib/format";
import { requireAdmin } from "@/lib/session";

export const metadata: Metadata = { title: "會員資料｜後台" };

const RECENT_ORDERS = 10;

export default function AdminMemberPage({
  params,
}: PageProps<"/admin/members/[id]">) {
  return (
    <main className="grid grid-cols-1 gap-5">
      <Link
        href="/admin/members"
        className="text-accent hover:text-accent-dark flex w-fit items-center gap-1 py-1.5 text-[13px] font-medium"
      >
        <ArrowLeftIcon className="size-3.5" />
        會員列表
      </Link>
      <Suspense fallback={<p className="text-ink-4">載入中…</p>}>
        <AdminMember params={params} />
      </Suspense>
    </main>
  );
}

async function AdminMember({
  params,
}: Pick<PageProps<"/admin/members/[id]">, "params">) {
  await requireAdmin();
  const { id } = await params;
  if (id.length > 64) notFound();

  const [member, allTags, { rows: recent, total }] = await Promise.all([
    getMember(id),
    listTags(),
    listOrders({ tab: "all", member: id, page: 1 }),
  ]);
  if (!member) notFound();

  return (
    <>
      <header className="flex flex-wrap items-center gap-3.5">
        <Avatar id={member.id} name={member.name} className="size-12 text-lg" />
        <div className="grid min-w-60 flex-1 gap-0.5">
          <h1 className="flex flex-wrap items-center gap-2 text-2xl font-bold tracking-tight">
            {member.name}
            {member.role === "admin" && (
              <span className="border-admin-line text-ink-3 rounded border px-1.5 text-xs font-normal">
                管理員
              </span>
            )}
          </h1>
          <p className="text-ink-3 text-[13px]">
            {formatTaipeiTime(member.createdAt)} 加入・共 {member.orderCount}{" "}
            筆訂單
            {member.lastOrderAt &&
              `・最近下單 ${formatTaipeiTime(member.lastOrderAt)}`}
          </p>
        </div>
      </header>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div className="grid gap-5">
          <Card title="基本資料">
            <MemberProfileForm
              userId={member.id}
              name={member.name}
              phone={member.phone}
            />
          </Card>
          <Card title="標籤">
            <div className="flex flex-wrap items-center gap-1.5 px-5 py-4">
              <TagOptions names={allTags.map((t) => t.name)} />
              <MemberTags userId={member.id} tags={member.tags} />
            </div>
          </Card>
        </div>

        <div className="grid gap-5">
          <Card title="店家備註">
            <MemberNoteForm
              userId={member.id}
              note={member.note ?? ""}
              updatedAt={member.noteUpdatedAt}
            />
          </Card>

          <Card
            title="訂單"
            action={
              total > RECENT_ORDERS && (
                <Link
                  href={`/admin/orders?member=${member.id}`}
                  className={`${btn.link} flex items-center gap-0.5 text-[13px]`}
                >
                  查看全部 {total} 筆
                  <ChevronRightIcon className="size-4" />
                </Link>
              )
            }
          >
            {recent.length === 0 ? (
              <p className="text-ink-3 px-5 py-6 text-center text-[13px]">
                還沒有訂單
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-[13px]">
                  <thead className="bg-[#fafbfc]">
                    <tr>
                      <th className={th}>訂單編號</th>
                      <th className={th}>狀態</th>
                      <th className={`${th} text-right`}>金額</th>
                      <th className={th}>下單時間</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recent.slice(0, RECENT_ORDERS).map((o) => (
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
                          {o.summary && (
                            <div className="text-ink-4 mt-0.5 text-xs">
                              {o.summary}
                            </div>
                          )}
                        </td>
                        <td className={td}>
                          <div className="flex flex-wrap gap-1">
                            <OrderStatusBadge status={o.status} />
                            <PaymentStatusBadge status={o.paymentStatus} />
                          </div>
                        </td>
                        <td className={`${td} text-right tabular-nums`}>
                          {formatNtd(o.totalAmount)}
                        </td>
                        <td className={`${td} text-ink-3`}>
                          {o.submittedAt && formatTaipeiTime(o.submittedAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
