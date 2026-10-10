// Display formatting: NT$ amounts and Asia/Taipei times.

export const formatNtd = (n: number) => `NT$ ${n.toLocaleString("zh-TW")}`;

const taipeiTime = new Intl.DateTimeFormat("zh-TW", {
  timeZone: "Asia/Taipei",
  dateStyle: "medium",
  timeStyle: "short",
});

export const formatTaipeiTime = (date: Date) => taipeiTime.format(date);
