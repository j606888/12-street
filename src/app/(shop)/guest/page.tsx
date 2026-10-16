import type { Metadata } from "next";
import { OrderScreen } from "@/components/order/order-screen";

export const metadata: Metadata = { title: "免登入下單｜線上洗照片" };

/** Ordering without LINE login; only reachable by this link, not from the site. */
export default function GuestOrderPage() {
  return <OrderScreen guest />;
}
