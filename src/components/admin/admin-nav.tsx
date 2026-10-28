"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarIcon,
  HomeIcon,
  ImageIcon,
  ReceiptIcon,
  UsersIcon,
} from "@/components/icons";

const ITEMS = [
  { href: "/admin", label: "總覽", Icon: HomeIcon },
  { href: "/admin/orders", label: "訂單", Icon: ReceiptIcon },
  { href: "/admin/members", label: "會員", Icon: UsersIcon },
  { href: "/admin/photos", label: "照片保存", Icon: ImageIcon },
  { href: "/admin/calendar", label: "營業日", Icon: CalendarIcon },
] as const;

function isActive(href: string, pathname: string) {
  return href === "/admin"
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`);
}

/** Sidebar links; `pathname` is unknown while prerendering (no highlight then). */
export function NavLinks({
  pathname,
  orderBadge,
}: {
  pathname?: string;
  orderBadge?: React.ReactNode;
}) {
  return (
    <nav
      aria-label="後台選單"
      className="flex gap-0.5 max-md:flex-wrap md:flex-col"
    >
      {ITEMS.map(({ href, label, Icon }) => {
        const active = pathname !== undefined && isActive(href, pathname);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2.5 ${
              active
                ? "bg-accent-soft text-accent-dark font-semibold"
                : "text-ink-2 hover:bg-admin-chip hover:text-ink"
            }`}
          >
            <Icon className="size-[18px]" />
            <span className="flex-1">{label}</span>
            {href === "/admin/orders" && orderBadge}
          </Link>
        );
      })}
    </nav>
  );
}

export function AdminNav({ orderBadge }: { orderBadge?: React.ReactNode }) {
  return <NavLinks pathname={usePathname()} orderBadge={orderBadge} />;
}
