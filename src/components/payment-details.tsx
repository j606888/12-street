// Payment instructions shown at checkout and on the order-complete page.

export type PaymentMethod = "cash_on_pickup" | "line_money" | "bank_transfer";

export const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  cash_on_pickup: "取貨付款",
  line_money: "LINE MONEY",
  bank_transfer: "銀行轉帳",
};

const linePayId = process.env.NEXT_PUBLIC_LINE_PAY_ID;
const linePayUrl = process.env.NEXT_PUBLIC_LINE_PAY_URL;
const bankAccount = process.env.NEXT_PUBLIC_BANK_ACCOUNT;
const NOT_SET = "（店家尚未設定，請洽店家）";

export function PaymentDetails({ method }: { method: PaymentMethod }) {
  if (method === "cash_on_pickup") {
    return <p>到店取件時付款即可。</p>;
  }
  if (method === "line_money") {
    return (
      <div className="grid gap-1">
        <p>請加店家 LINE 好友，用 LINE MONEY 轉帳付款。</p>
        <p>
          LINE ID：<span className="font-mono">{linePayId || NOT_SET}</span>
        </p>
        {linePayUrl && (
          <a
            href={linePayUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-fit rounded-md bg-[#06C755] px-3 py-1.5 font-medium text-white"
          >
            加入 LINE 好友
          </a>
        )}
      </div>
    );
  }
  return (
    <div className="grid gap-1">
      <p>請轉帳到以下帳戶：</p>
      <p className="font-mono whitespace-pre-line">{bankAccount || NOT_SET}</p>
    </div>
  );
}
