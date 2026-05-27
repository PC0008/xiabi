import { db } from "edgespark";
import { getCookie } from "hono/cookie";
import { Hono } from "hono";
import { auditLogs } from "@defs";
import { TENANT_ID } from "../domain/defaults";
import { fail, ok, readJson } from "../domain/http";

const SESSION_COOKIE = "xiabi_session";

type FeedbackBody = {
  category?: string;
  content?: string;
};

export const feedbackRoutes = new Hono()
  .post("/", async (c) => {
    const sessionId = getCookie(c, SESSION_COOKIE);
    if (!sessionId) return fail(c, "missing_session", "请先开始一次会话。", 401);
    const body = await readJson<FeedbackBody>(c);
    const content = String(body.content || "").trim();
    if (!content) return fail(c, "missing_content", "请填写反馈内容。", 400);
    const id = crypto.randomUUID();
    await db.insert(auditLogs).values({
      id,
      tenantId: TENANT_ID,
      actorId: sessionId,
      actorType: "user",
      action: "feedback.submit",
      targetType: "feedback",
      targetId: id,
      detailJson: JSON.stringify({ category: body.category || "用户反馈", content })
    });
    return ok(c, { submitted: true, feedbackId: id });
  });
