import path from "node:path";
import { expect, type Page } from "@playwright/test";

export const FIXTURES = [1, 2].map((n) =>
  path.join(process.cwd(), "e2e", "fixtures", `e2e-photo-${n}.jpg`),
);

/** Opens /order, picks a size for the first print group and uploads fixtures into it. */
export async function startOrderWithPhotos(page: Page, files: string[]) {
  await page.goto("/order");
  const group = page.getByRole("combobox", { name: /第 1 組 尺寸/ });
  await expect(group).toBeVisible();
  // Pick a non-default size when there is one
  if ((await group.locator("option").count()) > 1) {
    await group.selectOption({ index: 1 });
  }
  // The first file input belongs to the first print group (hidden, JPG only)
  await page
    .locator('input[type="file"][accept*="jpeg"]')
    .first()
    .setInputFiles(files);
  await expect(
    page.getByText(`已上傳 ${files.length}／${files.length} 張`),
  ).toBeVisible();
}
