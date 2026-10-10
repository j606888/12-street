import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto grid w-full max-w-md flex-1 content-center gap-6 px-4 py-16 text-center">
      <h1 className="text-3xl font-bold">線上洗照片</h1>
      <p className="text-neutral-600">
        上傳 JPG 照片、選尺寸和張數，線上下單，到店取件。
      </p>
      <div className="grid gap-3">
        <Link
          href="/order"
          className="rounded-lg bg-neutral-900 px-4 py-3 font-bold text-white"
        >
          開始下單
        </Link>
        <Link href="/login?next=/order" className="rounded-lg border px-4 py-3">
          LINE 會員登入
        </Link>
      </div>
    </main>
  );
}
