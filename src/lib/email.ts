import "server-only";
import { eq } from "drizzle-orm";
import { Resend } from "resend";
import { PAYMENT_LABEL } from "@/components/payment-details";
import { db } from "@/lib/db";
import { buildOrderEmail, type OrderEmailKind } from "@/lib/order-email";
import { orders } from "@/db/schema";

/**
 * Emails the customer about their order. Does nothing when the order has no
 * email or sending isn't configured, and never throws: a failed email must
 * not fail the order action that triggered it.
 */
export async function sendOrderEmail(orderId: string, kind: OrderEmailKind) {
  try {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.EMAIL_FROM;
    if (!apiKey || !from) return;

    const [order] = await db
      .select()
      .from(orders)
      .where(eq(orders.id, orderId));
    if (!order?.contactEmail || !order.orderNo || !order.paymentMethod) return;

    const base = process.env.BETTER_AUTH_URL ?? "";
    const { subject, text } = buildOrderEmail(kind, {
      orderNo: order.orderNo,
      contactName: order.contactName ?? "",
      totalAmount: order.totalAmount,
      paymentLabel: PAYMENT_LABEL[order.paymentMethod],
      orderUrl: `${base}${order.userId ? "/orders/mine" : "/orders/lookup"}`,
    });
    const { error } = await new Resend(apiKey).emails.send({
      from,
      to: order.contactEmail,
      replyTo: process.env.EMAIL_REPLY_TO || undefined,
      subject,
      text,
    });
    if (error) console.error("order email", kind, order.orderNo, error);
  } catch (err) {
    console.error("order email", kind, orderId, err);
  }
}
