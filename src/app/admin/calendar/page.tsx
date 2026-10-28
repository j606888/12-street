import { Suspense } from "react";
import type { Metadata } from "next";
import { ShopCalendar } from "@/components/admin/shop-calendar";
import { PageHeader } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/session";
import { loadDayOverrides } from "@/lib/shop-calendar";
import { monthOf, taipeiToday } from "@/lib/shop-days";
import { calendarMonthInput, firstParam } from "@/lib/validators/admin";

export const metadata: Metadata = { title: "營業日｜後台" };

export default function AdminCalendarPage({
  searchParams,
}: PageProps<"/admin/calendar">) {
  return (
    <main className="grid grid-cols-1 gap-5">
      <PageHeader
        title="營業日"
        description="點日期切換上班／店休，再點一次就改回來。週六、週日預設店休。"
      />
      <Suspense fallback={<p className="text-ink-4">載入中…</p>}>
        <Calendar searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Calendar({
  searchParams,
}: Pick<PageProps<"/admin/calendar">, "searchParams">) {
  await requireAdmin();
  const today = taipeiToday(new Date());
  const month =
    calendarMonthInput.parse(firstParam((await searchParams).month)) ??
    monthOf(today);
  // From the shown month's start, or today for the upcoming-closures list
  const monthStart = `${month}-01`;
  const overrides = await loadDayOverrides(
    monthStart < today ? monthStart : today,
  );
  return (
    <ShopCalendar
      key={month}
      month={month}
      today={today}
      overrides={overrides}
    />
  );
}
