import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { OrderForm } from "@/components/order/order-form";
import { ShopHeader } from "@/components/shop-header";
import {
  findDraftId,
  getOwner,
  lastContactEmail,
  loadCatalog,
  loadDraft,
} from "@/lib/draft";
import { LineLoginLink } from "@/components/line-login";

export const metadata: Metadata = { title: "線上下單｜線上洗照片" };

export default function OrderPage() {
  return (
    <>
      <ShopHeader wide>
        <Suspense fallback={null}>
          <MemberChip />
        </Suspense>
      </ShopHeader>
      <main className="mx-auto w-full max-w-6xl px-4 pt-5 pb-40 sm:px-6">
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
        className="border-line bg-card flex h-11 max-w-36 shrink-0 items-center rounded-full border px-4 text-[15px] font-bold"
      >
        <span className="truncate">{owner.name}</span>
      </Link>
    );
  }
  return (
    <LineLoginLink href="/login?next=/order" size="sm">
      LINE 登入
    </LineLoginLink>
  );
}

async function OrderLoader() {
  const owner = await getOwner();
  const [catalog, draftId, email] = await Promise.all([
    loadCatalog(),
    findDraftId(owner),
    owner.kind === "member" ? lastContactEmail(owner.userId) : null,
  ]);
  const draft = draftId ? await loadDraft(draftId) : null;
  if (!catalog.sizes.length) return <p>目前沒有可選的沖印尺寸，請稍後再試。</p>;
  return (
    <OrderForm
      catalog={catalog}
      draft={draft}
      member={
        owner.kind === "member"
          ? { name: owner.name, phone: owner.phone, email }
          : null
      }
    />
  );
}
