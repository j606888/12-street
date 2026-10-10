import type { Metadata } from "next";
import Link from "next/link";
import { LookupForm } from "./lookup-form";

export const metadata: Metadata = { title: "查詢訂單｜線上洗照片" };

export default function LookupPage() {
  return (
    <main className="mx-auto grid w-full max-w-md gap-6 px-4 py-10">
      <div className="grid gap-1">
        <h1 className="text-2xl font-bold">查詢訂單</h1>
        <p className="text-sm text-neutral-600">
          輸入訂單編號和下單時填寫的手機號碼。
        </p>
      </div>
      <LookupForm />
      <p className="text-sm text-neutral-600">
        LINE 會員可以直接到
        <Link href="/orders/mine" className="text-sky-700 underline">
          我的訂單
        </Link>
        查看。
      </p>
      <Link
        href="/"
        className="py-2.5 text-center text-sm text-sky-700 underline"
      >
        回首頁
      </Link>
    </main>
  );
}
