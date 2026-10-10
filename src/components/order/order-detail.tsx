import { Fragment } from "react";
import { PAYMENT_LABEL, PaymentDetails } from "@/components/payment-details";
import { formatNtd as fmt } from "@/lib/format";
import {
  ORDER_STATUS_LABEL,
  orderStatusTone,
  PAYMENT_STATUS_LABEL,
  paymentStatusTone,
} from "@/lib/order-status";
import { loadOrderLines, type OrderRow } from "@/lib/order-view";
import { groupCharges } from "@/lib/pricing";

/** Status, line items, contact and payment info of a submitted order. */
export async function OrderDetail({ order }: { order: OrderRow }) {
  const { groups, items, customPhotoCount } = await loadOrderLines(order.id);

  return (
    <>
      <section className="flex flex-wrap gap-2 text-sm">
        <span
          className={`rounded-full px-3 py-1 font-medium ${orderStatusTone(order.status)}`}
        >
          訂單狀態：{ORDER_STATUS_LABEL[order.status]}
        </span>
        <span
          className={`rounded-full px-3 py-1 font-medium ${paymentStatusTone(order.paymentStatus)}`}
        >
          付款狀態：{PAYMENT_STATUS_LABEL[order.paymentStatus]}
        </span>
      </section>

      <section className="grid gap-2">
        <h2 className="text-lg font-bold">訂單明細</h2>
        <table className="w-full text-sm">
          <tbody>
            {groups.map((g) => {
              const unitPrice = g.unitPrice ?? 0;
              const c = groupCharges({
                unitPrice,
                laminationUnitPrice: g.laminationUnitPrice,
                quantities: [g.prints],
              });
              return (
                <Fragment key={g.id}>
                  <tr className="border-b">
                    <td className="py-2">{g.label}</td>
                    <td className="py-2 text-neutral-600">
                      {g.photoCount} 張照片，共印 {g.prints} 張 ×{" "}
                      {fmt(unitPrice)}
                      {c.printing > unitPrice * g.prints && "（未滿低消）"}
                    </td>
                    <td className="py-2 text-right">{fmt(c.printing)}</td>
                  </tr>
                  {g.laminationUnitPrice !== null && (
                    <tr className="border-b">
                      <td className="py-2 pl-4">護貝</td>
                      <td className="py-2 text-neutral-600">
                        {g.prints} 張 × {fmt(g.laminationUnitPrice)}
                        {c.lamination > g.laminationUnitPrice * g.prints &&
                          "（未滿低消）"}
                      </td>
                      <td className="py-2 text-right">{fmt(c.lamination)}</td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {items.map((i) => (
              <tr key={i.id} className="border-b">
                <td className="py-2">{i.name}</td>
                <td className="py-2 text-neutral-600">
                  {i.quantity} {i.photoId ? "組" : "個"} × {fmt(i.unitPrice)}
                </td>
                <td className="py-2 text-right">
                  {fmt(i.unitPrice * i.quantity)}
                </td>
              </tr>
            ))}
            {(customPhotoCount > 0 || order.customNote) && (
              <tr className="border-b">
                <td className="py-2">客製化製作</td>
                <td className="py-2 text-neutral-600">
                  {customPhotoCount} 張照片
                  {order.customNote && (
                    <p className="whitespace-pre-line">{order.customNote}</p>
                  )}
                </td>
                <td className="py-2 text-right text-neutral-600">另行報價</td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr className="font-bold">
              <td className="pt-3" colSpan={2}>
                總計
              </td>
              <td className="pt-3 text-right text-lg">
                {fmt(order.totalAmount)}
              </td>
            </tr>
          </tfoot>
        </table>
      </section>

      <section className="grid gap-2 text-sm">
        <h2 className="text-lg font-bold">聯絡資料</h2>
        <p>
          {order.contactName}・{order.contactPhone}
        </p>
        {order.note && (
          <p className="whitespace-pre-line text-neutral-600">
            備註：{order.note}
          </p>
        )}
      </section>

      {order.paymentMethod && (
        <section className="grid gap-2 text-sm">
          <h2 className="text-lg font-bold">
            付款方式：{PAYMENT_LABEL[order.paymentMethod]}
          </h2>
          <div className="rounded-lg bg-neutral-50 p-4">
            {order.paymentStatus === "paid" ? (
              <p>店家已確認收款，謝謝！</p>
            ) : (
              <PaymentDetails method={order.paymentMethod} />
            )}
            {order.paymentStatus === "pending_review" && (
              <p className="mt-3 text-amber-800">
                付款待確認：已收到
                {order.bankLast5 && (
                  <>
                    帳號末五碼{" "}
                    <span className="font-mono">{order.bankLast5}</span>
                  </>
                )}
                {order.bankLast5 && order.transferProofKey && "及"}
                {order.transferProofKey && "轉帳截圖"}
                ，店家確認入帳後會開始製作。
              </p>
            )}
          </div>
        </section>
      )}
    </>
  );
}
