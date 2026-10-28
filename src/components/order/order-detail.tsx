import { Fragment } from "react";
import { PaymentProofForm } from "@/components/order/payment-proof-form";
import { PAYMENT_LABEL, PaymentDetails } from "@/components/payment-details";
import { formatNtd as fmt } from "@/lib/format";
import {
  ORDER_STATUS_LABEL,
  type OrderStatus,
  orderStatusTone,
  PAYMENT_STATUS_LABEL,
  paymentStatusTone,
} from "@/lib/order-status";
import { loadOrderLines, type OrderRow } from "@/lib/order-view";
import { groupCharges, MIN_CHARGE, printCharges } from "@/lib/pricing";

/** Status, line items, contact and payment info of a submitted order. */
export function OrderDetail({ order }: { order: OrderRow }) {
  // Payment still to be made comes first, right under the status
  const payFirst = awaitsPayment(order);
  return (
    <>
      <StatusSteps status={order.status} />
      {payFirst && <PaymentSection order={order} />}
      <section className="flex flex-wrap gap-2 text-base">
        <span
          className={`rounded-full px-3 py-1 font-medium ${paymentStatusTone(order.paymentStatus)}`}
        >
          付款狀態：{PAYMENT_STATUS_LABEL[order.paymentStatus]}
        </span>
      </section>

      <section className="border-line bg-card grid gap-2 rounded-2xl border p-4">
        <h2 className="text-[17px] font-bold">訂單明細</h2>
        <OrderLines order={order} />
      </section>

      <section className="border-line bg-card grid gap-2 rounded-2xl border p-4 text-base">
        <h2 className="text-[17px] font-bold">聯絡資料</h2>
        <p>
          {order.contactName}・{order.contactPhone}
        </p>
        {order.contactEmail && (
          <p className="break-all">{order.contactEmail}</p>
        )}
        {order.note && (
          <p className="text-muted whitespace-pre-line">備註：{order.note}</p>
        )}
      </section>

      {!payFirst && <PaymentSection order={order} />}
    </>
  );
}

/** A LINE MONEY or bank-transfer order the customer still has to pay. */
export function awaitsPayment(order: OrderRow) {
  return (
    order.paymentMethod !== null &&
    order.paymentMethod !== "cash_on_pickup" &&
    order.paymentStatus !== "paid" &&
    order.status !== "cancelled"
  );
}

/**
 * How to pay, shown only once the order is placed: the LINE friend link or the
 * bank account, then where to send 帳號末五碼 or a transfer screenshot.
 */
function PaymentSection({ order }: { order: OrderRow }) {
  if (!order.paymentMethod) return null;
  const transfer =
    order.paymentMethod === "bank_transfer" && awaitsPayment(order);
  return (
    <section className="border-brand bg-card grid gap-2 rounded-2xl border-2 p-4 text-base">
      <h2 className="text-[17px] font-bold">
        付款方式：{PAYMENT_LABEL[order.paymentMethod]}
      </h2>
      <div className="bg-subtle grid gap-4 rounded-xl p-4">
        {order.paymentStatus === "paid" ? (
          <p>店家已確認收款，謝謝！</p>
        ) : (
          <>
            {awaitsPayment(order) && (
              <p>
                應付金額{" "}
                <span className="text-[26px] font-bold tabular-nums">
                  {fmt(order.totalAmount)}
                </span>
              </p>
            )}
            <PaymentDetails method={order.paymentMethod} />
            {order.paymentMethod === "line_money" && awaitsPayment(order) && (
              <p>
                付款時請告訴店家訂單編號{" "}
                <span className="font-mono font-bold">{order.orderNo}</span>
              </p>
            )}
          </>
        )}
        {transfer && (
          <>
            <div className="bg-line h-px" />
            <PaymentProofForm
              orderId={order.id}
              sent={
                order.paymentStatus === "pending_review"
                  ? {
                      bankLast5: order.bankLast5,
                      hasProof: !!order.transferProofKey,
                    }
                  : null
              }
            />
          </>
        )}
      </div>
    </section>
  );
}

/**
 * Line items with lamination, minimum charges, ID photos and custom work.
 * Customers never see a separate top-up: it goes into the first size that has
 * prints (or laminated prints), marked 含最低收費. `showTopUp` lists it on its
 * own row for the shop instead.
 */
