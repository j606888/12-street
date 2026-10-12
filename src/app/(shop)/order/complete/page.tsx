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
import { SHOP } from "@/lib/shop-info";

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
      <div className="grid justify-items-center gap-3 text-center">
        <span className="bg-line-green grid size-21 place-items-center rounded-full text-white">
          <CheckIcon className="size-12" />
        </span>
        <h1 className="text-4xl leading-tight font-black">訂單送出了</h1>
        <p className="text-[22px] text-[#4a423c]">洗好後，請到店裡拿照片。</p>
      </div>

      <div className="border-line bg-card overflow-hidden rounded-[20px] border">
        <div className="bg-brand-tint flex flex-wrap items-center justify-between gap-x-3 px-5 py-4">
          <span className="text-brand-dark text-xl font-bold">訂單編號</span>
          <p className="font-mono text-[28px] font-bold tracking-wide">
            {order.orderNo}
          </p>
        </div>
        {order.submittedAt && (
          <p className="text-muted border-t border-[#eeebe6] px-5 py-3 text-lg">
            {formatTaipeiTime(order.submittedAt)}
          </p>
        )}
      </div>

      <div className="bg-subtle grid gap-1 rounded-[20px] px-5 py-4 text-xl">
        <p className="font-bold">{SHOP.name}</p>
        <p>{SHOP.address}</p>
        {SHOP.hours.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </div>

      <OrderDetail order={order} />

      <nav className="grid gap-3 sm:grid-cols-2">
        <Link
          href="/orders/lookup"
          className="bg-brand flex min-h-17 items-center justify-center rounded-[18px] text-2xl font-bold text-white"
        >
          查訂單
        </Link>
        <Link
          href="/"
          className="bg-card flex min-h-17 items-center justify-center rounded-[18px] border-2 border-[#c9c2bb] text-[22px] font-bold"
        >
          回首頁
        </Link>
      </nav>
      <p className="text-muted text-center text-base">
        照片保留 1 個月後自動刪除
      </p>
    </>
  );
}
