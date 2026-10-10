"use client";

import Link from "next/link";

export default function ErrorPage({ retry }: { retry: () => void }) {
  return (
    <main className="mx-auto grid w-full max-w-md flex-1 content-center gap-6 px-4 py-16 text-center">
      <h1 className="text-2xl font-bold">發生了一點問題</h1>
      <p className="text-neutral-600">系統暫時無法完成這個操作，請稍後再試。</p>
      <div className="grid gap-3">
        <button
          type="button"
          onClick={() => retry()}
          className="rounded-lg bg-neutral-900 px-4 py-3 font-bold text-white"
        >
          重試
        </button>
        <Link href="/" className="py-2.5 text-sm text-sky-700 underline">
          回首頁
        </Link>
      </div>
    </main>
  );
}
