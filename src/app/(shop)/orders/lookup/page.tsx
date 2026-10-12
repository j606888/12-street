import type { Metadata } from "next";
import Link from "next/link";
import { LookupForm } from "./lookup-form";

export const metadata: Metadata = { title: "查詢訂單｜線上洗照片" };

export default function LookupPage() {
  return (
    <main className="mx-auto grid w-full max-w-md gap-6 px-4 py-10">
      <div className="grid gap-1">
        <h1 className="text-[28px] leading-tight font-bold">查詢訂單</h1>
        <p className="text-muted text-base">
          輸入訂單編號和下單時填寫的手機號碼。
        </p>
      </div>
      <LookupForm />
      <p className="text-muted text-base">
        LINE 會員可以直接到
        <Link href="/orders/mine" className="text-brand-dark underline">
          我的訂單
        </Link>
        查看。
      </p>
      <Link
        href="/"
        className="text-brand-dark py-2.5 text-center text-base underline"
      >
        回首頁
      </Link>
    </main>
  );
}
