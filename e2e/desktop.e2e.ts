import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import { FIXTURES, startOrderWithPhotos } from "./helpers/order";
import {
  ADMIN_STORAGE_STATE,
  NONEXISTENT_ORDER_NO,
  TEST_PREFIX,
  trackDraftCookie,
  trackOrder,
} from "./helpers/state";
import { cleanupE2eData } from "./helpers/cleanup";

const PHONE = "0900123456";
const NOT_FOUND = "查無訂單，請確認訂單編號和手機";

// One order flows through guest → admin → guest again, so run in order
test.describe.configure({ mode: "serial" });

let orderNo = "";
let orderId = "";
let lookupContext: BrowserContext;
let lookupPage: Page;

async function lookup(page: Page, no: string, phone: string) {
  await page.goto("/orders/lookup");
  await page.getByLabel("訂單編號").fill(no);
  await page.getByLabel("手機號碼").fill(phone);
  await page.getByRole("button", { name: "查詢" }).click();
}

async function newGuestContext(browser: Browser) {
  return browser.newContext(); // no cookies, no storage state
}

test.afterAll(async () => {
  await lookupContext?.close();
  // Best effort; global teardown repeats this (and removes the admin user)
  await cleanupE2eData({ includeAdminUser: false }).catch(() => {});
});

test("guest places an order and looks it up from a fresh browser", async ({
  page,
  browser,
}) => {
  await startOrderWithPhotos(page, FIXTURES);
  await trackDraftCookie(page.context());
  await page.getByRole("button", { name: "下一步" }).click();

  await page.getByLabel(/姓名/).fill("[E2E] 訪客");
  await page.getByLabel(/手機/).fill(PHONE);
  await page.getByLabel("取件時付現金").check();
  await page.getByRole("button", { name: "送出訂單" }).click();

  await page.waitForURL(/\/order\/complete\?id=/);
  orderId = new URL(page.url()).searchParams.get("id")!;
  trackOrder(orderId);
  const no =
    (await page.locator("p.font-mono").first().textContent())?.trim() ?? "";
  expect(no).toMatch(/^P\d{8}-\d{4}$/);
  orderNo = no;
  trackOrder(orderId, orderNo);
  await expect(
    page.getByRole("heading", { name: "謝謝！訂單收到了" }),
  ).toBeVisible();

  // Fresh browser: wrong phone / nonexistent number give the same generic error
  lookupContext = await newGuestContext(browser);
  lookupPage = await lookupContext.newPage();
  await lookup(lookupPage, orderNo, "0911111111");
  await expect(lookupPage.locator("form [role=alert]")).toHaveText(NOT_FOUND);
  await lookup(lookupPage, NONEXISTENT_ORDER_NO, PHONE);
  await expect(lookupPage.locator("form [role=alert]")).toHaveText(NOT_FOUND);

  // Correct number + phone typed with dashes
  await lookup(lookupPage, orderNo, "0900-123-456");
  await lookupPage.waitForURL(/\/orders\/[0-9a-f-]{36}$/);
  expect(lookupPage.url()).toContain(orderId);
  await expect(
    lookupPage.getByRole("heading", { name: orderNo }),
  ).toBeVisible();
  await expect(lookupPage.getByText("[E2E] 訪客")).toBeVisible();
  await expect(lookupPage.getByLabel("訂單狀態：已送出")).toBeVisible();
  await expect(lookupPage.getByText("付款方式：取件時付現金")).toBeVisible();
});

