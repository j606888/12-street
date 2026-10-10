import { expect, test, type Page } from "@playwright/test";
import { FIXTURES, startOrderWithPhotos } from "./helpers/order";
import { cleanupE2eData } from "./helpers/cleanup";
import { trackDraftCookie } from "./helpers/state";

async function expectNoHorizontalOverflow(page: Page) {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(innerWidth);
}

test.afterAll(async () => {
  await cleanupE2eData({ includeAdminUser: false }).catch(() => {});
});

test("phone layout has no horizontal overflow", async ({ page }) => {
  await startOrderWithPhotos(page, [FIXTURES[0]]);
  await trackDraftCookie(page.context());
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: "test-results/mobile-order-top.png" });
  await page.screenshot({
    path: "test-results/mobile-order-full.png",
    fullPage: true,
  });

  await page.goto("/orders/lookup");
  await expect(page.getByRole("heading", { name: "查詢訂單" })).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.goto("/this-page-does-not-exist");
  await expect(
    page.getByRole("heading", { name: "找不到這個頁面" }),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);
});
