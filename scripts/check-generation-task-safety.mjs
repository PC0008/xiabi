import fs from "node:fs";

const publicTasks = fs.readFileSync("server/src/routes/tasks.ts", "utf8");
const adminRoutes = fs.readFileSync("server/src/routes/admin.ts", "utf8");

function fail(message) {
  throw new Error(`generation task safety verification failed: ${message}`);
}

function requireIncludes(source, needle, label) {
  if (!source.includes(needle)) fail(`missing ${label}`);
}

function requireNotIncludes(source, needle, label) {
  if (source.includes(needle)) fail(`forbidden ${label}`);
}

function requireBefore(source, beforeNeedle, afterNeedle, label) {
  const beforeIndex = source.indexOf(beforeNeedle);
  const afterIndex = source.indexOf(afterNeedle);
  if (beforeIndex === -1) fail(`missing ${label} guard`);
  if (afterIndex === -1) fail(`missing ${label} target`);
  if (beforeIndex > afterIndex) fail(`${label} guard runs after target`);
}

function segment(source, startNeedle, endNeedle, label) {
  const start = source.indexOf(startNeedle);
  const end = source.indexOf(endNeedle, start + startNeedle.length);
  if (start === -1 || end === -1) fail(`missing ${label}`);
  return source.slice(start, end);
}

const publicPolling = segment(publicTasks, ".get(\"/:id\"", "\n  });", "public task polling route");
requireNotIncludes(publicPolling, "processGenerationTask(", "task polling generation trigger");
requireNotIncludes(publicPolling, "generateSalesLetterWithDeepSeek", "task polling DeepSeek call");

const processor = segment(publicTasks, "async function processGenerationTask", "\nasync function runGenerationTaskInBackground", "generation task processor");
requireIncludes(processor, "if (task.status === \"succeeded\" || task.status === \"failed\") return task;", "terminal task no-op");
requireIncludes(processor, "status: \"failed\"", "stale running tasks fail closed");
requireIncludes(processor, "eq(generationTasks.status, \"queued\")", "queued-only worker lock");
requireBefore(processor, "const [currentTask] = await db.select().from(generationTasks)", "await db.insert(salesLetters).values", "post-provider state recheck before public letter insert");
requireIncludes(processor, "currentTask.status !== \"running\"", "public retry state guard");
requireIncludes(processor, "currentTask.updatedAt !== lockedTask.updatedAt", "public worker lease guard");
requireIncludes(processor, "currentTask.letterId", "public duplicate letter guard");

const adminRetry = segment(adminRoutes, ".post(\"/tasks/:id/retry\"", "\n  .get(\"/orders\"", "admin task retry route");
requireIncludes(adminRetry, "if (task.status !== \"failed\")", "failed-only admin retry");
requireIncludes(adminRetry, "eq(generationTasks.status, \"failed\")", "admin failed-only lock");
requireBefore(adminRetry, "const [currentTask] = await db.select().from(generationTasks)", "await db.insert(salesLetters).values", "post-provider state recheck before admin retry letter insert");
requireIncludes(adminRetry, "currentTask.status !== \"running\"", "admin retry state guard");
requireIncludes(adminRetry, "currentTask.updatedAt !== lockedTask.updatedAt", "admin retry lease guard");
requireIncludes(adminRetry, "task.retry_conflict", "admin retry conflict audit");

console.log("[ok] generation task polling is read-only and DeepSeek retries cannot insert stale duplicate letters");
