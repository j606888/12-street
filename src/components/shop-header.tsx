import Link from "next/link";
import { CameraIcon } from "@/components/icons";

/** Brand bar on top of the shop pages; `children` goes on the right. */
export function ShopHeader({ children }: { children?: React.ReactNode }) {
  return (
    <header className="border-b border-line bg-card/70 backdrop-blur">
      <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
        <Link href="/" className="flex min-w-0 flex-1 items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-[10px] bg-brand text-white">
            <CameraIcon />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[17px] leading-tight font-bold">
              十二街寫真攝影館
            </span>
            <span className="block text-xs text-muted">
              線上洗照片 · 上傳就搞定
            </span>
          </span>
        </Link>
        {children}
      </div>
    </header>
  );
}
