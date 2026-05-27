import { db, storage } from "edgespark";
import { and, eq } from "drizzle-orm";
import { getCookie } from "hono/cookie";
import { Hono } from "hono";
import { buckets, files, salesLetters } from "@defs";
import { TENANT_ID } from "../domain/defaults";
import { fail, ok, parseJson } from "../domain/http";

const SESSION_COOKIE = "xiabi_session";

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildPrintableLetterHtml(letter: typeof salesLetters.$inferSelect, paragraphs: string[]) {
  const safeTitle = escapeHtml(letter.title);
  const safeScene = escapeHtml(letter.scene);
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${safeTitle}</title>
  <style>
    body { margin: 0; background: #f3f6f4; color: #16211c; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    main { max-width: 760px; margin: 0 auto; padding: 32px 18px 56px; }
    article { background: #fff; border: 1px solid #dfe7e2; border-radius: 10px; padding: 34px 30px; box-shadow: 0 18px 48px rgba(17, 36, 28, .08); }
    h1 { margin: 0 0 10px; font-size: 26px; line-height: 1.3; }
    .meta { color: #668075; font-size: 14px; margin-bottom: 26px; }
    p { font-size: 17px; line-height: 1.9; margin: 0 0 18px; white-space: pre-wrap; }
    .actions { display: flex; justify-content: flex-end; gap: 10px; margin: 0 auto 16px; max-width: 760px; }
    button { border: 0; border-radius: 999px; padding: 10px 16px; background: #16a15e; color: #fff; font-weight: 700; }
    @media print {
      body { background: #fff; }
      main { padding: 0; max-width: none; }
      article { border: 0; box-shadow: none; border-radius: 0; padding: 0; }
      .actions { display: none; }
    }
  </style>
</head>
<body>
  <main>
    <div class="actions"><button onclick="window.print()">保存为 PDF</button></div>
    <article>
      <h1>${safeTitle}</h1>
      <div class="meta">智多星整理 · ${safeScene}</div>
      ${paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("\n      ")}
    </article>
  </main>
</body>
</html>`;
}

export const exportRoutes = new Hono()
  .post("/letters/:id", async (c) => {
    const sessionId = getCookie(c, SESSION_COOKIE);
    if (!sessionId) return fail(c, "missing_session", "请先开始一次会话。", 401);
    const [letter] = await db
      .select()
      .from(salesLetters)
      .where(and(eq(salesLetters.id, c.req.param("id")), eq(salesLetters.sessionId, sessionId)))
      .limit(1);
    if (!letter) return fail(c, "letter_not_found", "没有找到这封销售信。", 404);
    const content = parseJson<{ paragraphs?: string[] }>(letter.contentJson, {});
    const paragraphs = Array.isArray(content.paragraphs) ? content.paragraphs.map(String).filter(Boolean) : [];
    const body = buildPrintableLetterHtml(letter, paragraphs);
    const objectKey = `exports/${sessionId}/${letter.id}.html`;
    await storage.from(buckets.xiabiFiles).put(objectKey, new TextEncoder().encode(body), {
      contentType: "text/html; charset=utf-8",
      contentDisposition: `inline; filename="${letter.id}.html"`
    });
    await db.insert(files).values({
      id: crypto.randomUUID(),
      tenantId: TENANT_ID,
      letterId: letter.id,
      bucket: buckets.xiabiFiles.bucket_name,
      objectKey,
      kind: "letter_print_html",
      status: "ready"
    }).onConflictDoNothing();
    await db.update(salesLetters).set({ exportedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }).where(eq(salesLetters.id, letter.id));
    const { downloadUrl } = await storage.from(buckets.xiabiFiles).createPresignedGetUrl(objectKey, 3600);
    return ok(c, { downloadUrl, objectKey, fileType: "print_html", expiresInSeconds: 3600 });
  });
