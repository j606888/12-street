import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { OrderForm } from "@/components/order/order-form";
import { ShopHeader } from "@/components/shop-header";
import { findDraftId, getOwner, loadCatalog, loadDraft } from "@/lib/draft";

export const metadata: Metadata = { title: "線上下單｜線上洗照片" };

export default function OrderPage() {
  return (
    <>
      <ShopHeader>
        <Suspense fallback={null}>
          <MemberChip />
        </Suspense>
      </ShopHeader>
      <main className="mx-auto w-full max-w-3xl px-4 pt-5 pb-36">
        <Suspense fallback={<p className="text-muted">載入中…</p>}>
          <OrderLoader />
        </Suspense>
      </main>
    </>
  );
}

async function MemberChip() {
  const owner = await getOwner();
  if (owner.kind === "member") {
    return (
      <Link
        href="/orders/mine"
        className="flex h-9 max-w-32 items-center rounded-full border border-line bg-card px-3 text-[13px] font-semibold"
      >
        <span className="truncate">{owner.name}</span>
      </Link>
    );
  }
  return (
    <Link
      href="/login?next=/order"
      className="flex h-9 items-center rounded-full bg-[#06c755] px-3 text-[13px] font-bold text-white"
    >
      LINE 登入
    </Link>
  );
}

async function OrderLoader() {
  const owner = await getOwner();
  const [catalog, draftId] = await Promise.all([
    loadCatalog(),
    findDraftId(owner),
  ]);
  const draft = draftId ? await loadDraft(draftId) : null;
  if (!catalog.sizes.length) return <p>目前沒有可選的沖印尺寸，請稍後再試。</p>;
  return (
    <OrderForm
      catalog={catalog}
      draft={draft}
      member={
        owner.kind === "member"
          ? { name: owner.name, phone: owner.phone }
          : null
      }
    />
  );
}
