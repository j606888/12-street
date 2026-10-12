"use client";

import Link from "next/link";

export default function ErrorPage({ retry }: { retry: () => void }) {
  return (
    <main className="mx-auto grid w-full max-w-md flex-1 content-center gap-6 px-4 py-16 text-center">
      <h1 className="text-[28px] leading-tight font-bold">發生了一點問題</h1>
      <p className="text-muted">系統暫時無法完成這個操作，請稍後再試。</p>
      <div className="grid gap-3">
        <button
          type="button"
          onClick={() => retry()}
          className="bg-brand hover:bg-brand-dark flex h-13.5 items-center justify-center rounded-[14px] px-4 text-lg font-bold text-white"
        >
          重試
        </button>
        <Link href="/" className="text-brand-dark py-2.5 text-base underline">
          回首頁
        </Link>
      </div>
    </main>
  );
}
