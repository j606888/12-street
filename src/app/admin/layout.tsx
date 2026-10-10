import Link from "next/link";

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  // No session read here: every admin page calls requireAdmin() inside its own <Suspense>
  return (
    <div className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-8">
      <nav className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b pb-4 text-sm">
        <Link href="/admin" className="font-bold">
          後台
        </Link>
        <Link href="/admin/orders" className="text-sky-700">
          訂單
        </Link>
        <Link href="/admin/members" className="text-sky-700">
          會員
        </Link>
        <Link href="/admin/photos" className="text-sky-700">
          照片
        </Link>
        <Link href="/" className="ml-auto text-neutral-500">
          回前台
        </Link>
      </nav>
      {children}
    </div>
  );
}
