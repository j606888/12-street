// Building blocks shared by the admin pages (cool grey palette, see globals.css).

export const btn = {
  primary:
    "inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-ink px-3.5 text-[13px] font-medium whitespace-nowrap text-white hover:bg-ink-2 disabled:opacity-50",
  secondary:
    "inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-admin-field bg-white px-3 text-[13px] font-medium whitespace-nowrap text-ink hover:bg-admin-hover disabled:opacity-50",
  accent:
    "inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-[#c8d4f7] bg-accent-soft px-3 text-[13px] font-medium whitespace-nowrap text-accent-dark hover:bg-[#e2e9fc] disabled:opacity-50",
  danger:
    "inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-danger-line bg-white px-3 text-[13px] font-medium whitespace-nowrap text-danger-fg hover:bg-danger-bg disabled:opacity-50",
  link: "font-medium text-accent hover:text-accent-dark",
};

export const field =
  "h-10 rounded-[10px] border border-admin-field bg-white px-3 text-sm text-ink outline-none focus:border-accent focus:ring-3 focus:ring-accent-soft";

export function PageHeader({
  title,
  description,
  children,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-center gap-4">
      <div className="grid min-w-60 flex-1 gap-0.5">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {description && <p className="text-ink-3">{description}</p>}
      </div>
      {children}
    </header>
  );
}

export function Card({
  title,
  action,
  children,
  className = "",
}: {
  title?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`border-admin-line relative overflow-hidden rounded-xl border bg-white ${className}`}
    >
      {title && (
        <div className="border-admin-line-soft flex items-center gap-3 border-b px-5 py-4">
          <h2 className="flex-1 text-base font-semibold">{title}</h2>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <p className="border-admin-line text-ink-3 rounded-xl border bg-white px-5 py-10 text-center">
      {children}
    </p>
  );
}

/** Table header cell / body cell paddings that line up with Card's 20px gutter. */
export const th =
  "px-2 py-2.5 text-left font-medium text-ink-4 first:pl-5 last:pr-5";
export const td = "px-2 py-3 align-top first:pl-5 last:pr-5";

export const PILL =
  "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium";
