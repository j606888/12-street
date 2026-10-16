import { SHOP } from "@/lib/shop-info";

/** Address (opens Google Maps) and opening hours at the bottom of the shop pages. */
export function ShopFooter({ className = "" }: { className?: string }) {
  return (
    <footer className={`border-line bg-card border-t ${className}`}>
      <div className="mx-auto grid w-full max-w-6xl gap-3 px-5 py-7 text-[15px] sm:px-6 lg:text-base">
        <p className="text-lg font-bold">{SHOP.name}</p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
          <dt className="text-muted">地址</dt>
          <dd>
            <a
              href={SHOP.mapUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-dark -my-2.5 inline-flex min-h-11 items-center font-bold underline underline-offset-4"
            >
              {SHOP.address}
            </a>
          </dd>
          <dt className="text-muted">營業</dt>
          <dd>
            {SHOP.hours.map((line) => (
              <span key={line} className="block">
                {line}
              </span>
            ))}
          </dd>
        </dl>
        <p className="text-muted">照片保留 1 個月，之後自動刪除。</p>
      </div>
    </footer>
  );
}
