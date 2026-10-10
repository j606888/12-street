import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export const getSession = cache(async () => {
  return auth.api.getSession({ headers: await headers() });
});

export async function requireUser(next?: string) {
  const session = await getSession();
  if (!session)
    redirect(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  return session.user;
}

export async function requireAdmin() {
  const session = await getSession();
  if (!session) redirect("/login?next=/admin");
  if (session.user.role !== "admin") notFound();
  return session.user;
}

/** For Server Actions: the admin user, or null (no redirect). */
export async function getAdmin() {
  const session = await getSession();
  return session?.user.role === "admin" ? session.user : null;
}
