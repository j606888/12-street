import { describe, expect, it } from "vitest";
import { buildOrderEmail } from "./order-email";

const order = {
  orderNo: "P20261012-0001",
  contactName: "王小明",
  totalAmount: 1200,
  paymentLabel: "銀行轉帳",
  orderUrl: "https://example.com/orders/lookup",
};

describe("buildOrderEmail", () => {
  it("puts the order number in the subject", () => {
    expect(buildOrderEmail("ready", order).subject).toBe(
      "【十二街影像生活館】照片好了，可以來取件囉（P20261012-0001）",
    );
  });

  it("greets the customer and links to the order", () => {
    const { text } = buildOrderEmail("submitted", order);
    expect(text).toContain("王小明 您好：");
    expect(text).toContain("訂單金額：NT$ 1,200");
    expect(text).toContain("查看訂單：https://example.com/orders/lookup");
  });
});
