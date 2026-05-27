import { expect, test } from "@playwright/test";

const baseUrl = process.env.XIABI_VERIFY_BASE_URL || "https://immortal-sponge-1728.edgespark.app";

test.use({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true
});

test("user H5 call flow reaches confirmation without paid/external calls", async ({ page }) => {
  await page.goto(`${baseUrl}/index.html`, { waitUntil: "networkidle" });
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.goto(`${baseUrl}/index.html`, { waitUntil: "networkidle" });

  await expect(page.locator('[data-action="auth"]')).toBeVisible();
  await page.locator('[data-action="auth"]').click();

  const startCall = page.locator('[data-action="start-call"]');
  await expect(startCall).toBeVisible();
  await expect(startCall).toBeEnabled();
  await startCall.click();

  await expect(page.locator(".question-card")).toBeVisible();
  await expect(page.locator(".quick-option").first()).toBeVisible();

  for (let index = 0; index < 8; index += 1) {
    if (await page.locator('[data-go="confirm"]').isVisible()) break;
    const skip = page.locator('[data-action="skip-question"]');
    if (await skip.isVisible()) {
      await skip.click();
    } else {
      await page.locator(".quick-option").first().click();
    }
    await page.waitForTimeout(150);
  }

  await expect(page.locator('[data-go="confirm"]')).toBeVisible();
  await page.locator('[data-go="confirm"]').click();
  await expect(page.locator('[data-action="generate"]')).toBeVisible();
  await expect(page.locator(".summary-card")).toBeVisible();
});
