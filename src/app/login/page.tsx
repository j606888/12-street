import { Suspense } from "react";
import { LoginButtons } from "./login-buttons";

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <main className="mx-auto grid w-full max-w-sm gap-6 px-4 py-16">
      <h1 className="text-2xl font-bold">登入</h1>
      <p className="text-sm text-neutral-600">登入後可以查看歷史訂單；也可以不登入直接下單。</p>
      <Suspense>
        <Buttons searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Buttons({ searchParams }: Pick<PageProps<"/login">, "searchParams">) {
  const { next } = await searchParams;
  // Only allow same-site relative redirects
  const target =
    typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : "/";
  return <LoginButtons next={target} />;
}
