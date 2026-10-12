import Link from "next/link";
import { CameraIcon } from "@/components/icons";
import { SHOP } from "@/lib/shop-info";

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
        <Link href="/" className="flex min-w-0 flex-1 items-center gap-3">
          <span className="bg-brand grid size-10 shrink-0 place-items-center rounded-xl text-white">
            <CameraIcon className="size-5.5" />
          </span>
          <span className="truncate text-[17px] leading-tight font-bold">
            {SHOP.name}
          </span>
        </Link>
        {children}
      </div>
    </header>
  );
}
