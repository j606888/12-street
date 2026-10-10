import {
  ORDER_STATUS_LABEL,
  orderStatusTone,
  PAYMENT_STATUS_LABEL,
  paymentStatusTone,
  type OrderStatus,
  type PaymentStatus,
} from "@/lib/order-status";

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 whitespace-nowrap ${orderStatusTone(status)}`}
    >
      {ORDER_STATUS_LABEL[status]}
    </span>
  );
}

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 whitespace-nowrap ${paymentStatusTone(status)}`}
    >
      {PAYMENT_STATUS_LABEL[status]}
    </span>
  );
}
