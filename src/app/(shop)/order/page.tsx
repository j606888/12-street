import { Suspense } from "react";
import type { Metadata } from "next";
import { OrderForm } from "@/components/order/order-form";
import { findDraftId, getOwner, loadCatalog, loadDraft } from "@/lib/draft";

export const metadata: Metadata = { title: "線上下單｜線上洗照片" };

export default function OrderPage() {
  return (
    <main className="mx-auto grid w-full max-w-3xl gap-6 px-4 py-10">
      <h1 className="text-2xl font-bold">線上下單</h1>
      <Suspense fallback={<p className="text-neutral-400">載入中…</p>}>
        <OrderLoader />
      </Suspense>
    </main>
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
