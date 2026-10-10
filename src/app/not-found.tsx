import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "找不到頁面｜線上洗照片" };

export default function NotFound() {
  return (
    <main className="mx-auto grid w-full max-w-md flex-1 content-center gap-6 px-4 py-16 text-center">
      <h1 className="text-2xl font-bold">找不到這個頁面</h1>
      <p className="text-neutral-600">
        網址可能有誤，或這筆資料已不存在。查看訂單請用訂單編號加手機號碼查詢，或先登入
        LINE 會員。
      </p>
      <div className="grid gap-3">
        <Link
          href="/"
          className="rounded-lg bg-neutral-900 px-4 py-3 font-bold text-white"
        >
          回首頁
        </Link>
        <Link
          href="/orders/lookup"
          className="py-2.5 text-sm text-sky-700 underline"
        >
          查詢訂單
        </Link>
      </div>
    </main>
  );
}
