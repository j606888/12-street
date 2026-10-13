import { Suspense } from "react";
import Link from "next/link";
import { ArrowRightIcon, BookIcon, IdCardIcon } from "@/components/icons";
import { ShopHeader } from "@/components/shop-header";
import { SignOutButton } from "@/components/sign-out-button";
import { loadCatalog } from "@/lib/draft";
import { MIN_GROUP_CHARGE } from "@/lib/pricing";
import { getSession } from "@/lib/session";
import { SHOP } from "@/lib/shop-info";

const STEPS = [
  ["選尺寸", "看要洗多大張"],
  ["選照片", "從手機相簿挑"],
  ["到店取件", "拿照片時再付錢也可以"],
] as const;

const bigButton =
  "flex h-13.5 items-center sm:flex-1 sm:basis-56 justify-center gap-2 rounded-[14px] px-6 text-lg font-bold";

export default function Home() {
  return (
    <>
      <ShopHeader wide>
        <nav className="flex shrink-0 items-center gap-1 text-base font-bold sm:gap-3">
          <a
            href="#prices"
            className="hidden min-h-11 items-center px-3.5 sm:flex"
          >
            價目表
          </a>
          <Link
            href="/orders/lookup"
            className="flex min-h-11 items-center px-2 sm:px-3.5"
          >
            查訂單
          </Link>
          <Suspense fallback={null}>
            <HeaderMember />
          </Suspense>
        </nav>
      </ShopHeader>

      <main className="text-[17px] leading-relaxed">
        <section className="mx-auto flex w-full max-w-6xl items-center gap-16 px-5 pt-8 pb-10 sm:px-6 lg:pt-18 lg:pb-22">
          <div className="grid min-w-0 flex-1 gap-5 lg:gap-6">
            <p className="bg-brand-soft text-brand-dark w-fit rounded-full px-3.5 py-1 text-[15px] font-bold">
              線上洗照片
            </p>
            <h1 className="text-4xl leading-[1.2] font-bold lg:text-[52px]">
              照片傳上來，
              <br />
              到店就能拿。
            </h1>
            <p className="text-muted text-lg lg:text-xl">
              用手機選照片、選尺寸，洗好再來店裡拿。
            </p>
            <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:gap-3.5">
              <Link
                href="/order"
                className={`${bigButton} bg-brand hover:bg-brand-dark text-white`}
              >
                開始洗照片
                <ArrowRightIcon className="size-5.5" />
              </Link>
              <Suspense
                fallback={<span className="h-13.5 sm:flex-1 sm:basis-56" />}
              >
                <MemberButton />
              </Suspense>
            </div>
            <Suspense fallback={<p className="min-h-7" />}>
              <MemberNote />
            </Suspense>
          </div>
          <PrintStack />
        </section>

        <section className="border-line bg-card border-y">
          <div className="mx-auto grid w-full max-w-6xl gap-5 px-5 py-9 sm:px-6 lg:gap-8 lg:py-16">
            <h2 className="text-2xl leading-tight font-bold lg:text-[28px]">
              三個步驟就完成
            </h2>
            <ol className="grid gap-3.5 lg:grid-cols-3 lg:gap-5">
              {STEPS.map(([title, desc], i) => (
                <li
                  key={title}
                  className="border-line bg-background flex items-center gap-3.5 rounded-2xl border px-4 py-3.5 lg:p-5"
                >
                  <span className="bg-brand grid size-11 shrink-0 place-items-center rounded-full text-xl font-bold text-white lg:size-12 lg:text-[22px]">
                    {i + 1}
                  </span>
                  <span>
                    <span className="block text-lg leading-snug font-bold lg:text-xl">
                      {title}
                    </span>
                    <span className="text-muted block text-[15px] lg:text-base">
                      {desc}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section
          id="prices"
          className="mx-auto grid w-full max-w-6xl gap-5 px-5 py-9 sm:px-6 lg:gap-7 lg:py-16"
        >
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-2xl leading-tight font-bold lg:text-[28px]">
              價目表
            </h2>
            <p className="text-muted text-[15px] lg:text-base">每張價格</p>
          </div>
          <Suspense
            fallback={<p className="text-muted min-h-96">價目表載入中…</p>}
          >
            <PriceList />
          </Suspense>
        </section>

        <section className="mx-auto w-full max-w-6xl px-5 pb-10 sm:px-6 lg:pb-18">
          <div className="bg-foreground text-background flex flex-col gap-5 rounded-3xl px-6 py-7 lg:flex-row lg:items-center lg:justify-between lg:gap-10 lg:px-12 lg:py-11">
            <div>
              <h2 className="text-2xl leading-tight font-bold lg:text-[28px]">
                現在就把照片傳上來
              </h2>
              <p className="text-background/75 mt-2 text-base lg:text-lg">
                只收 JPG 照片，手機拍的可以直接傳。
              </p>
            </div>
            <Link
              href="/order"
              className="bg-card text-foreground flex h-13.5 shrink-0 items-center justify-center gap-2 rounded-[14px] px-6 text-lg font-bold lg:w-64"
            >
              開始洗照片
              <ArrowRightIcon className="size-5.5" />
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-line bg-card border-t">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-5 py-8 text-[15px] sm:px-6 lg:flex-row lg:gap-16 lg:py-10 lg:text-base">
          <div className="flex-1">
            <p className="text-lg font-bold lg:text-xl">{SHOP.name}</p>
            <p className="text-muted mt-1.5">照片保留 1 個月，之後自動刪除。</p>
          </div>
          <dl className="grid flex-1 grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
            <dt className="text-muted">地址</dt>
            <dd>{SHOP.address}</dd>
            <dt className="text-muted">營業</dt>
            <dd>
              {SHOP.hours.map((line) => (
                <span key={line} className="block">
                  {line}
                </span>
              ))}
            </dd>
          </dl>
        </div>
      </footer>
    </>
  );
}

async function HeaderMember() {
  const session = await getSession();
  return session ? (
    <Link
      href="/orders/mine"
      className="border-line hidden min-h-11 items-center rounded-full border px-4 sm:flex"
    >
      我的訂單
    </Link>
  ) : (
    <Link
      href="/login?next=/order"
      className="bg-line-green hidden min-h-11 items-center rounded-full px-4 text-white sm:flex"
    >
      LINE 登入
    </Link>
  );
}

async function MemberButton() {
  const session = await getSession();
  return session ? (
    <Link
      href="/orders/mine"
      className={`${bigButton} bg-card border-field border-2`}
    >
      我的訂單
    </Link>
  ) : (
    <Link
      href="/login?next=/order"
      className={`${bigButton} bg-line-green text-white`}
    >
      用 LINE 登入
    </Link>
  );
}

async function MemberNote() {
  const session = await getSession();
  if (!session)
    return (
      <p className="text-muted text-center text-[15px] sm:text-left lg:text-base">
        不登入也可以直接下單。登入後可以查以前的訂單。
      </p>
    );
  return (
    <p className="text-muted flex flex-wrap items-center justify-center gap-x-3 text-[15px] sm:justify-start lg:text-base">
      {session.user.name}，您好
      <SignOutButton className="min-h-11 font-bold underline underline-offset-4" />
    </p>
  );
}

async function PriceList() {
  const catalog = await loadCatalog();
  const minimumSizes = catalog.sizes
    .filter((s) => s.price < MIN_GROUP_CHARGE)
    .map((s) => s.label);
  return (
    <>
      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        {catalog.sizes.map((s) => {
          return (
            <li
              key={s.id}
              className="border-line bg-card relative grid gap-0.5 rounded-2xl border-2 px-4 py-3.5 lg:px-5 lg:py-4.5"
            >
              <span className="text-[23px] leading-tight font-bold lg:text-[26px]">
                {s.label}
              </span>
              <span className="text-brand-dark text-lg leading-tight font-bold lg:text-xl">
                ${s.price}
              </span>
              <span className="text-muted text-[15px]">
                護貝每張 +${s.laminationPrice}
              </span>
            </li>
          );
        })}
      </ul>
      {minimumSizes.length > 0 && (
        <p className="text-muted text-[15px] lg:text-base">
          {minimumSizes.join("、")} 只洗一張時收 ${MIN_GROUP_CHARGE}。
        </p>
      )}
      <div className="grid gap-3 lg:grid-cols-2 lg:gap-4">
        {catalog.idPhotoSets.length > 0 && (
          <ServiceCard
            icon={<IdCardIcon className="size-6" />}
            title="證件照"
            desc="護照、身分證、駕照都可以"
            price={`一組 $${catalog.idPhotoSets[0].price}`}
          />
        )}
        <ServiceCard
          icon={<BookIcon className="size-6" />}
          title="客製化商品"
          desc="相冊、馬克杯等都可以做"
          price="專人報價"
        />
      </div>
    </>
  );
}

function ServiceCard({
  icon,
  title,
  desc,
  price,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  price: string;
}) {
  return (
    <Link
      href="/order"
      className="border-line bg-card hover:border-brand flex items-center gap-3.5 rounded-2xl border-2 px-4 py-3.5 lg:px-5 lg:py-4.5"
    >
      <span className="bg-brand-soft text-brand-dark grid size-11 shrink-0 place-items-center rounded-xl">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-lg leading-snug font-bold lg:text-xl">
          {title}
        </span>
        <span className="text-muted hidden text-[15px] sm:block lg:text-base">
          {desc}
        </span>
      </span>
      <span className="text-brand-dark text-base font-bold whitespace-nowrap lg:text-lg">
        {price}
      </span>
    </Link>
  );
}

const PRINT_SHADOW =
  "shadow-[0_1px_2px_rgba(43,52,64,0.08),0_14px_30px_rgba(43,52,64,0.14)]";

/** Decorative stack of prints next to the headline (desktop only). */
function PrintStack() {
  return (
    <div aria-hidden="true" className="hidden flex-1 justify-center lg:flex">
      <div className="relative aspect-[1/0.92] w-full max-w-120">
        <div
          className={`absolute top-0 left-[3%] w-[58%] -rotate-6 bg-white p-2.5 pb-9 ${PRINT_SHADOW}`}
        >
          <div className="bg-brand-soft text-foreground aspect-[4/5]">
            <svg
              viewBox="0 0 60 75"
              preserveAspectRatio="xMidYMid slice"
              className="block size-full"
            >
              <circle cx="43" cy="20" r="7" fill="#fff" opacity="0.75" />
              <path
                d="M0 75V52l16-14 13 12 11-8 20 16v17z"
                fill="currentColor"
                opacity="0.16"
              />
            </svg>
          </div>
        </div>
        <div
          className={`absolute top-[16%] right-0 w-[52%] rotate-5 bg-white p-2.5 pb-9 ${PRINT_SHADOW}`}
        >
          <div className="bg-subtle text-foreground aspect-[3/2]">
            <svg
              viewBox="0 0 60 40"
              preserveAspectRatio="xMidYMid slice"
              className="block size-full"
            >
              <circle cx="15" cy="12" r="5" fill="#fff" opacity="0.75" />
              <path
                d="M0 40V30l18-12 12 9 12-7 18 12v8z"
                fill="currentColor"
                opacity="0.16"
              />
            </svg>
          </div>
        </div>
        <div
          className={`absolute bottom-0 left-[24%] w-[31%] -rotate-2 bg-white p-2 pb-7 ${PRINT_SHADOW}`}
        >
          <div className="bg-line text-foreground aspect-[3/4]">
            <svg
              viewBox="0 0 30 40"
              preserveAspectRatio="xMidYMid slice"
              className="block size-full"
            >
              <circle
                cx="15"
                cy="15"
                r="6"
                fill="currentColor"
                opacity="0.16"
              />
              <path
                d="M3 40c0-9 5-14 12-14s12 5 12 14z"
                fill="currentColor"
                opacity="0.16"
              />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}
