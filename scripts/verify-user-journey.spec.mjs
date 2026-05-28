import { expect, test } from "@playwright/test";

const baseUrl = process.env.XIABI_VERIFY_BASE_URL || "https://immortal-sponge-1728.edgespark.app";
const liveUiTimeout = 15000;

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

  await expect(page.locator(".question-card")).toBeVisible({ timeout: liveUiTimeout });
  await expect(page.locator(".quick-option").first()).toBeVisible({ timeout: liveUiTimeout });

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

test("agreement and privacy pages are reachable from user entry points", async ({ page }) => {
  await page.goto(`${baseUrl}/index.html`, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.goto(`${baseUrl}/index.html`, { waitUntil: "domcontentloaded" });

  await page.locator('[data-go="agreement"]').click();
  await expect(page.locator("h1", { hasText: "用户协议" })).toBeVisible();
  await expect(page.locator(".legal-section", { hasText: "订单与权益" })).toBeVisible();
  await page.locator('[data-go="auth"]').click();
  await expect(page.locator('[data-action="auth"]')).toBeVisible();

  await page.locator('[data-action="auth"]').click();
  await page.goto(`${baseUrl}/index.html#settings`, { waitUntil: "domcontentloaded" });
  await expect(page.locator("h1", { hasText: "设置" })).toBeVisible();
  await page.locator('[data-go="privacy"]').click();
  await expect(page.locator("h1", { hasText: "隐私政策" })).toBeVisible();
  await expect(page.locator(".legal-section", { hasText: "第三方服务" })).toBeVisible();
});

test("feedback category and content are submitted to the backend", async ({ page }) => {
  let requestBody = null;
  await page.route("**/api/public/feedback", async (route) => {
    requestBody = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, data: { submitted: true, feedbackId: "feedback-verification" } })
    });
  });
  await page.goto(`${baseUrl}/index.html`, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.goto(`${baseUrl}/index.html`, { waitUntil: "domcontentloaded" });

  await page.locator('[data-action="auth"]').click();
  await page.goto(`${baseUrl}/index.html#feedback`, { waitUntil: "domcontentloaded" });
  await page.locator('[data-feedback-tag="支付或订单问题"]').click();
  await expect(page.locator('[data-feedback-tag="支付或订单问题"]')).toHaveClass(/active/);
  await page.locator("#feedbackText").fill("付款后没有看到权益到账");
  await page.locator('[data-action="submit-feedback"]').click();

  await expect(page.locator(".success-title", { hasText: "反馈已收到" })).toBeVisible();
  await expect(page.locator("#feedbackText")).toHaveValue("");
  expect(requestBody).toMatchObject({
    category: "支付或订单问题",
    content: "付款后没有看到权益到账"
  });
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

  await expect(page.locator(".profile-row", { hasText: "销售表达辅导" })).toBeVisible({ timeout: liveUiTimeout });
  await page.locator('[data-action="edit-product-profile"]').first().click();
  await page.locator('[data-profile-field="name"]').fill("私域销售信辅导");
  await page.locator('[data-action="save-product-profile"]').click();

  await expect(page.locator(".profile-row", { hasText: "私域销售信辅导" })).toBeVisible({ timeout: liveUiTimeout });
  await page.locator('[data-action="delete-product-profile"]').first().click();
  await expect(page.locator(".profile-row", { hasText: "私域销售信辅导" })).toHaveCount(0);
  await expect(page.locator(".empty-title", { hasText: "还没有产品档案" })).toBeVisible();
});

