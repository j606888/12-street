// The shop's logo, redrawn from its Facebook avatar: a one-stroke heart that
// starts from a spiral, next to the "12 Street" wordmark.
// Keep the heart path in sync with src/app/icon.svg.

export const HEART_PATH =
  "M34.5 34.5C35 31 31.5 29.5 29.5 31.5C26.5 34.5 28 40 33 41C39 42 43 37 42 31C41 24 34 20 27 21C15 22 8 32 10 42C13 58 34 72 52 88C66 72 86 56 90 40C93 26 86 16 76 17C66 18 60 26 58 32";

export function HeartMark({ className = "size-10" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 100 100"
      fill="none"
      stroke="currentColor"
      strokeWidth={6.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`text-logo-wine ${className}`}
    >
      <path d={HEART_PATH} />
    </svg>
  );
}

export function ShopLogo() {
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <HeartMark className="size-9.5 shrink-0" />
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
