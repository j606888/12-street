import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { OrderDetail } from "@/components/order/order-detail";
import { formatTaipeiTime } from "@/lib/format";
import { findViewableOrder } from "@/lib/order-view";

export const metadata: Metadata = { title: "訂單已送出｜線上洗照片" };

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
  const order = await findViewableOrder(id.data);
  if (!order) notFound();

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
            {formatTaipeiTime(order.submittedAt)}
          </p>
        )}
        <p className="text-sm text-neutral-600">
          請記下訂單編號，取件或詢問時會用到。
        </p>
      </div>

      <OrderDetail order={order} />

      <nav className="flex justify-center gap-6 text-sm text-sky-700">
        <Link href="/orders/lookup" className="underline">
          查詢訂單
        </Link>
        <Link href="/" className="underline">
          回首頁
        </Link>
      </nav>
    </>
  );
}
