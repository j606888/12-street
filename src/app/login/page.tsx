import { Suspense } from "react";
import { ShopHeader } from "@/components/shop-header";
import { LoginButtons } from "./login-buttons";

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <>
      <ShopHeader />
      <main className="mx-auto grid w-full max-w-md gap-5 px-5 py-10">
        <h1 className="text-[32px] leading-tight font-black">用 LINE 登入</h1>
        <p className="text-xl text-[#4a423c]">登入後可以查以前的訂單。</p>
        <Suspense>
          <Buttons searchParams={searchParams} />
        </Suspense>
      </main>
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