test("admin finds the order, updates statuses, downloads the ZIP and deletes photos", async ({
  browser,
}) => {
  test.skip(!orderNo, "needs the order from the previous test");
  const ctx = await browser.newContext({ storageState: ADMIN_STORAGE_STATE });
  try {
    // Stub the File System Access API so the ZIP is collected in memory
    await ctx.addInitScript(() => {
      const w = window as unknown as Record<string, unknown>;
      w.__zipChunks = [] as Uint8Array[];
      w.__zipClosed = false;
      w.showSaveFilePicker = async () => ({
        createWritable: async () =>
          new WritableStream<Uint8Array>({
            write(chunk) {
              (w.__zipChunks as Uint8Array[]).push(chunk);
            },
            close() {
              w.__zipClosed = true;
            },
          }),
      });
    });
    const page = await ctx.newPage();

    // A search covers every tab; the row's "next step" button moves it along
    await page.goto("/admin/orders");
    await page.getByLabel("搜尋").fill(orderNo);
    await page.getByRole("button", { name: "篩選" }).click();
    const row = page.getByRole("row", { name: new RegExp(orderNo) });
    await expect(row.getByText("已送出")).toBeVisible();
    // Cash on pickup: starting production doesn't ask about the payment
    await row.getByRole("button", { name: "開始製作" }).click();
    await expect(row.getByText("製作中")).toBeVisible();

    await row.getByRole("link", { name: orderNo }).click();
    await page.waitForURL(`**/admin/orders/${orderId}`);
    await expect(page.getByRole("heading", { name: orderNo })).toBeVisible();

    await page.getByRole("button", { name: "標記已付款" }).click();
    await expect(page.getByRole("button", { name: "復原" })).toBeVisible();
    await page.getByRole("button", { name: "標記可取件" }).click();
    await expect(
      page.getByRole("button", { name: "客人已取件" }),
    ).toBeVisible();

    await page.reload();
    await expect(page.getByText(/已確認收款：/)).toBeVisible();
    await expect(
      page.getByRole("button", { name: "客人已取件" }),
    ).toBeVisible();

    // Customer side sees the new statuses
    await lookupPage.reload();
    await expect(lookupPage.getByLabel("訂單狀態：可取件")).toBeVisible();
    await expect(lookupPage.getByText("付款狀態：已付款")).toBeVisible();

    // ZIP: stream through the stubbed save picker, then read the central directory
    await page.getByRole("button", { name: "下載照片 ZIP" }).click();
    await page.waitForFunction(
      () => (window as unknown as { __zipClosed: boolean }).__zipClosed,
    );
    const names = await page.evaluate(() => {
      const chunks = (window as unknown as { __zipChunks: Uint8Array[] })
        .__zipChunks;
      const total = chunks.reduce((n, c) => n + c.length, 0);
      const buf = new Uint8Array(total);
      let off = 0;
      for (const c of chunks) {
        buf.set(c, off);
        off += c.length;
      }
      const view = new DataView(buf.buffer);
      const out: string[] = [];
      for (let i = 0; i + 46 <= buf.length; i++) {
        if (view.getUint32(i, true) === 0x02014b50) {
          const nameLen = view.getUint16(i + 28, true);
          out.push(
            new TextDecoder().decode(buf.subarray(i + 46, i + 46 + nameLen)),
          );
        }
      }
      return out;
    });
    expect(names).toHaveLength(2);
    for (const n of names) {
      expect(n.startsWith("01_")).toBe(true);
      expect(n.endsWith("_1張.jpg")).toBe(true);
    }

    // Two-step delete hits real R2
    await page.getByRole("button", { name: "刪除照片" }).click();
    await page.getByRole("button", { name: "確定刪除" }).click();
    // The "已刪除 2 張照片" toast is unmounted by the page refresh before it can be
    // asserted reliably (reported as a UX quirk), so assert the resulting state.
    await expect(page.getByText("照片已刪除。")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "照片（0 張，0 B）" }),
    ).toBeVisible();
  } finally {
    await ctx.close();
  }
});

test("admin adds a free-text tag next to a member's name and removes it", async ({
  browser,
}) => {
  const ctx = await browser.newContext({ storageState: ADMIN_STORAGE_STATE });
  const tag = `${TEST_PREFIX} 常客`;
  try {
    const page = await ctx.newPage();
    await page.goto(`/admin/members?q=${encodeURIComponent(TEST_PREFIX)}`);
    const row = page
      .getByRole("row")
      .filter({ hasText: `${TEST_PREFIX} Admin` });

    await row.getByRole("button", { name: "＋ 標籤" }).click();
    await row.getByLabel("新增標籤").fill(tag);
    await row.getByLabel("新增標籤").press("Enter");
    const remove = row.getByRole("button", { name: `移除標籤 ${tag}` });
    await expect(remove).toBeEnabled();

    // Saved: still there after a reload, and offered as a filter
    await page.reload();
    await expect(remove).toBeVisible();
    await expect(page.getByRole("link", { name: tag })).toBeVisible();

    // Removing the last use drops the tag altogether
    await remove.click();
    await expect(remove).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole("link", { name: tag })).toHaveCount(0);
  } finally {
    await ctx.close();
  }
});

test("visitors without a session are sent to /login from /admin", async ({
  browser,
}) => {
  const ctx = await newGuestContext(browser);
  try {
    const page = await ctx.newPage();
    await page.goto("/admin/orders");
    await page.waitForURL(/\/login/);
    expect(new URL(page.url()).pathname).toBe("/login");
  } finally {
    await ctx.close();
  }
});
