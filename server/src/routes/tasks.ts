import { db } from "edgespark";
import { eq } from "drizzle-orm";
import { getCookie } from "hono/cookie";
import { Hono } from "hono";
import { generationTasks, salesLetters } from "@defs";
import { TENANT_ID } from "../domain/defaults";
import { fail, ok, readJson } from "../domain/http";

const SESSION_COOKIE = "xiabi_session";

type CreateTaskBody = {
  answers?: string[];
  input?: Record<string, unknown>;
};

function buildDraftLetter(answers: string[]) {
  const goal = answers[1] || "让潜在客户理解产品价值，并愿意预约一次沟通。";
  const concern = answers[3] || "客户担心效果不稳定，也担心投入后没有持续跟进。";
  return {
    title: "给潜在客户的一封成交销售信",
    scene: "成交邀约",
    paragraphs: [
      "你好，我认真想了你现在遇到的问题：产品有价值，但客户还没有真正理解为什么现在就该行动。",
      `这封信的重点不是堆功能，而是围绕“${goal}”把客户当下最关心的结果讲清楚。`,
      `我也会提前回应客户的顾虑：${concern}。当这些顾虑被看见，客户才更容易继续往下聊。`,
      "如果你愿意，我们可以先从一次轻量沟通开始。我会根据你的具体情况，帮你判断哪一块最值得先改。"
    ]
  };
}

export const taskRoutes = new Hono()
  .post("/", async (c) => {
    const sessionId = getCookie(c, SESSION_COOKIE);
    if (!sessionId) return fail(c, "missing_session", "请先开始一次会话。", 401);
    const body = await readJson<CreateTaskBody>(c);
    const answers = Array.isArray(body.answers) ? body.answers.map(String) : [];
    const content = buildDraftLetter(answers);
    const letterId = crypto.randomUUID();
    const taskId = crypto.randomUUID();
    await db.insert(salesLetters).values({
      id: letterId,
      tenantId: TENANT_ID,
      sessionId,
      title: content.title,
      scene: content.scene,
      status: "ready",
      inputJson: JSON.stringify({ answers, input: body.input || {} }),
      contentJson: JSON.stringify({ ...content, version: 1 }),
      templateKey: "wechat_private_sales_letter",
      templateVersion: "v1.0"
    });
    await db.insert(generationTasks).values({
      id: taskId,
      tenantId: TENANT_ID,
      sessionId,
      letterId,
      type: "sales_letter",
      status: "succeeded",
      inputJson: JSON.stringify({ answers, input: body.input || {} }),
      progressJson: JSON.stringify({ percent: 100, stage: "ready" }),
      attempts: 1
    });
    return ok(c, { taskId, letterId, status: "succeeded" });
  })
  .get("/:id", async (c) => {
    const [task] = await db.select().from(generationTasks).where(eq(generationTasks.id, c.req.param("id"))).limit(1);
    if (!task) return fail(c, "task_not_found", "没有找到生成任务。", 404);
    return ok(c, task);
  });
