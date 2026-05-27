import { db } from "edgespark";
import { and, eq } from "drizzle-orm";
import { getCookie } from "hono/cookie";
import { Hono } from "hono";
import { generationTasks, salesLetters } from "@defs";
import { generateSalesLetterWithDeepSeek, type SalesLetterContent } from "../adapters/letter/deepseek";
import { getConfigScope } from "../domain/config";
import { TENANT_ID } from "../domain/defaults";
import { fail, ok, parseJson, readJson } from "../domain/http";

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

function publicTask(task: typeof generationTasks.$inferSelect) {
  return {
    ...task,
    input: parseJson(task.inputJson, {}),
    progress: parseJson(task.progressJson, null)
  };
}

function parseTaskInput(task: typeof generationTasks.$inferSelect) {
  const payload = parseJson<{ answers?: unknown; input?: unknown }>(task.inputJson, {});
  const answers = Array.isArray(payload.answers) ? payload.answers.map(String).filter(Boolean) : [];
  const input = payload.input && typeof payload.input === "object" && !Array.isArray(payload.input)
    ? payload.input as Record<string, unknown>
    : {};
  return { answers, input };
}

function isStaleRunningTask(task: typeof generationTasks.$inferSelect) {
  if (task.status !== "running") return false;
  return Date.now() - new Date(task.updatedAt || task.createdAt).getTime() > 2 * 60 * 1000;
}

async function processGenerationTask(task: typeof generationTasks.$inferSelect) {
  if (task.status === "succeeded" || task.status === "failed") return task;
  if (task.status === "running" && !isStaleRunningTask(task)) return task;

  const { answers, input } = parseTaskInput(task);
  const templates = (await getConfigScope(db, "templates")).data;
  const templateMeta = selectTemplateMeta(templates);

  const [lockedTask] = await db.update(generationTasks).set({
    status: "running",
    progressJson: JSON.stringify({ percent: 20, stage: task.status === "running" ? "resuming" : "writing", provider: "deepseek" }),
    attempts: Number(task.attempts || 0) + 1,
    updatedAt: new Date().toISOString()
  }).where(and(eq(generationTasks.id, task.id), eq(generationTasks.status, task.status), eq(generationTasks.updatedAt, task.updatedAt))).returning();
  if (!lockedTask) {
    const [currentTask] = await db.select().from(generationTasks).where(eq(generationTasks.id, task.id)).limit(1);
    return currentTask || task;
  }

  let content: SalesLetterContent | null = null;
  try {
    content = await generateSalesLetterWithDeepSeek({ answers, input, templates });
    if (!content) throw new Error("DeepSeek provider is not configured.");
  } catch (error) {
    await db.update(generationTasks).set({
      status: "failed",
      progressJson: JSON.stringify({ percent: 0, stage: "failed", provider: "deepseek" }),
      errorCode: "deepseek_generation_failed",
      errorMessage: error instanceof Error ? error.message.slice(0, 500) : "DeepSeek generation failed.",
      updatedAt: new Date().toISOString()
    }).where(eq(generationTasks.id, task.id));
    const [failedTask] = await db.select().from(generationTasks).where(eq(generationTasks.id, task.id)).limit(1);
    return failedTask;
  }

  const letterId = crypto.randomUUID();
  await db.insert(salesLetters).values({
    id: letterId,
    tenantId: TENANT_ID,
    userId: task.userId,
    sessionId: task.sessionId,
    title: content.title,
    scene: content.scene,
    status: "ready",
    inputJson: task.inputJson,
    contentJson: JSON.stringify({ ...content, version: 1 }),
    templateKey: templateMeta.key,
    templateVersion: templateMeta.version
  });
  await db.update(generationTasks).set({
    letterId,
    status: "succeeded",
    progressJson: JSON.stringify({ percent: 100, stage: "ready", provider: content.provider || "deepseek" }),
    errorCode: null,
    errorMessage: null,
    updatedAt: new Date().toISOString()
  }).where(eq(generationTasks.id, task.id));
  const [updatedTask] = await db.select().from(generationTasks).where(eq(generationTasks.id, task.id)).limit(1);
  return updatedTask;
}

export const taskRoutes = new Hono()
  .post("/", async (c) => {
    const sessionId = getCookie(c, SESSION_COOKIE);
    if (!sessionId) return fail(c, "missing_session", "请先开始一次会话。", 401);

    const body = await readJson<CreateTaskBody>(c);
    const answers = Array.isArray(body.answers) ? body.answers.map(String) : [];
    const input = body.input || {};
    const [homeConfig, systemConfig] = await Promise.all([
      getConfigScope(db, "home"),
      getConfigScope(db, "system")
    ]);
    if ((homeConfig.data as Record<string, unknown>).generation_entry_enabled === false || (systemConfig.data as Record<string, unknown>).generation_enabled === false) {
      return fail(c, "generation_disabled", "写信入口暂未开放。", 403);
    }
    const taskId = crypto.randomUUID();

    await db.insert(generationTasks).values({
      id: taskId,
      tenantId: TENANT_ID,
      sessionId,
      type: "sales_letter",
      status: "queued",
      inputJson: JSON.stringify({ answers, input }),
      progressJson: JSON.stringify({ percent: 5, stage: "queued", provider: "deepseek" }),
      attempts: 0
    });
    return ok(c, { taskId, status: "queued" });
  })
  .get("/:id", async (c) => {
    const sessionId = getCookie(c, SESSION_COOKIE);
    if (!sessionId) return fail(c, "missing_session", "请先开始一次会话。", 401);
    const [task] = await db
      .select()
      .from(generationTasks)
      .where(and(eq(generationTasks.id, c.req.param("id")), eq(generationTasks.sessionId, sessionId)))
      .limit(1);
    if (!task) return fail(c, "task_not_found", "没有找到生成任务。", 404);
    const updated = await processGenerationTask(task);
    return ok(c, publicTask(updated));
  });
