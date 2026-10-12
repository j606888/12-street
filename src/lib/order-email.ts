// Plain-text notification emails sent to the customer as an order moves along.

import { formatNtd } from "./format";

export type OrderEmailKind = "submitted" | "paid" | "ready" | "cancelled";

export type OrderEmailData = {
  orderNo: string;
  contactName: string;
  totalAmount: number;
  paymentLabel: string;
  /** Where the customer can look the order up */
  orderUrl: string;
};

const SHOP_NAME = "十二街寫真攝影館";

const SUBJECT: Record<OrderEmailKind, string> = {
  submitted: "已收到您的訂單",
  paid: "已確認收到款項",
  ready: "照片好了，可以來取件囉",
  cancelled: "訂單已取消",
};

const BODY: Record<OrderEmailKind, (o: OrderEmailData) => string[]> = {
  submitted: (o) => [
    "我們已經收到您的訂單，照片製作完成後會再寄信通知您取件。",
    `訂單金額：${formatNtd(o.totalAmount)}`,
    `付款方式：${o.paymentLabel}`,
  ],
  paid: (o) => [`我們已確認收到款項 ${formatNtd(o.totalAmount)}，謝謝您。`],
  ready: (o) => [
    "您的照片已經製作完成，歡迎到店取件。",
    "取件時請告知訂單編號或下單時填的手機號碼。",
    `訂單金額：${formatNtd(o.totalAmount)}（${o.paymentLabel}）`,
  ],
  cancelled: () => [
    "您的訂單已取消。如果這不是您預期的結果，請直接與我們聯絡。",
  ],
};

export function buildOrderEmail(kind: OrderEmailKind, order: OrderEmailData) {
  return {
    subject: `【${SHOP_NAME}】${SUBJECT[kind]}（${order.orderNo}）`,
    text: [
      `${order.contactName} 您好：`,
      "",
      ...BODY[kind](order),
      "",
      `訂單編號：${order.orderNo}`,
      `查看訂單：${order.orderUrl}`,
      "",
      SHOP_NAME,
    ].join("\n"),
  };
}
