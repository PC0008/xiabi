import { expect, test } from "@playwright/test";

const baseUrl = process.env.XIABI_VERIFY_BASE_URL || "https://immortal-sponge-1728.edgespark.app";

test.use({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true
});

test("user H5 call flow reaches confirmation without paid/external calls", async ({ page }) => {
  await page.goto(`${baseUrl}/index.html`, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.goto(`${baseUrl}/index.html`, { waitUntil: "domcontentloaded" });

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

test("product archive can be created, edited, and deleted", async ({ page }) => {
  await page.goto(`${baseUrl}/index.html`, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.goto(`${baseUrl}/index.html`, { waitUntil: "domcontentloaded" });

  await page.locator('[data-action="auth"]').click();
  await page.goto(`${baseUrl}/index.html#memory`, { waitUntil: "domcontentloaded" });

  await expect(page.locator(".memory-title")).toHaveText("我的档案");
  await page.locator('[data-profile-field="name"]').fill("销售表达辅导");
  await page.locator('[data-profile-field="audience"]').fill("正在做私域成交的人");
  await page.locator('[data-profile-field="value"]').fill("把价值讲清楚");
  await page.locator('[data-profile-field="proof"]').fill("客户反馈说更容易约到沟通");
  await page.locator('[data-action="save-product-profile"]').click();

  await expect(page.locator(".profile-row", { hasText: "销售表达辅导" })).toBeVisible();
  await page.locator('[data-action="edit-product-profile"]').first().click();
  await page.locator('[data-profile-field="name"]').fill("私域销售信辅导");
  await page.locator('[data-action="save-product-profile"]').click();

  await expect(page.locator(".profile-row", { hasText: "私域销售信辅导" })).toBeVisible();
  await page.locator('[data-action="delete-product-profile"]').first().click();
  await expect(page.locator(".profile-row", { hasText: "私域销售信辅导" })).toHaveCount(0);
  await expect(page.locator(".empty-title", { hasText: "还没有产品档案" })).toBeVisible();
});
