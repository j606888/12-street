import type { Tag } from "@/lib/admin";
import { tagTone } from "./tag-tone";

export function TagList({ tags }: { tags: Tag[] }) {
  if (!tags.length) return null;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {tags.map((t) => (
        <span
          key={t.id}
          className={`rounded-full border px-2 py-0.5 text-xs ${tagTone(t.color)}`}
        >
          {t.name}
        </span>
      ))}
    </span>
  );
}
