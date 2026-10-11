import path from "node:path";
import { expect, type Page } from "@playwright/test";

export const FIXTURES = [1, 2].map((n) =>
  path.join(process.cwd(), "e2e", "fixtures", `e2e-photo-${n}.jpg`),
);

/**
 * Opens /order, starts a print group with a size button and uploads fixtures
 * into it; leaves the page on that group's screen.
 */
export async function startOrderWithPhotos(page: Page, files: string[]) {
  await page.goto("/order");
  // Size buttons read "4×6 $6 護貝 +$5"; pick the second one (a non-default size)
  const sizes = page.getByRole("button", { name: /護貝 \+\$/ });
  await expect(sizes.first()).toBeVisible();
  await sizes.nth((await sizes.count()) > 1 ? 1 : 0).click();
  await expect(
    page.getByRole("heading", { name: "第 1 組照片" }),
  ).toBeVisible();
  // The group's file input (hidden, JPG only)
  await page
    .locator('input[type="file"][accept*="jpeg"]')
    .first()
    .setInputFiles(files);
  // The counter reads "已上傳 x／n" while uploading and "共 n 張" once all are done
  await expect(
    page.getByRole("heading", { name: `已選 ${files.length} 張照片` }),
  ).toBeVisible();
  await expect(
    page.getByText(`共 ${files.length} 張`, { exact: true }),
  ).toBeVisible();
}
