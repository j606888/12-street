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
        <span className="bg-line-green grid size-16 place-items-center rounded-full text-white">
          <CheckIcon className="size-9" />
        </span>
        <h1 className="text-[28px] leading-tight font-bold">訂單送出了</h1>
        <p className="text-muted text-lg">洗好後，請到店裡拿照片。</p>
      </div>

      <div className="border-line bg-card overflow-hidden rounded-2xl border">
        <div className="bg-brand-tint flex flex-wrap items-center justify-between gap-x-3 px-5 py-4">
          <span className="text-brand-dark text-[17px] font-bold">
            訂單編號
          </span>
          <p className="font-mono text-2xl font-bold tracking-wide">
            {order.orderNo}
          </p>
        </div>
        {order.submittedAt && (
          <p className="text-muted border-line border-t px-5 py-3 text-base">
            {formatTaipeiTime(order.submittedAt)}
          </p>
        )}
      </div>

      <div className="bg-subtle grid gap-1 rounded-2xl px-5 py-4 text-[17px]">
        <p className="font-bold">{SHOP.name}</p>
        <a
          href={SHOP.mapUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-brand-dark -my-2.5 flex min-h-11 w-fit items-center font-bold underline underline-offset-4"
        >
          {SHOP.address}
        </a>
        {SHOP.hours.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </div>

      <OrderDetail order={order} />

      <nav className="grid gap-3 sm:grid-cols-2">
        <Link
          href="/orders/lookup"
          className="bg-brand hover:bg-brand-dark flex h-13.5 items-center justify-center rounded-[14px] text-lg font-bold text-white"
        >
          查訂單
        </Link>
        <Link
          href={order.userId ? "/order" : "/guest"}
          className="bg-card border-field flex h-13.5 items-center justify-center rounded-[14px] border-2 text-[17px] font-bold"
        >
          再下一筆訂單
        </Link>
      </nav>
      <p className="text-muted text-center text-[15px]">
        照片保留 1 個月後自動刪除
      </p>
    </>
  );
}
