import type { Tag } from "@/lib/admin";

export const TAG_CHIP =
  "inline-flex h-6 items-center rounded-md bg-admin-chip px-2 text-xs font-medium text-ink-2";

/** Read-only member tags, shown next to the customer's name. */
export function TagList({ tags }: { tags: Tag[] }) {
  if (!tags.length) return null;
  return (
    <>
      {tags.map((t) => (
        <span key={t.id} className={TAG_CHIP}>
          {t.name}
        </span>
      ))}
    </>
  );
}
