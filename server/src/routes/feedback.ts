import { db } from "edgespark";
import { and, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { auditLogs } from "@defs";
import { TENANT_ID } from "../domain/defaults";
import { fail, ok, readJson } from "../domain/http";
import { getActiveSession } from "../domain/session";

const MAX_FEEDBACK_CONTENT_LENGTH = 2000;
const MAX_FEEDBACK_CATEGORY_LENGTH = 80;
const HOURLY_FEEDBACK_LIMIT = 12;

type FeedbackBody = {
  category?: string;
  content?: string;
};

export const feedbackRoutes = new Hono()
  .post("/", async (c) => {
    const activeSession = await getActiveSession(c);
    if (!activeSession) return fail(c, "missing_session", "请先开始一次会话。", 401);
    const { sessionId } = activeSession;
    const body = await readJson<FeedbackBody>(c);
    const content = String(body.content || "").trim();
    if (!content) return fail(c, "missing_content", "请填写反馈内容。", 400);
    if (content.length > MAX_FEEDBACK_CONTENT_LENGTH) return fail(c, "feedback_too_long", "反馈内容太长，请精简后再提交。", 413);
    const recent = await db
      .select({ createdAt: auditLogs.createdAt })
      .from(auditLogs)
      .where(and(
        eq(auditLogs.tenantId, TENANT_ID),
        eq(auditLogs.actorId, sessionId),
        eq(auditLogs.action, "feedback.submit")
      ))
      .orderBy(desc(auditLogs.createdAt))
      .limit(HOURLY_FEEDBACK_LIMIT + 1);
    const now = Date.now();
    const hourlyCount = recent.filter((row) => now - new Date(row.createdAt).getTime() < 60 * 60 * 1000).length;
    if (hourlyCount >= HOURLY_FEEDBACK_LIMIT) {
      return fail(c, "too_many_feedback", "反馈提交太频繁，请稍后再试。", 429);
    }
    const category = String(body.category || "用户反馈").trim().slice(0, MAX_FEEDBACK_CATEGORY_LENGTH) || "用户反馈";
    const id = crypto.randomUUID();
    await db.insert(auditLogs).values({
      id,
      tenantId: TENANT_ID,
      actorId: sessionId,
      actorType: "user",
      action: "feedback.submit",
      targetType: "feedback",
      targetId: id,
      detailJson: JSON.stringify({ category, content })
    });
    return ok(c, { submitted: true, feedbackId: id });
  });
