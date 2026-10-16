import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { OrderDetail } from "@/components/order/order-detail";
import { formatTaipeiTime } from "@/lib/format";
import { findViewableOrder } from "@/lib/order-view";

export const metadata: Metadata = { title: "訂單明細｜線上洗照片" };

export default function OrderPage({ params }: PageProps<"/orders/[id]">) {
  return (
    <main className="mx-auto grid w-full max-w-2xl gap-6 px-4 py-10">
      <Suspense fallback={<p className="text-muted">載入中…</p>}>
        <Order params={params} />
      </Suspense>
    </main>
  );
}

async function Order({ params }: Pick<PageProps<"/orders/[id]">, "params">) {
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const order = await findViewableOrder(id.data);
  if (!order) notFound();

  return (
    <>
      <div className="grid gap-1">
        <p className="text-muted text-base">訂單編號</p>
        <h1 className="font-mono text-[26px] leading-tight font-bold tracking-wide">
          {order.orderNo}
        </h1>
        {order.submittedAt && (
          <p className="text-muted text-base">
            送出時間：{formatTaipeiTime(order.submittedAt)}
          </p>
        )}
      </div>

      <OrderDetail order={order} />

      <nav className="text-brand-dark flex justify-center gap-6 text-base">
        {order.userId ? (
          <Link href="/orders/mine" className="py-2.5 underline">
            我的訂單
          </Link>
        ) : (
          <Link href="/orders/lookup" className="py-2.5 underline">
            查詢其他訂單
          </Link>
        )}
        <Link
          href={order.userId ? "/order" : "/guest"}
          className="py-2.5 underline"
        >
          回到下單頁
        </Link>
      </nav>
    </>
  );
}
