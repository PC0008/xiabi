import { db } from "edgespark";
import { eq } from "drizzle-orm";
import { getCookie } from "hono/cookie";
import { Hono } from "hono";
import { generationTasks, salesLetters } from "@defs";
import { generateSalesLetterWithDeepSeek, type SalesLetterContent } from "../adapters/letter/deepseek";
import { getConfigScope } from "../domain/config";
import { TENANT_ID } from "../domain/defaults";
import { fail, ok, readJson } from "../domain/http";

const SESSION_COOKIE = "xiabi_session";

type CreateTaskBody = {
  answers?: string[];
  input?: Record<string, unknown>;
};

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function selectTemplateMeta(templates: unknown) {
  if (!Array.isArray(templates) || !templates.length) {
    return { key: "wechat_private_sales_letter", version: "v1.0" };
  }
  const template = templates.find((item) => {
    if (!item || typeof item !== "object") return false;
    return cleanString((item as Record<string, unknown>).status) === "enabled";
  }) || templates[0];
  if (!template || typeof template !== "object") {
    return { key: "wechat_private_sales_letter", version: "v1.0" };
  }
  const data = template as Record<string, unknown>;
  return {
    key: cleanString(data.key) || "wechat_private_sales_letter",
    version: cleanString(data.version) || "v1.0"
  };
}

function buildDraftLetter(answers: string[]): SalesLetterContent {
  const goal = answers[1] || "让潜在客户理解产品价值，并愿意预约一次沟通。";
  const concern = answers[3] || "客户担心效果不稳定，也担心投入后没有持续跟进。";
  return {
    title: "给潜在客户的一封成交销售信",
    scene: "成交邀约",
    paragraphs: [
      "你好，我认真整理了你现在想推进的目标。真正重要的不是把产品介绍得更复杂，而是让对方在短时间内明白：这件事和他当下的处境有什么关系。",
      `这封信会围绕“${goal}”来展开，把客户最关心的结果、行动理由和下一步安排讲清楚。`,
      `我也会提前回应客户的顾虑：${concern}。当这些顾虑被看见，对方才更容易继续往下聊。`,
      "如果你愿意，我们可以先从一次轻量沟通开始。你不用马上做很重的决定，只需要先判断这件事是否值得继续推进。"
    ],
    provider: "local_fallback"
  };
}

export const taskRoutes = new Hono()
  .post("/", async (c) => {
    const sessionId = getCookie(c, SESSION_COOKIE);
    if (!sessionId) return fail(c, "missing_session", "请先开始一次会话。", 401);

    const body = await readJson<CreateTaskBody>(c);
    const answers = Array.isArray(body.answers) ? body.answers.map(String) : [];
    const input = body.input || {};
    const taskId = crypto.randomUUID();
    const templates = (await getConfigScope(db, "templates")).data;
    const templateMeta = selectTemplateMeta(templates);

    let content: SalesLetterContent | null = null;
    try {
      content = await generateSalesLetterWithDeepSeek({ answers, input, templates });
    } catch (error) {
      await db.insert(generationTasks).values({
        id: taskId,
        tenantId: TENANT_ID,
        sessionId,
        type: "sales_letter",
        status: "failed",
        inputJson: JSON.stringify({ answers, input }),
        progressJson: JSON.stringify({ percent: 0, stage: "failed", provider: "deepseek" }),
        errorCode: "deepseek_generation_failed",
        errorMessage: error instanceof Error ? error.message.slice(0, 500) : "DeepSeek generation failed.",
        attempts: 1
      });
      return fail(c, "generation_failed", "写信服务暂时没有完成，请稍后再试。", 502);
    }

    content = content || buildDraftLetter(answers);
    const letterId = crypto.randomUUID();
    await db.insert(salesLetters).values({
      id: letterId,
      tenantId: TENANT_ID,
      sessionId,
      title: content.title,
      scene: content.scene,
      status: "ready",
      inputJson: JSON.stringify({ answers, input }),
      contentJson: JSON.stringify({ ...content, version: 1 }),
      templateKey: templateMeta.key,
      templateVersion: templateMeta.version
    });
    await db.insert(generationTasks).values({
      id: taskId,
      tenantId: TENANT_ID,
      sessionId,
      letterId,
      type: "sales_letter",
      status: "succeeded",
      inputJson: JSON.stringify({ answers, input }),
      progressJson: JSON.stringify({ percent: 100, stage: "ready", provider: content.provider || "deepseek" }),
      attempts: 1
    });
    return ok(c, { taskId, letterId, status: "succeeded" });
  })
  .get("/:id", async (c) => {
    const [task] = await db.select().from(generationTasks).where(eq(generationTasks.id, c.req.param("id"))).limit(1);
    if (!task) return fail(c, "task_not_found", "没有找到生成任务。", 404);
    return ok(c, task);
  });
