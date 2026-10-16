import { Suspense } from "react";
import { ShopFooter } from "@/components/shop-footer";
import { ShopHeader } from "@/components/shop-header";
import { LoginButtons } from "./login-buttons";

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <>
      <ShopHeader />
      <main className="mx-auto grid w-full max-w-md gap-5 px-5 py-10">
        <h1 className="text-[28px] leading-tight font-bold">用 LINE 登入</h1>
        <p className="text-muted text-[17px]">
          登入後就可以下單，也能查以前的訂單。
        </p>
        <Suspense>
          <Buttons searchParams={searchParams} />
        </Suspense>
      </main>
      <ShopFooter className="mt-auto" />
    </>
  );
}

async function Buttons({
  searchParams,
}: Pick<PageProps<"/login">, "searchParams">) {
  const { next } = await searchParams;
  // Only allow same-site relative redirects
  const target =
    typeof next === "string" && next.startsWith("/") && !next.startsWith("//")
      ? next
      : "/";
  return <LoginButtons next={target} />;
}
