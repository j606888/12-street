// LINE Login buttons styled per LINE's button guidelines
// (https://developers.line.biz/en/docs/line-login/login-button/):
// official green, the official icon unaltered, a 8% black separator, and
// 10% / 30% black overlays for hover / pressed.
import Image from "next/image";
import Link from "next/link";
import lineIcon from "./line-icon.png";

const SIZES = {
  /** Full-width call to action, same height as the shop's other buttons. */
  lg: { box: "h-13.5 rounded-[14px] text-lg", icon: "size-13.5", text: "px-6" },
  /** Compact pill for page headers. */
  sm: {
    box: "h-11 rounded-full text-[15px]",
    icon: "size-11",
    text: "pl-3.5 pr-4.5",
  },
} as const;

export type LineButtonSize = keyof typeof SIZES;

export function lineButtonClass(size: LineButtonSize) {
  return `bg-line-green flex shrink-0 items-center overflow-hidden font-bold text-white hover:shadow-[inset_0_0_0_999px_rgb(0_0_0/0.1)] active:shadow-[inset_0_0_0_999px_rgb(0_0_0/0.3)] ${SIZES[size].box}`;
}

/** Icon cell + separator + label; put inside an element styled with `lineButtonClass`. */
export function LineButtonContent({
  size,
  children,
}: {
  size: LineButtonSize;
  children: React.ReactNode;
}) {
  return (
    <>
      <Image src={lineIcon} alt="" className={`${SIZES[size].icon} shrink-0`} />
      <span className="h-full w-px shrink-0 bg-black/8" />
      <span
        className={`flex-1 text-center whitespace-nowrap ${SIZES[size].text}`}
      >
        {children}
      </span>
    </>
  );
}

export function LineLoginLink({
  href,
  size,
  className = "",
  children,
}: {
  href: string;
  size: LineButtonSize;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} className={`${lineButtonClass(size)} ${className}`}>
      <LineButtonContent size={size}>{children}</LineButtonContent>
    </Link>
  );
}

/** The bare official icon on an official-green tile, for inline hints. */
export function LineIconTile({
  className = "size-9 rounded-lg",
}: {
  className?: string;
}) {
  return (
    <span
      className={`bg-line-green grid shrink-0 place-items-center overflow-hidden ${className}`}
    >
      <Image src={lineIcon} alt="" className="size-full" />
    </span>
  );
}
