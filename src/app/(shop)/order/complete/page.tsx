import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { CheckIcon } from "@/components/icons";
import { OrderDetail } from "@/components/order/order-detail";
import { ShopHeader } from "@/components/shop-header";
import { formatTaipeiTime } from "@/lib/format";
import { findViewableOrder } from "@/lib/order-view";

export const metadata: Metadata = { title: "訂單已送出｜線上洗照片" };

export default function CompletePage({
  searchParams,
}: PageProps<"/order/complete">) {
  return (
    <>
      <ShopHeader />
      <main className="mx-auto grid w-full max-w-2xl gap-4 px-4 pt-7 pb-10">
        <Suspense fallback={<p className="text-muted">載入中…</p>}>
          <OrderSummary searchParams={searchParams} />
        </Suspense>
      </main>
    </>
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
      <div className="grid justify-items-center gap-2 text-center">
        <span className="grid size-16 place-items-center rounded-full bg-[#e6f4ea] text-[#1e6b3a]">
          <CheckIcon className="size-8" />
        </span>
        <h1 className="mt-1 text-2xl font-extrabold">謝謝！訂單收到了</h1>
        <p className="text-sm text-muted">訂單編號</p>
        <p className="font-mono text-3xl font-bold tracking-wide">
          {order.orderNo}
        </p>
        {order.submittedAt && (
          <p className="text-sm text-muted">
            {formatTaipeiTime(order.submittedAt)}
          </p>
        )}
        <p className="text-sm text-muted">
          請記下訂單編號，取件或詢問時會用到。
        </p>
      </div>

      <OrderDetail order={order} />

      <nav className="grid grid-cols-2 gap-2.5">
        <Link
          href="/orders/lookup"
          className="flex h-12 items-center justify-center rounded-2xl border border-line bg-card text-[15px] font-semibold"
        >
          查詢訂單
        </Link>
        <Link
          href="/"
          className="flex h-12 items-center justify-center rounded-2xl border border-line bg-card text-[15px] font-semibold"
        >
          回首頁
        </Link>
      </nav>
      <p className="text-center text-xs text-muted">
        照片保留 1 個月後自動刪除
      </p>
    </>
  );
}
