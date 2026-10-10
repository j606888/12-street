import Link from "next/link";
import { SignOutButton } from "@/components/sign-out-button";

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  // No session read here: every admin page calls requireAdmin() inside its own <Suspense>
  return (
    <div className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-8">
      <nav className="flex flex-wrap items-center gap-x-5 border-b pb-2 text-sm">
        <Link href="/admin" className="py-2.5 font-bold">
          後台
        </Link>
        <Link href="/admin/orders" className="py-2.5 text-sky-700">
          訂單
        </Link>
        <Link href="/admin/members" className="py-2.5 text-sky-700">
          會員
        </Link>
        <Link href="/admin/photos" className="py-2.5 text-sky-700">
          照片
        </Link>
        <Link href="/" className="ml-auto py-2.5 text-neutral-500">
          回前台
        </Link>
        <SignOutButton className="py-2.5 text-neutral-500" />
      </nav>
      {children}
    </div>
  );
}
