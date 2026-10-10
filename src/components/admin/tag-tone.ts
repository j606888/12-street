// Tailwind classes for member tag colors (member_tags.color).

const TONES: Record<string, string> = {
  red: "border-red-200 bg-red-100 text-red-800",
  yellow: "border-amber-200 bg-amber-100 text-amber-800",
  green: "border-green-200 bg-green-100 text-green-800",
  blue: "border-sky-200 bg-sky-100 text-sky-800",
  gray: "border-neutral-200 bg-neutral-100 text-neutral-700",
};

export function tagTone(color: string): string {
  return TONES[color] ?? TONES.gray;
}