test("claimed letter can be copied from the letter page", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async (text) => { window.__copiedLetterText = text; } }
    });
  });
  await page.goto(`${baseUrl}/index.html`, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem("h5Authed", "1");
    localStorage.setItem("h5Letter", JSON.stringify({
      id: "letter-copy-verification",
      title: "给潜在客户的一封销售信",
      scene: "成交邀约",
      version: 1,
      claimed: true,
      paragraphs: ["第一段正文", "第二段正文", "第三段正文"]
    }));
  });
  await page.goto(`${baseUrl}/index.html#letter`, { waitUntil: "domcontentloaded" });
  await expect(page.locator('[data-action="copy-letter"]')).toBeVisible();
  await page.locator('[data-action="copy-letter"]').click();
  await expect(page.locator(".contact-note", { hasText: "全文已复制" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__copiedLetterText || "")).toContain("第三段正文");
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

test("call page auto plays assistant prompt when TTS is configured", async ({ page }) => {
  let spokenText = "";
  await page.addInitScript(() => {
    class FakeSpeechRecognition {
      start() {}
      stop() {}
    }
    Object.defineProperty(window, "SpeechRecognition", { value: FakeSpeechRecognition, configurable: true });
    Object.defineProperty(window, "webkitSpeechRecognition", { value: undefined, configurable: true });
    class FakeAudio {
      constructor(url) {
        this.url = url;
      }
      pause() {}
      async play() {
        setTimeout(() => this.onended?.(), 0);
      }
    }
    Object.defineProperty(window, "Audio", { value: FakeAudio, configurable: true });
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
  await page.route("**/api/public/session/guest", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, data: { sessionId: "voice-session" } })
    });
  });
  await page.route("**/api/public/voice/speak", async (route) => {
    const body = route.request().postDataJSON();
    spokenText = String(body.text || "");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        data: {
          provider: "minimax",
          configured: true,
          audioUrl: "data:audio/mp3;base64,ZmFrZQ=="
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
  await expect.poll(() => spokenText).toContain("这封信是给你自己的产品写");
});

test("start call waits for latest public config", async ({ page }) => {
  let configCalls = 0;
  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.route("**/api/public/config", async (route) => {
    configCalls += 1;
    const generationEnabled = configCalls === 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        data: {
          homeConfig: {},
          pricing: {},
          guideStages: [],
          system: { voice_enabled: true, sms_enabled: true, file_export_enabled: true, generation_enabled: generationEnabled },
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

  await expect.poll(() => configCalls).toBeGreaterThanOrEqual(1);
  await page.locator('[data-action="auth"]').click();
  const startCall = page.locator('[data-action="start-call"]');
  await expect(startCall).toBeVisible();
  await startCall.click();
  await expect(page.locator(".question-card")).toHaveCount(0);
  await expect(page.locator(".home-title")).toBeVisible();
  await expect(page.locator("button", { hasText: "生成入口暂未开放" })).toBeVisible();
});

test("payment product-permission blocker clears pending payment intent", async ({ page }) => {
  let paymentBlocked = false;
  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.route("**/api/public/config", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        data: {
          homeConfig: {},
          pricing: { payment_enabled: true, annual_enabled: true, single_enabled: true, annual: 2000, single: 200 },
          guideStages: [],
          system: { voice_enabled: true, sms_enabled: true, file_export_enabled: true, generation_enabled: true },
          capabilities: { voice: { ttsConfigured: true, asrConfigured: false, asrVerified: false, asrPreferred: false } },
          versions: {}
        }
      })
    });
  });
  await page.route("**/api/public/session/guest", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, data: { sessionId: "test-session" } })
    });
  });
  await page.route("**/api/public/session/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, data: { user: null } })
    });
  });
  await page.route("**/api/public/letters", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, data: { letters: [] } })
    });
  });
  await page.route("**/api/public/orders", async (route) => {
    if (route.request().method() === "POST") {
      paymentBlocked = true;
      await route.fulfill({
        status: 424,
        contentType: "application/json",
        body: JSON.stringify({
          ok: false,
          error: {
            code: "wechat_pay_external_blocked",
            message: "微信支付商户号缺少当前支付产品权限，请到微信支付商户平台产品中心开通 H5 支付或 JSAPI 支付后再试。"
          }
        })
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        data: {
          orders: paymentBlocked
            ? [{ id: "order-blocked", title: "年卡会员", status: "payment_failed", productType: "annual", provider: "wechat", amountCents: 200000, createdAt: new Date().toISOString() }]
            : []
        }
      })
    });
  });
  await page.route("**/api/public/entitlements", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, data: { entitlements: [], summary: { annualActive: false, singleCredits: 0, firstFreeUsed: false } } })
    });
  });
  await page.route("**/api/public/profiles", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, data: { profiles: [] } })
    });
  });

  await page.goto(`${baseUrl}/index.html`, { waitUntil: "domcontentloaded" });
  await page.locator('[data-action="auth"]').click();
  await page.goto(`${baseUrl}/index.html#paywall`, { waitUntil: "domcontentloaded" });
  await page.locator('[data-action="create-order"]').click();

  await expect(page.locator(".record-title", { hasText: "订单记录" })).toBeVisible();
  await expect(page.locator(".contact-note", { hasText: "微信支付暂时还没有开通完成" })).toBeVisible();
  await expect(page.locator(".order-title", { hasText: "年卡" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("h5PaymentIntent"))).toBeNull();
});
