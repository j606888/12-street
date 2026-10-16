import type { Metadata } from "next";
import { OrderScreen } from "@/components/order/order-screen";

export const metadata: Metadata = { title: "線上下單｜線上洗照片" };

export default function OrderPage() {
  return <OrderScreen />;
}
