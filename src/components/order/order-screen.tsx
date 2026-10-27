import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LineLoginLink } from "@/components/line-login";
import { OrderForm } from "@/components/order/order-form";
import { ShopFooter } from "@/components/shop-footer";
import { ShopHeader } from "@/components/shop-header";
import {
  findDraftId,
  getOwner,
  lastContactEmail,
  loadCatalog,
  loadDraft,
  memberAllowsCash,
} from "@/lib/draft";

/**
 * The order flow page. `/order` is for LINE members only; `/guest` is the
 * separate link the shop hands out for ordering without signing in.
 */
export function OrderScreen({ guest }: { guest?: boolean }) {
  return (
    <>
      <ShopHeader wide>
        <Suspense fallback={null}>
          <MemberChip guest={guest} />
        </Suspense>
      </ShopHeader>
      <main className="mx-auto w-full max-w-6xl px-4 pt-5 pb-10 sm:px-6">
        <Suspense fallback={<p className="text-muted">載入中…</p>}>
          <OrderLoader guest={guest} />
        </Suspense>
      </main>
      {/* Room for the fixed bottom bar of the order screens */}
      <ShopFooter className="pb-36" />
    </>
  );
}

async function MemberChip({ guest }: { guest?: boolean }) {
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
  if (!guest) return null;
  return (
    <nav className="flex shrink-0 items-center gap-1 text-base font-bold">
      <Link
        href="/orders/lookup"
        className="flex min-h-11 items-center px-2 sm:px-3.5"
      >
        查訂單
      </Link>
      <LineLoginLink href="/login?next=/order" size="sm">
        LINE 登入
      </LineLoginLink>
    </nav>
  );
}

async function OrderLoader({ guest }: { guest?: boolean }) {
  const owner = await getOwner();
  if (owner.kind !== "member" && !guest) redirect("/login?next=/order");
  const [catalog, draftId, email, cashAllowed] = await Promise.all([
    loadCatalog(),
    findDraftId(owner),
    owner.kind === "member" ? lastContactEmail(owner.userId) : null,
    // The in-store /guest link always offers cash, even to signed-in members
    guest || (owner.kind === "member" && memberAllowsCash(owner.userId)),
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
      cashAllowed={cashAllowed}
      guestLink={guest}
    />
  );
}
