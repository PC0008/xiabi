import { ctx, db } from "edgespark";
import { and, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { generationTasks, salesLetters } from "@defs";
import { generateSalesLetterWithDeepSeek, type SalesLetterContent } from "../adapters/letter/deepseek";
import { enqueueTask } from "../adapters/task";
import { getConfigScope } from "../domain/config";
import { TENANT_ID } from "../domain/defaults";
import { fail, ok, parseJson, readJson } from "../domain/http";
import { getActiveSession } from "../domain/session";

const MAX_ANSWERS = 12;
const MAX_ANSWER_LENGTH = 1200;
const MAX_ANSWER_ITEMS = 12;
const MAX_QUESTION_LENGTH = 200;
const MAX_DESC_LENGTH = 400;
const MAX_INPUT_JSON_LENGTH = 12_000;
const HOURLY_GENERATION_LIMIT = 6;
const ONE_HOUR_MS = 60 * 60 * 1000;
const PUBLIC_GENERATION_FAILED_MESSAGE = "写信服务暂时没有完成，请稍后再试。";

type CreateTaskBody = {
  answers?: string[];
  input?: Record<string, unknown>;
};

type AnswerItem = {
  index?: number;
  question?: string;
  desc?: string;
  answer?: string;
};

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function clipString(value: unknown, maxLength: number) {
  return cleanString(value).slice(0, maxLength);
}

function rawStringLength(value: unknown) {
  return cleanString(String(value)).length;
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

function normalizeAnswerItems(items: unknown, answers: string[]) {
  if (!Array.isArray(items)) return [];
  return items
    .slice(0, MAX_ANSWER_ITEMS)
    .map((item, index) => {
      if (!item || typeof item !== "object") return null;
      const data = item as AnswerItem;
      return {
        index: Number.isFinite(Number(data.index)) ? Number(data.index) : index,
        question: clipString(data.question, MAX_QUESTION_LENGTH),
        desc: clipString(data.desc, MAX_DESC_LENGTH),
        answer: clipString(data.answer, MAX_ANSWER_LENGTH) || answers[index] || "用户未补充。"
      };
    })
    .filter((item) => item && item.question && item.answer);
}

function parseTaskInput(task: typeof generationTasks.$inferSelect) {
  const payload = parseJson<{ answers?: unknown; input?: unknown }>(task.inputJson, {});
  const answers = Array.isArray(payload.answers) ? payload.answers.map(String).filter(Boolean) : [];
  const input = payload.input && typeof payload.input === "object" && !Array.isArray(payload.input)
    ? payload.input as Record<string, unknown>
    : {};
  const answerItems = normalizeAnswerItems(input.answerItems, answers);
  if (answerItems.length) input.answerItems = answerItems;
  return { answers, input };
}

function isStaleRunningTask(task: typeof generationTasks.$inferSelect) {
  if (task.status !== "running") return false;
  return Date.now() - new Date(task.updatedAt || task.createdAt).getTime() > 2 * 60 * 1000;
}

async function processGenerationTask(task: typeof generationTasks.$inferSelect) {
  if (task.status === "succeeded" || task.status === "failed") return task;
  if (task.status === "running") {
    if (!isStaleRunningTask(task)) return task;
    const [failedTask] = await db.update(generationTasks).set({
      status: "failed",
      progressJson: JSON.stringify({ percent: 0, stage: "failed", provider: "deepseek" }),
      errorCode: "generation_worker_timeout",
      errorMessage: "写信任务执行超时，请在后台确认后重试。",
      updatedAt: new Date().toISOString()
    }).where(and(eq(generationTasks.id, task.id), eq(generationTasks.status, "running"), eq(generationTasks.updatedAt, task.updatedAt))).returning();
    return failedTask || task;
  }
  if (task.status !== "queued") return task;

  const { answers, input } = parseTaskInput(task);
  const templates = (await getConfigScope(db, "templates")).data;
  const templateMeta = selectTemplateMeta(templates);

  const [lockedTask] = await db.update(generationTasks).set({
    status: "running",
    progressJson: JSON.stringify({ percent: 20, stage: "writing", provider: "deepseek" }),
    attempts: Number(task.attempts || 0) + 1,
    updatedAt: new Date().toISOString()
  }).where(and(eq(generationTasks.id, task.id), eq(generationTasks.status, "queued"), eq(generationTasks.updatedAt, task.updatedAt))).returning();
  if (!lockedTask) {
    const [currentTask] = await db.select().from(generationTasks).where(eq(generationTasks.id, task.id)).limit(1);
    return currentTask || task;
  }

  let content: SalesLetterContent | null = null;
  try {
    content = await generateSalesLetterWithDeepSeek({ answers, input, templates });
    if (!content) throw new Error("DeepSeek provider is not configured.");
  } catch (error) {
    console.error("deepseek_generation_failed", error);
    await db.update(generationTasks).set({
      status: "failed",
      progressJson: JSON.stringify({ percent: 0, stage: "failed", provider: "deepseek" }),
      errorCode: "deepseek_generation_failed",
      errorMessage: PUBLIC_GENERATION_FAILED_MESSAGE,
      updatedAt: new Date().toISOString()
    }).where(eq(generationTasks.id, task.id));
    const [failedTask] = await db.select().from(generationTasks).where(eq(generationTasks.id, task.id)).limit(1);
    return failedTask;
  }

  const [currentTask] = await db.select().from(generationTasks).where(eq(generationTasks.id, task.id)).limit(1);
  if (!currentTask || currentTask.status !== "running" || currentTask.updatedAt !== lockedTask.updatedAt || currentTask.letterId) {
    return currentTask || task;
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

export async function runGenerationTaskInBackground(taskId: string) {
  try {
    const [task] = await db.select().from(generationTasks).where(eq(generationTasks.id, taskId)).limit(1);
    if (task) await processGenerationTask(task);
  } catch (error) {
    console.error("background_generation_failed", error);
    await db.update(generationTasks).set({
      status: "failed",
      progressJson: JSON.stringify({ percent: 0, stage: "failed", provider: "deepseek" }),
      errorCode: "background_generation_failed",
      errorMessage: PUBLIC_GENERATION_FAILED_MESSAGE,
      updatedAt: new Date().toISOString()
    }).where(eq(generationTasks.id, taskId));
  }
}

async function hasTooManyRecentGenerationTasks(sessionId: string) {
  const recentTasks = await db
    .select({ createdAt: generationTasks.createdAt })
    .from(generationTasks)
    .where(and(eq(generationTasks.tenantId, TENANT_ID), eq(generationTasks.sessionId, sessionId)))
    .orderBy(desc(generationTasks.createdAt))
    .limit(HOURLY_GENERATION_LIMIT);
  const recentCount = recentTasks.filter((task) => Date.now() - new Date(task.createdAt).getTime() < ONE_HOUR_MS).length;
  return recentCount >= HOURLY_GENERATION_LIMIT;
}

export const taskRoutes = new Hono()
  .post("/", async (c) => {
    const activeSession = await getActiveSession(c);
    if (!activeSession) return fail(c, "missing_session", "请先开始一次会话。", 401);
    const { sessionId, session } = activeSession;

    const body = await readJson<CreateTaskBody>(c);
    const rawAnswers = Array.isArray(body.answers) ? body.answers.map(String) : [];
    if (rawAnswers.length > MAX_ANSWERS) return fail(c, "too_many_answers", "本次内容太多，请精简后再生成。", 413);
    if (rawAnswers.some((answer) => rawStringLength(answer) > MAX_ANSWER_LENGTH)) {
      return fail(c, "answer_too_long", "单条回答太长，请精简后再生成。", 413);
    }
    const answers = rawAnswers.map((answer) => clipString(answer, MAX_ANSWER_LENGTH)).filter(Boolean);
    const rawInput = body.input && typeof body.input === "object" && !Array.isArray(body.input) ? body.input : {};
    const rawAnswerItems = Array.isArray(rawInput.answerItems) ? rawInput.answerItems : [];
    if (rawAnswerItems.length > MAX_ANSWER_ITEMS) return fail(c, "too_many_answer_items", "本次问题太多，请精简后再生成。", 413);
    if (rawAnswerItems.some((item) => {
      if (!item || typeof item !== "object") return false;
      const data = item as AnswerItem;
      return rawStringLength(data.question) > MAX_QUESTION_LENGTH ||
        rawStringLength(data.desc) > MAX_DESC_LENGTH ||
        rawStringLength(data.answer) > MAX_ANSWER_LENGTH;
    })) {
      return fail(c, "answer_item_too_long", "问题或回答内容太长，请精简后再生成。", 413);
    }
    const input = {
      ...rawInput,
      answerItems: normalizeAnswerItems(rawInput.answerItems, answers)
    };
    const taskInput = { answers, input };
    if (JSON.stringify(taskInput).length > MAX_INPUT_JSON_LENGTH) {
      return fail(c, "task_input_too_large", "本次内容太多，请精简后再生成。", 413);
    }
    const [homeConfig, systemConfig] = await Promise.all([
      getConfigScope(db, "home"),
      getConfigScope(db, "system")
    ]);
    if ((homeConfig.data as Record<string, unknown>).generation_entry_enabled === false || (systemConfig.data as Record<string, unknown>).generation_enabled === false) {
      return fail(c, "generation_disabled", "写信入口暂未开放。", 403);
    }
    if (await hasTooManyRecentGenerationTasks(sessionId)) {
      return fail(c, "too_many_generation_tasks", "写信请求太频繁，请稍后再试。", 429);
    }
    const taskId = crypto.randomUUID();

    await db.insert(generationTasks).values({
      id: taskId,
      tenantId: TENANT_ID,
      sessionId,
      userId: session.userId || null,
      type: "sales_letter",
      status: "queued",
      inputJson: JSON.stringify(taskInput),
      progressJson: JSON.stringify({ percent: 5, stage: "queued", provider: "deepseek" }),
      attempts: 0
    });
    const queue = await enqueueTask({ taskId, type: "sales_letter" });
    ctx.runInBackground(runGenerationTaskInBackground(taskId));
    return ok(c, { taskId, status: "queued", queue });
  })
  .get("/:id", async (c) => {
    const activeSession = await getActiveSession(c);
    if (!activeSession) return fail(c, "missing_session", "请先开始一次会话。", 401);
    const { sessionId } = activeSession;
    const [task] = await db
      .select()
      .from(generationTasks)
      .where(and(eq(generationTasks.id, c.req.param("id")), eq(generationTasks.sessionId, sessionId)))
      .limit(1);
    if (!task) return fail(c, "task_not_found", "没有找到生成任务。", 404);
    return ok(c, publicTask(task));
  });
