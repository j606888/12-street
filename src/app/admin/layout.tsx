export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  // No session read here: every admin page calls requireAdmin() inside its own <Suspense>
  return <div className="mx-auto w-full max-w-6xl px-4 py-8">{children}</div>;
}
