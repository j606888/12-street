import Link from "next/link";
import { ShopLogo } from "@/components/shop-logo";

/** Brand bar on top of the shop pages; `children` goes on the right. */
export function ShopHeader({
  wide,
  children,
}: {
  /** Match the home page's wider column. */
  wide?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <header className="border-line bg-card border-b">
      <div
        className={`mx-auto flex items-center gap-3 px-4 py-3 ${
          wide ? "max-w-6xl sm:px-6" : "max-w-3xl"
        }`}
      >
        <Link
          href="/"
          aria-label="12 Street 影像生活工場 首頁"
          className="flex min-h-11 min-w-0 flex-1 items-center"
        >
          <ShopLogo />
        </Link>
        {children}
      </div>
    </header>
  );
}
