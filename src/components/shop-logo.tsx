import Image from "next/image";

// The shop's logo (public/logo.png, cropped from the owner's file with the
// white made transparent), next to the "12 Street" wordmark.
// Keep src/app/icon.png, apple-icon.png and favicon.ico in sync with it.

export function ShopLogo() {
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <Image
        src="/logo.png"
        alt=""
        width={409}
        height={360}
        loading="eager"
        className="h-11 w-auto shrink-0"
      />
      <span className="grid min-w-0 leading-none">
        <span className="truncate text-xl font-bold tracking-tight">
          1<span className="text-logo-grey">2</span> Street
        </span>
        <span className="text-muted mt-1 truncate text-[13px] tracking-[0.2em]">
          影像生活館
        </span>
      </span>
    </span>
  );
}
