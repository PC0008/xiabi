import { db, storage } from "edgespark";
import { and, desc, eq, or } from "drizzle-orm";
import { getCookie } from "hono/cookie";
import { Hono } from "hono";
import JSZip from "jszip";
import { auditLogs, buckets, entitlementLedger, files, guestSessions, salesLetters } from "@defs";
import { getAdminConfig } from "../domain/config";
import { TENANT_ID } from "../domain/defaults";
import { fail, ok, parseJson } from "../domain/http";

const SESSION_COOKIE = "xiabi_session";
const EXPORT_HOURLY_LIMIT = 20;

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function xmlText(value: unknown) {
  return escapeHtml(value);
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

function buildPlainTextLetter(letter: typeof salesLetters.$inferSelect, paragraphs: string[]) {
  return [
    letter.title,
    `智多星整理 · ${letter.scene}场景`,
    "",
    ...paragraphs
  ].join("\n\n");
}

async function buildDocxLetter(letter: typeof salesLetters.$inferSelect, paragraphs: string[]) {
  const zip = new JSZip();
  const now = new Date().toISOString();
  const body = [
    `<w:p><w:pPr><w:pStyle w:val="Title"/></w:pPr><w:r><w:t>${xmlText(letter.title)}</w:t></w:r></w:p>`,
    `<w:p><w:pPr><w:pStyle w:val="Subtitle"/></w:pPr><w:r><w:t>${xmlText(`智多星整理 · ${letter.scene}场景`)}</w:t></w:r></w:p>`,
    ...paragraphs.map((paragraph) => `<w:p><w:pPr><w:spacing w:after="180" w:line="420" w:lineRule="auto"/></w:pPr><w:r><w:rPr><w:sz w:val="24"/></w:rPr><w:t xml:space="preserve">${xmlText(paragraph)}</w:t></w:r></w:p>`)
  ].join("");
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`);
  zip.folder("_rels")?.file(".rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`);
  zip.folder("docProps")?.file("core.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>${xmlText(letter.title)}</dc:title>
  <dc:creator>智多星</dc:creator>
  <cp:lastModifiedBy>智多星</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified>
</cp:coreProperties>`);
  zip.folder("docProps")?.file("app.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>下笔有元</Application>
</Properties>`);
  zip.folder("word")?.file("styles.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:rPr><w:b/><w:sz w:val="40"/></w:rPr><w:pPr><w:spacing w:after="180"/></w:pPr></w:style>
  <w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:rPr><w:color w:val="668075"/><w:sz w:val="22"/></w:rPr><w:pPr><w:spacing w:after="360"/></w:pPr></w:style>
</w:styles>`);
  zip.folder("word")?.folder("_rels")?.file("document.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`);
  zip.folder("word")?.file("document.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${body}
    <w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>
  </w:body>
</w:document>`);
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}

function safeExportFilename(letter: typeof salesLetters.$inferSelect, extension = "html") {
  const title = String(letter.title || letter.id)
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .slice(0, 80) || letter.id;
  return `${title}.${extension}`;
}

type GuestSession = typeof guestSessions.$inferSelect;

async function getCurrentSession(sessionId: string) {
  const [session] = await db
    .select()
    .from(guestSessions)
    .where(and(eq(guestSessions.tenantId, TENANT_ID), eq(guestSessions.id, sessionId), eq(guestSessions.status, "active")))
    .limit(1);
  return session || null;
}

function letterOwnerWhere(session: GuestSession) {
  return session.userId
    ? or(eq(salesLetters.sessionId, session.id), eq(salesLetters.userId, session.userId))
    : eq(salesLetters.sessionId, session.id);
}

function entitlementOwnerWhere(session: GuestSession) {
  return session.userId
    ? or(eq(entitlementLedger.sessionId, session.id), eq(entitlementLedger.userId, session.userId))
    : eq(entitlementLedger.sessionId, session.id);
}

async function hasExportAccess(session: GuestSession, letter: typeof salesLetters.$inferSelect) {
  if (letter.claimedAt) return true;
  const rows = await db
    .select()
    .from(entitlementLedger)
    .where(and(eq(entitlementLedger.tenantId, TENANT_ID), entitlementOwnerWhere(session)))
    .limit(100);
  const now = Date.now();
  return rows.some((item) => {
    if (item.type === "annual" && item.status === "active") {
      return !item.expiresAt || new Date(item.expiresAt).getTime() > now;
    }
    if (["single", "first_free_letter"].includes(item.type) && item.letterId === letter.id) {
      return item.status === "active" || item.status === "used";
    }
    return false;
  });
}

async function exportRateLimited(session: GuestSession) {
  const recent = await db
    .select({ createdAt: auditLogs.createdAt })
    .from(auditLogs)
    .where(and(eq(auditLogs.tenantId, TENANT_ID), eq(auditLogs.actorId, session.id), eq(auditLogs.action, "letter.export")))
    .orderBy(desc(auditLogs.createdAt))
    .limit(EXPORT_HOURLY_LIMIT);
  const cutoff = Date.now() - 60 * 60 * 1000;
  return recent.filter((row) => new Date(row.createdAt).getTime() >= cutoff).length >= EXPORT_HOURLY_LIMIT;
}

export const exportRoutes = new Hono()
  .post("/letters/:id", async (c) => {
    const sessionId = getCookie(c, SESSION_COOKIE);
    if (!sessionId) return fail(c, "missing_session", "请先开始一次会话。", 401);
    const session = await getCurrentSession(sessionId);
    if (!session) return fail(c, "missing_session", "请先开始一次会话。", 401);
    const config = await getAdminConfig(db);
    const system = config.system as Record<string, unknown>;
    if (system.file_export_enabled === false) {
      return fail(c, "export_disabled", "导出服务暂未开启。", 503);
    }
    const [letter] = await db
      .select()
      .from(salesLetters)
      .where(and(eq(salesLetters.tenantId, TENANT_ID), eq(salesLetters.id, c.req.param("id")), letterOwnerWhere(session)))
      .limit(1);
    if (!letter) return fail(c, "letter_not_found", "没有找到这封销售信。", 404);
    if (!(await hasExportAccess(session, letter))) {
      return fail(c, "letter_locked", "请先领取或解锁这封销售信，再打开打印版。", 403);
    }
    if (await exportRateLimited(session)) {
      return fail(c, "export_rate_limited", "导出太频繁了，请稍后再试。", 429);
    }
    const content = parseJson<{ paragraphs?: string[] }>(letter.contentJson, {});
    const paragraphs = Array.isArray(content.paragraphs) ? content.paragraphs.map(String).filter(Boolean) : [];
    if (!paragraphs.length) return fail(c, "letter_not_ready", "这封销售信还没有可导出的正文，请先完成生成。", 409);
    const htmlBody = buildPrintableLetterHtml(letter, paragraphs);
    const textBody = buildPlainTextLetter(letter, paragraphs);
    const filename = safeExportFilename(letter, "html");
    const textFilename = safeExportFilename(letter, "txt");
    const docxFilename = safeExportFilename(letter, "docx");
    const objectKey = `exports/${sessionId}/${letter.id}.html`;
    const textObjectKey = `exports/${sessionId}/${letter.id}.txt`;
    const docxObjectKey = `exports/${sessionId}/${letter.id}.docx`;
    const docxBody = await buildDocxLetter(letter, paragraphs);
    await storage.from(buckets.xiabiFiles).put(objectKey, new TextEncoder().encode(htmlBody), {
      contentType: "text/html; charset=utf-8",
      contentDisposition: `inline; filename="${filename}"`
    });
    await storage.from(buckets.xiabiFiles).put(textObjectKey, new TextEncoder().encode(textBody), {
      contentType: "text/plain; charset=utf-8",
      contentDisposition: `attachment; filename="${textFilename}"`
    });
    await storage.from(buckets.xiabiFiles).put(docxObjectKey, docxBody, {
      contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      contentDisposition: `attachment; filename="${docxFilename}"`
    });
    await db.insert(files).values({
      id: crypto.randomUUID(),
      tenantId: TENANT_ID,
      userId: session.userId || null,
      letterId: letter.id,
      bucket: buckets.xiabiFiles.bucket_name,
      objectKey,
      kind: "letter_print_html",
      status: "ready"
    }).onConflictDoUpdate({
      target: [files.bucket, files.objectKey],
      set: {
        userId: session.userId || null,
        letterId: letter.id,
        kind: "letter_print_html",
        status: "ready"
      }
    });
    await db.insert(files).values({
      id: crypto.randomUUID(),
      tenantId: TENANT_ID,
      userId: session.userId || null,
      letterId: letter.id,
      bucket: buckets.xiabiFiles.bucket_name,
      objectKey: textObjectKey,
      kind: "letter_plain_text",
      status: "ready"
    }).onConflictDoUpdate({
      target: [files.bucket, files.objectKey],
      set: {
        userId: session.userId || null,
        letterId: letter.id,
        kind: "letter_plain_text",
        status: "ready"
      }
    });
    await db.insert(files).values({
      id: crypto.randomUUID(),
      tenantId: TENANT_ID,
      userId: session.userId || null,
      letterId: letter.id,
      bucket: buckets.xiabiFiles.bucket_name,
      objectKey: docxObjectKey,
      kind: "letter_docx",
      status: "ready"
    }).onConflictDoUpdate({
      target: [files.bucket, files.objectKey],
      set: {
        userId: session.userId || null,
        letterId: letter.id,
        kind: "letter_docx",
        status: "ready"
      }
    });
    await db.update(salesLetters).set({ exportedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }).where(eq(salesLetters.id, letter.id));
    await db.insert(auditLogs).values({
      id: crypto.randomUUID(),
      tenantId: TENANT_ID,
      actorId: session.id,
      actorType: session.userId ? "user_session" : "guest_session",
      action: "letter.export",
      targetType: "sales_letter",
      targetId: letter.id,
      detailJson: JSON.stringify({
        formats: ["print_html", "plain_text", "docx"],
        objectKey,
        textObjectKey,
        docxObjectKey
      })
    });
    const { downloadUrl } = await storage.from(buckets.xiabiFiles).createPresignedGetUrl(objectKey, 3600);
    const { downloadUrl: textDownloadUrl } = await storage.from(buckets.xiabiFiles).createPresignedGetUrl(textObjectKey, 3600);
    const { downloadUrl: docxDownloadUrl } = await storage.from(buckets.xiabiFiles).createPresignedGetUrl(docxObjectKey, 3600);
    return ok(c, {
      downloadUrl,
      objectKey,
      fileType: "print_html",
      contentType: "text/html; charset=utf-8",
      filename,
      textDownloadUrl,
      textObjectKey,
      textFileType: "plain_text",
      textContentType: "text/plain; charset=utf-8",
      textFilename,
      docxDownloadUrl,
      docxObjectKey,
      docxFileType: "docx",
      docxContentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      docxFilename,
      expiresInSeconds: 3600
    });
  });
