import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { orderCounts } from "@/lib/admin";
import { requireAdmin } from "@/lib/session";

export const metadata: Metadata = { title: "後台｜線上洗照片" };

export default function AdminHome() {
  return (
    <main className="grid gap-4">
      <h1 className="text-2xl font-bold">後台</h1>
      <Suspense fallback={<p className="text-neutral-400">載入中…</p>}>
        <Overview />
      </Suspense>
    </main>
  );
}

async function Overview() {
  const admin = await requireAdmin();
  const counts = await orderCounts();
  const cards = [
    {
      label: "付款待確認",
      n: counts.pendingReview,
      href: "/admin/orders?payment=pending_review",
    },
    {
      label: "已送出",
      n: counts.submitted,
      href: "/admin/orders?status=submitted",
    },
    {
      label: "製作中",
      n: counts.printing,
      href: "/admin/orders?status=printing",
    },
    { label: "可取件", n: counts.ready, href: "/admin/orders?status=ready" },
  ];

  return (
    <>
      <p className="text-neutral-600">歡迎，{admin.name}</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {cards.map((c) => (
          <Link
            key={c.label}
            href={c.href}
            className="grid gap-1 rounded-xl border p-4 hover:bg-neutral-50"
          >
            <span className="text-sm text-neutral-600">{c.label}</span>
            <span className="text-3xl font-bold">{c.n}</span>
          </Link>
        ))}
      </div>
    </>
  );
}
