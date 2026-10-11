import {
  ORDER_STATUS_LABEL,
  PAYMENT_STATUS_LABEL,
  type OrderStatus,
  type PaymentStatus,
} from "@/lib/order-status";
import { PILL } from "./ui";

// Admin palette: amber = needs action, blue = printing, green = ready/paid
const ORDER_TONE: Record<OrderStatus, [pill: string, dot: string]> = {
  draft: ["bg-admin-chip text-ink-3", "bg-ink-4"],
  submitted: ["bg-warn-bg text-warn-fg", "bg-warn-dot"],
  printing: ["bg-info-bg text-info-fg", "bg-accent"],
  ready: ["bg-ok-bg text-ok-fg", "bg-ok-dot"],
  picked_up: ["bg-admin-chip text-ink-2", "bg-[#8a909b]"],
  cancelled: ["bg-admin-chip text-ink-4", "bg-[#a3a8b1]"],
};

const PAYMENT_TONE: Record<PaymentStatus, string> = {
  unpaid: "bg-admin-chip text-ink-2",
  pending_review: "bg-warn-bg text-warn-fg",
  paid: "bg-ok-bg text-ok-fg",
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const [pill, dot] = ORDER_TONE[status];
  return (
    <span className={`${PILL} ${pill}`}>
      <span aria-hidden="true" className={`size-1.5 rounded-full ${dot}`} />
      {ORDER_STATUS_LABEL[status]}
    </span>
  );
}

export function PaymentStatusBadge({
  status,
  long = false,
}: {
  status: PaymentStatus;
  long?: boolean;
}) {
  return (
    <span className={`${PILL} ${PAYMENT_TONE[status]}`}>
      {long && status === "pending_review"
        ? "付款待確認"
        : PAYMENT_STATUS_LABEL[status]}
    </span>
  );
}

/** "剩 3 天" until photos are deleted: red within 2 days, amber within 7. */
export function ExpiryPill({ days }: { days: number }) {
  const tone =
    days <= 2
      ? "bg-danger-bg text-danger-fg"
      : days <= 7
        ? "bg-warn-bg text-warn-fg"
        : "bg-admin-chip text-ink-2";
  return (
    <span className={`${PILL} font-semibold tabular-nums ${tone}`}>
      {days === 0 ? "今天刪除" : `剩 ${days} 天`}
    </span>
  );
}
