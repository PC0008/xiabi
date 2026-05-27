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

test("call page falls back to typing when browser speech and server ASR are unavailable", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "SpeechRecognition", { value: undefined, configurable: true });
    Object.defineProperty(window, "webkitSpeechRecognition", { value: undefined, configurable: true });
  });
  await page.route("**/api/public/config", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        data: {
          homeConfig: {},
          pricing: {},
          guideStages: [],
          system: { voice_enabled: true, sms_enabled: true, file_export_enabled: true, generation_enabled: true },
          capabilities: {
            voice: {
              ttsConfigured: true,
              asrConfigured: false,
              asrVerified: false,
              asrPreferred: false
            }
          },
          versions: {}
        }
      })
    });
  });

  await page.goto(`${baseUrl}/index.html`, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.goto(`${baseUrl}/index.html`, { waitUntil: "domcontentloaded" });

  await page.locator('[data-action="auth"]').click();
  await page.locator('[data-action="start-call"]').click();

  await expect(page.locator(".question-card")).toBeVisible();
  await expect(page.locator("#typedText")).toBeVisible();
  await expect(page.locator('[data-action="voice-answer"]')).toHaveCount(0);
  await expect(page.locator('[data-action="voice-mode"]')).toHaveCount(0);
});

test("call page records to server ASR when browser speech start fails", async ({ page }) => {
  let transcribeCalled = false;
  await page.addInitScript(() => {
    class BrokenSpeechRecognition {
      start() {
        throw new Error("speech unavailable");
      }
      stop() {}
    }
    Object.defineProperty(window, "SpeechRecognition", { value: BrokenSpeechRecognition, configurable: true });
    Object.defineProperty(window, "webkitSpeechRecognition", { value: undefined, configurable: true });
    Object.defineProperty(navigator, "mediaDevices", {
      value: {
        getUserMedia: async () => ({
          getTracks: () => [{ stop() {} }]
        })
      },
      configurable: true
    });
    class FakeMediaRecorder {
      constructor() {
        this.mimeType = "audio/webm";
        this.state = "inactive";
      }
      start() {
        this.state = "recording";
        setTimeout(() => {
          this.ondataavailable?.({ data: new Blob(["fake audio"], { type: "audio/webm" }) });
        }, 0);
      }
      stop() {
        this.state = "inactive";
        this.onstop?.();
      }
    }
    Object.defineProperty(window, "MediaRecorder", { value: FakeMediaRecorder, configurable: true });
  });
  await page.route("**/api/public/config", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        data: {
          homeConfig: {},
          pricing: {},
          guideStages: [],
          system: { voice_enabled: true, sms_enabled: true, file_export_enabled: true, generation_enabled: true },
          capabilities: {
            voice: {
              ttsConfigured: true,
              asrConfigured: true,
              asrVerified: true,
              asrPreferred: false
            }
          },
          versions: {}
        }
      })
    });
  });
  await page.route("**/api/public/voice/transcribe", async (route) => {
    const body = route.request().postDataJSON();
    transcribeCalled = !!body.audioBase64 && body.mimeType === "audio/webm";
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        data: {
          configured: true,
          transcript: "voice fallback answer"
        }
      })
    });
  });

  await page.goto(`${baseUrl}/index.html`, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.goto(`${baseUrl}/index.html`, { waitUntil: "domcontentloaded" });

  await page.locator('[data-action="auth"]').click();
  await page.locator('[data-action="start-call"]').click();
  await expect(page.locator(".question-card")).toBeVisible();
  const voiceButton = page.locator('[data-action="voice-answer"]');
  await expect(voiceButton).toBeVisible();
  await voiceButton.dispatchEvent("pointerdown", { pointerType: "touch" });
  await page.waitForTimeout(50);
  await voiceButton.dispatchEvent("pointerup", { pointerType: "touch" });
  await expect.poll(() => transcribeCalled).toBe(true);
});
