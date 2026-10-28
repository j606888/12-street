import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  buildOrderReceivedText,
  isLineSignatureValid,
  parseOrderNo,
} from "./line-webhook";

const secret = "channel-secret-for-tests";
const body = Buffer.from(JSON.stringify({ destination: "U1", events: [] }));
const sign = (b: Buffer, s = secret) =>
  createHmac("sha256", s).update(b).digest("base64");

describe("isLineSignatureValid", () => {
  it("accepts the body signed with the channel secret", () => {
    expect(isLineSignatureValid(body, sign(body), secret)).toBe(true);
  });

  it("rejects a tampered body or another secret", () => {
    expect(
      isLineSignatureValid(Buffer.from(`${body} `), sign(body), secret),
    ).toBe(false);
    expect(isLineSignatureValid(body, sign(body, "other"), secret)).toBe(false);
    expect(isLineSignatureValid(body, "not-base64!", secret)).toBe(false);
  });

  it("rejects everything without a signature or secret", () => {
    expect(isLineSignatureValid(body, null, secret)).toBe(false);
    expect(isLineSignatureValid(body, sign(body), undefined)).toBe(false);
    expect(isLineSignatureValid(body, sign(body), "")).toBe(false);
  });
});

describe("parseOrderNo", () => {
  it("finds the order number in the LIFF order message", () => {
    expect(
      parseOrderNo(
        "訂單成立\n訂單編號：P20261028-0001\n金額：NT$ 120\n付款方式：銀行轉帳",
      ),
    ).toBe("P20261028-0001");
    expect(parseOrderNo("訂單編號: P20261028-12345")).toBe("P20261028-12345");
  });

  it("ignores other messages", () => {
    expect(parseOrderNo("營業時間")).toBeNull();
    expect(parseOrderNo("P20261028-0001")).toBeNull();
    expect(parseOrderNo("訂單編號：P2026-0001")).toBeNull();
  });
});

describe("buildOrderReceivedText", () => {
  it("names the order", () => {
    expect(buildOrderReceivedText("P20261028-0001")).toBe(
      "收到訂單了！\n訂單編號：P20261028-0001",
    );
  });
});
