import { after } from "next/server";
import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  buildOrderReceivedText,
  isLineSignatureValid,
  parseOrderNo,
} from "@/lib/line-webhook";
import { account, orders } from "@/db/schema";

type LineEvent = {
  type: string;
  mode?: string;
  replyToken?: string;
  source?: { type: string; userId?: string };
  message?: { type: string; text?: string };
};

// Webhook of the shop's LINE Official Account (LINE Developers → Messaging API
// channel → Webhook URL). Answers the order message LIFF posts for the customer
// with a reply, which doesn't count toward the account's monthly message quota.
export async function POST(request: Request) {
  const body = Buffer.from(await request.arrayBuffer());
  if (
    !isLineSignatureValid(
      body,
      request.headers.get("x-line-signature"),
      process.env.LINE_MESSAGING_CHANNEL_SECRET,
    )
  ) {
    return new Response("Unauthorized", { status: 401 });
  }
  const { events = [] } = JSON.parse(body.toString("utf8")) as {
    events?: LineEvent[];
  };
  // Answer LINE right away; reply tokens stay valid long enough for after()
  after(() => Promise.all(events.map(replyToOrderMessage)));
  return new Response(null);
}

async function replyToOrderMessage(event: LineEvent) {
  try {
    if (event.type !== "message" || event.mode === "standby") return;
    const lineUserId =
      event.source?.type === "user" ? event.source.userId : undefined;
    const orderNo =
      event.message?.type === "text"
        ? parseOrderNo(event.message.text ?? "")
        : null;
    if (!lineUserId || !orderNo || !event.replyToken) return;

    // Only the member who placed the order gets a reply; the LINE Login channel
    // shares a provider with the official account, so the user IDs match
    const [order] = await db
      .select({ id: orders.id })
      .from(orders)
      .innerJoin(
        account,
        and(eq(account.userId, orders.userId), eq(account.providerId, "line")),
      )
      .where(
        and(
          eq(orders.orderNo, orderNo),
          isNotNull(orders.submittedAt),
          eq(account.accountId, lineUserId),
        ),
      )
      .limit(1);
    if (!order) return;

    const token = process.env.LINE_MESSAGING_ACCESS_TOKEN;
    if (!token) {
      console.error("line reply", orderNo, "LINE_MESSAGING_ACCESS_TOKEN unset");
      return;
    }
    const res = await fetch("https://api.line.me/v2/bot/message/reply", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        replyToken: event.replyToken,
        messages: [{ type: "text", text: buildOrderReceivedText(orderNo) }],
      }),
    });
    if (!res.ok)
      console.error("line reply", orderNo, res.status, await res.text());
  } catch (err) {
    console.error("line reply", err);
  }
}