export async function OrderLines({
  order,
  showTopUp = false,
}: {
  order: OrderRow;
  showTopUp?: boolean;
}) {
  const { groups, items, customPhotoCount } = await loadOrderLines(order.id);
  const priced = groups.map((g) => ({
    unitPrice: g.unitPrice ?? 0,
    laminationUnitPrice: g.laminationUnitPrice,
    laminatedPrints: g.laminatedPrints,
    quantities: [g.prints],
  }));
  const charged = new Map(
    groups.map((g, i) => [g.id, groupCharges(priced[i])]),
  );
  const totals = printCharges(priced);
  const printingTopUpAt = showTopUp
    ? -1
    : groups.findIndex((g) => g.prints > 0);
  const laminationTopUpAt = showTopUp
    ? -1
    : groups.findIndex(
        (g) => g.laminationUnitPrice !== null && g.laminatedPrints > 0,
      );

  return (
    <table className="w-full text-base">
      <tbody>
        {groups.map((g, i) => {
          const unitPrice = g.unitPrice ?? 0;
          const c = charged.get(g.id)!;
          const printingTopUp =
            i === printingTopUpAt ? totals.printingTopUp : 0;
          const laminationTopUp =
            i === laminationTopUpAt ? totals.laminationTopUp : 0;
          return (
            <Fragment key={g.id}>
              <tr className="border-line border-b">
                <td className="py-2">{g.label}</td>
                <td className="text-muted py-2">
                  {g.photoCount} 張照片，共印 {g.prints} 張 × {fmt(unitPrice)}
                  {printingTopUp > 0 && "・含最低收費"}
                </td>
                <td className="py-2 text-right">
                  {fmt(c.printing + printingTopUp)}
                </td>
              </tr>
              {g.laminationUnitPrice !== null && (
                <tr className="border-line border-b">
                  <td className="py-2 pl-4">護貝</td>
                  <td className="text-muted py-2">
                    {g.laminatedPrints} 張 × {fmt(g.laminationUnitPrice)}
                    {laminationTopUp > 0 && "・含最低收費"}
                  </td>
                  <td className="py-2 text-right">
                    {fmt(c.lamination + laminationTopUp)}
                  </td>
                </tr>
              )}
            </Fragment>
          );
        })}
        {showTopUp && totals.printingTopUp > 0 && (
          <MinimumRow what="洗照片" amount={totals.printingTopUp} />
        )}
        {showTopUp && totals.laminationTopUp > 0 && (
          <MinimumRow what="護貝" amount={totals.laminationTopUp} />
        )}
        {items.map((i) => {
          // 證件照：其他 is priced by the shop afterwards
          const quoted = !!i.photoId && i.unitPrice === 0;
          return (
            <Fragment key={i.id}>
              <tr className="border-line border-b">
                <td className="py-2">{i.name}</td>
                <td className="text-muted py-2">
                  {i.quantity} {i.photoId ? "組" : "個"}
                  {!quoted && ` × ${fmt(i.unitPrice)}`}
                </td>
                <td className={`py-2 text-right ${quoted ? "text-muted" : ""}`}>
                  {quoted ? "價格另議" : fmt(i.unitPrice * i.quantity)}
                </td>
              </tr>
              {i.backgroundRemovalPrice != null && (
                <tr className="border-line border-b">
                  <td className="py-2 pl-4">去背</td>
                  <td className="text-muted py-2">1 張</td>
                  <td className="py-2 text-right">
                    {fmt(i.backgroundRemovalPrice)}
                  </td>
                </tr>
              )}
            </Fragment>
          );
        })}
        {(customPhotoCount > 0 || order.customNote) && (
          <tr className="border-line border-b">
            <td className="py-2">客製化製作</td>
            <td className="text-muted py-2">
              {customPhotoCount} 張照片
              {order.customNote && (
                <p className="whitespace-pre-line">{order.customNote}</p>
              )}
            </td>
            <td className="text-muted py-2 text-right">另行報價</td>
          </tr>
        )}
      </tbody>
      <tfoot>
        <tr className="font-bold">
          <td className="pt-3" colSpan={2}>
            總計
          </td>
          <td className="pt-3 text-right text-xl">{fmt(order.totalAmount)}</td>
        </tr>
      </tfoot>
    </table>
  );
}

/** 低消 top-up across all sizes of the order. */
function MinimumRow({ what, amount }: { what: string; amount: number }) {
  return (
    <tr className="border-line border-b">
      <td className="py-2">低消補差額</td>
      <td className="text-muted py-2">
        {what}合計未滿 {fmt(MIN_CHARGE)}
      </td>
      <td className="py-2 text-right">{fmt(amount)}</td>
    </tr>
  );
}

const STEPS: OrderStatus[] = ["submitted", "printing", "ready"];

/** 已送出 → 製作中 → 可取件; cancelled / picked-up orders show a badge instead. */
function StatusSteps({ status }: { status: OrderStatus }) {
  const current = STEPS.indexOf(status);
  if (current < 0) {
    return (
      <p
        className={`w-fit rounded-full px-3 py-1 text-base font-medium ${orderStatusTone(status)}`}
      >
        訂單狀態：{ORDER_STATUS_LABEL[status]}
      </p>
    );
  }
  return (
    <section
      aria-label={`訂單狀態：${ORDER_STATUS_LABEL[status]}`}
      className="border-line bg-card rounded-2xl border p-4"
    >
      <ol className="grid grid-cols-3 gap-1 text-center">
        {STEPS.map((s, i) => (
          <li key={s} className="grid justify-items-center gap-1.5">
            <span
              className={`grid size-8 place-items-center rounded-full text-[15px] font-bold ${
                i <= current ? "bg-brand text-white" : "bg-subtle text-muted"
              }`}
            >
              {i + 1}
            </span>
            <span
              className={`text-[15px] ${i <= current ? "font-bold" : "text-muted"}`}
              aria-current={i === current ? "step" : undefined}
            >
              {ORDER_STATUS_LABEL[s]}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
