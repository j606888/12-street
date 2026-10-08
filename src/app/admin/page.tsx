import { Suspense } from "react";
import { requireAdmin } from "@/lib/session";

export default function AdminHome() {
  return (
    <main className="grid gap-2">
      <h1 className="text-2xl font-bold">後台</h1>
      <Suspense fallback={<p className="text-neutral-400">載入中…</p>}>
        <Welcome />
      </Suspense>
    </main>
  );
}

async function Welcome() {
  const admin = await requireAdmin();
  return <p className="text-neutral-600">歡迎，{admin.name}</p>;
}
