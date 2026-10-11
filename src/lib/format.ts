// Display formatting: NT$ amounts and Asia/Taipei times.

export const formatNtd = (n: number) => `NT$ ${n.toLocaleString("zh-TW")}`;

const taipeiTime = new Intl.DateTimeFormat("zh-TW", {
  timeZone: "Asia/Taipei",
  dateStyle: "medium",
  timeStyle: "short",
});

export const formatTaipeiTime = (date: Date) => taipeiTime.format(date);

/** 1536 → "1.5 KB", 12117274 → "11.6 MB" */
export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(1)} ${units[i]}`;
}

const taipeiDate = new Intl.DateTimeFormat("zh-TW", {
  timeZone: "Asia/Taipei",
  dateStyle: "full",
});

/** "2026年10月11日 星期日" */
export const formatTaipeiDate = (date: Date) => taipeiDate.format(date);

/** Whole days from `now` until `date`, rounded up (0 once it has passed). */
export function daysUntil(date: Date, now: Date): number {
  return Math.max(0, Math.ceil((date.getTime() - now.getTime()) / 86_400_000));
}
