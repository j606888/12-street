import Link from "next/link";
import { cookies } from "next/headers";
import { DRAFT_COOKIE, LAST_ORDER_COOKIE } from "@/lib/draft";
import { ORDER_ACCESS_COOKIE } from "@/lib/order-view";
import { getSession } from "@/lib/session";

/**
 * Where "回到下單頁" leads: members to /order; browsers that already ordered as a
 * guest (draft, last order or lookup cookie) back to /guest, which is never
 * shown to anyone else. Reads cookies, so render it inside <Suspense>.
 */
export async function OrderEntryLink({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  let href = "/order";
  if (!(await getSession())) {
    const jar = await cookies();
    if (
      [DRAFT_COOKIE, LAST_ORDER_COOKIE, ORDER_ACCESS_COOKIE].some((n) =>
        jar.has(n),
      )
    )
      href = "/guest";
  }
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}
