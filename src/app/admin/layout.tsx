import { Suspense } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { AdminNav, NavLinks } from "@/components/admin/admin-nav";
import { ExternalLinkIcon } from "@/components/icons";
import { SignOutButton } from "@/components/sign-out-button";
import { orderCounts } from "@/lib/admin";
import { getAdmin } from "@/lib/session";

const geist = Geist({ variable: "--font-geist", subsets: ["latin"] });
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  // No session read here: every admin page calls requireAdmin() inside its own
  // <Suspense>, and the sidebar's dynamic bits check getAdmin() themselves.
  const badge = (
    <Suspense fallback={null}>
      <TodoBadge />
    </Suspense>
  );
  return (
    <div
      className={`${geist.variable} ${geistMono.variable} bg-admin-bg font-admin text-ink flex flex-1 flex-wrap text-sm`}
    >
      <aside className="border-admin-line flex max-w-full flex-[1_1_232px] flex-col gap-5 bg-white px-3.5 py-5 max-md:border-b md:gap-6 md:border-r">
        <Link href="/admin" className="flex items-center gap-2.5 px-2">
          <span className="bg-ink grid size-8 place-items-center rounded-lg text-[13px] font-bold text-white">
            12
          </span>
          <span className="grid">
            <span className="text-[15px] font-bold">十二街影像生活館</span>
            <span className="text-ink-4 text-xs">洗照片後台</span>
          </span>
        </Link>
        <Suspense fallback={<NavLinks orderBadge={badge} />}>
          <AdminNav orderBadge={badge} />
        </Suspense>
        <div className="border-admin-line flex gap-0.5 max-md:flex-wrap md:mt-auto md:flex-col md:border-t md:pt-3.5">
          <Link
            href="/"
            className="text-ink-2 hover:bg-admin-chip flex items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-[13px]"
          >
            <ExternalLinkIcon className="size-4" />
            回前台
          </Link>
          <div className="flex items-center gap-2.5 px-2.5 py-1.5">
            <Suspense fallback={<span className="flex-1" />}>
              <AdminName />
            </Suspense>
            <SignOutButton className="text-ink-3 hover:bg-admin-chip hover:text-ink rounded-lg px-2 py-2 text-[13px]" />
          </div>
        </div>
      </aside>
      <div className="min-w-0 flex-[999_1_560px] px-4 pt-6 pb-12 md:px-9 md:pt-7">
        <div className="mx-auto grid max-w-[1180px] grid-cols-1 gap-5">
          {children}
        </div>
      </div>
    </div>
  );
}

/** Orders waiting on the shop: new ones plus payments to review. */
async function TodoBadge() {
  if (!(await getAdmin())) return null;
  const { todo } = await orderCounts();
  if (!todo) return null;
  return (
    <span className="bg-warn-bg text-warn-fg rounded-full px-2 text-xs font-semibold tabular-nums">
      {todo}
    </span>
  );
}

async function AdminName() {
  const admin = await getAdmin();
  return (
    <span className="text-ink-2 min-w-0 flex-1 truncate text-[13px]">
      {admin?.name}
    </span>
  );
}
