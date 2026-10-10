import { describe, expect, it } from "vitest";
import { ORDER_STATUS_LABEL, PAYMENT_STATUS_LABEL } from "./order-status";

describe("status labels", () => {
  it("labels order statuses in Chinese", () => {
    expect(ORDER_STATUS_LABEL).toMatchObject({
      submitted: "已送出",
      printing: "製作中",
      ready: "可取件",
      picked_up: "已取件",
      cancelled: "已取消",
    });
  });

  it("labels payment statuses in Chinese", () => {
    expect(PAYMENT_STATUS_LABEL).toEqual({
      unpaid: "未付款",
      pending_review: "待確認",
      paid: "已付款",
    });
  });
});
