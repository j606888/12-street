import { Fragment, Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq, and, count, sum } from "drizzle-orm";
import { cookies } from "next/headers";
import { z } from "zod";
import { PAYMENT_LABEL, PaymentDetails } from "@/components/payment-details";
import { db } from "@/lib/db";
import { groupCharges } from "@/lib/pricing";
import { LAST_ORDER_COOKIE } from "@/lib/draft";
import { getSession } from "@/lib/session";
import {
  orderGroups,
  orderItems,
  orders,
  photos,
  printSizes,
} from "@/db/schema";

export const metadata: Metadata = { title: "訂單已送出｜線上洗照片" };

const fmt = (n: number) => `NT$ ${n.toLocaleString("zh-TW")}`;
const taipeiTime = new Intl.DateTimeFormat("zh-TW", {
  timeZone: "Asia/Taipei",
  dateStyle: "medium",
  timeStyle: "short",
});

export default function CompletePage({
  searchParams,
}: PageProps<"/order/complete">) {
  return (
    <main className="mx-auto grid w-full max-w-2xl gap-6 px-4 py-10">
      <Suspense fallback={<p className="text-neutral-400">載入中…</p>}>
        <OrderSummary searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function OrderSummary({
  searchParams,
}: Pick<PageProps<"/order/complete">, "searchParams">) {
  const id = z.uuid().safeParse((await searchParams).id);
  if (!id.success) notFound();
  const orderId = id.data;

  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!order || order.status === "draft") notFound();

  // Visible to the member who placed it, or the browser that just submitted it
  const session = await getSession();
  const isOwner = !!session && order.userId === session.user.id;
  const justSubmitted =
    (await cookies()).get(LAST_ORDER_COOKIE)?.value === order.id;
  if (!isOwner && !justSubmitted) notFound();

  const [groups, items, [custom]] = await Promise.all([
    db
      .select({
        id: orderGroups.id,
        label: printSizes.label,
        unitPrice: orderGroups.unitPrice,
        laminationUnitPrice: orderGroups.laminationUnitPrice,
        photoCount: count(photos.id),
        prints: sum(photos.quantity).mapWith(Number),
      })
      .from(orderGroups)
      .innerJoin(printSizes, eq(printSizes.id, orderGroups.printSizeId))
      .leftJoin(photos, eq(photos.groupId, orderGroups.id))
      .where(eq(orderGroups.orderId, order.id))
      .groupBy(orderGroups.id, printSizes.label)
      .orderBy(asc(orderGroups.sortOrder)),
    db.select().from(orderItems).where(eq(orderItems.orderId, order.id)),
    db
      .select({ n: count() })
      .from(photos)
      .where(and(eq(photos.orderId, order.id), eq(photos.kind, "custom"))),
  ]);

  return (
    <>
      <div className="grid gap-2 rounded-xl bg-green-50 p-6 text-center">
        <p className="text-green-800">訂單已送出，謝謝你！</p>
        <p className="text-sm text-neutral-600">訂單編號</p>
        <p className="font-mono text-3xl font-bold tracking-wide">
          {order.orderNo}
        </p>
        {order.submittedAt && (
          <p className="text-sm text-neutral-500">
            {taipeiTime.format(order.submittedAt)}
          </p>
        )}
        <p className="text-sm text-neutral-600">
          請記下訂單編號，取件或詢問時會用到。
        </p>
      </div>

      <section className="grid gap-2">
        <h2 className="text-lg font-bold">訂單明細</h2>
        <table className="w-full text-sm">
          <tbody>
            {groups.map((g) => {
              const unitPrice = g.unitPrice ?? 0;
              const c = groupCharges({
                unitPrice,
                laminationUnitPrice: g.laminationUnitPrice,
                quantities: [g.prints],
              });
              return (
                <Fragment key={g.id}>
                  <tr className="border-b">
                    <td className="py-2">{g.label}</td>
                    <td className="py-2 text-neutral-600">
                      {g.photoCount} 張照片，共印 {g.prints} 張 ×{" "}
                      {fmt(unitPrice)}
                      {c.printing > unitPrice * g.prints && "（未滿低消）"}
                    </td>
                    <td className="py-2 text-right">{fmt(c.printing)}</td>
                  </tr>
                  {g.laminationUnitPrice !== null && (
                    <tr className="border-b">
                      <td className="py-2 pl-4">護貝</td>
                      <td className="py-2 text-neutral-600">
                        {g.prints} 張 × {fmt(g.laminationUnitPrice)}
                        {c.lamination > g.laminationUnitPrice * g.prints &&
                          "（未滿低消）"}
                      </td>
                      <td className="py-2 text-right">{fmt(c.lamination)}</td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {items.map((i) => (
              <tr key={i.id} className="border-b">
                <td className="py-2">{i.name}</td>
                <td className="py-2 text-neutral-600">
                  {i.quantity} {i.photoId ? "組" : "個"} × {fmt(i.unitPrice)}
                </td>
                <td className="py-2 text-right">
                  {fmt(i.unitPrice * i.quantity)}
                </td>
              </tr>
            ))}
            {(custom.n > 0 || order.customNote) && (
              <tr className="border-b">
                <td className="py-2">客製化製作</td>
                <td className="py-2 text-neutral-600">
                  {custom.n} 張照片
                  {order.customNote && (
                    <p className="whitespace-pre-line">{order.customNote}</p>
                  )}
                </td>
                <td className="py-2 text-right text-neutral-600">另行報價</td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr className="font-bold">
              <td className="pt-3" colSpan={2}>
                總計
              </td>
              <td className="pt-3 text-right text-lg">
                {fmt(order.totalAmount)}
              </td>
            </tr>
          </tfoot>
        </table>
      </section>

      <section className="grid gap-2 text-sm">
        <h2 className="text-lg font-bold">聯絡資料</h2>
        <p>
          {order.contactName}・{order.contactPhone}
        </p>
        {order.note && (
          <p className="whitespace-pre-line text-neutral-600">
            備註：{order.note}
          </p>
        )}
      </section>

      {order.paymentMethod && (
        <section className="grid gap-2 text-sm">
          <h2 className="text-lg font-bold">
            付款方式：{PAYMENT_LABEL[order.paymentMethod]}
          </h2>
          <div className="rounded-lg bg-neutral-50 p-4">
            <PaymentDetails method={order.paymentMethod} />
            {order.paymentMethod === "bank_transfer" && (
              <p className="mt-3 text-neutral-600">
                已收到
                {order.bankLast5 && (
                  <>
                    帳號末五碼{" "}
                    <span className="font-mono">{order.bankLast5}</span>
                  </>
                )}
                {order.bankLast5 && order.transferProofKey && "及"}
                {order.transferProofKey && "轉帳截圖"}
                ，店家確認入帳後會開始製作。
              </p>
            )}
          </div>
        </section>
      )}

      <Link href="/" className="text-center text-sm text-sky-700 underline">
        回首頁
      </Link>
    </>
  );
}
