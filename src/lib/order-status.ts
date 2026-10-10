// Customer-facing labels for order and payment status.

export type OrderStatus =
  "draft" | "submitted" | "printing" | "ready" | "picked_up" | "cancelled";
export type PaymentStatus = "unpaid" | "pending_review" | "paid";

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  draft: "草稿",
  submitted: "已送出",
  printing: "製作中",
  ready: "可取件",
  picked_up: "已取件",
  cancelled: "已取消",
};

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  unpaid: "未付款",
  pending_review: "待確認",
  paid: "已付款",
};

/** Tailwind classes for the status badge. */
export function orderStatusTone(status: OrderStatus): string {
  switch (status) {
    case "ready":
      return "bg-green-100 text-green-800";
    case "printing":
      return "bg-sky-100 text-sky-800";
    case "cancelled":
      return "bg-neutral-200 text-neutral-500";
    case "picked_up":
      return "bg-neutral-100 text-neutral-700";
    default:
      return "bg-amber-100 text-amber-800";
  }
}

export function paymentStatusTone(status: PaymentStatus): string {
  switch (status) {
    case "paid":
      return "bg-green-100 text-green-800";
    case "pending_review":
      return "bg-amber-100 text-amber-800";
    default:
      return "bg-neutral-100 text-neutral-700";
  }
}
