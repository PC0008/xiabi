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

const processor = segment(publicTasks, "async function processGenerationTask", "\nexport async function runGenerationTaskInBackground", "generation task processor");
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
requireIncludes(adminRetry, "status: \"queued\"", "admin retry requeues instead of running inline");
requireIncludes(adminRetry, "retry_queued", "admin retry queued progress stage");
requireIncludes(adminRetry, "enqueueTask({ taskId: id, type: task.type })", "admin retry queue handoff");
requireIncludes(adminRetry, "ctx.runInBackground(runGenerationTaskInBackground(id))", "admin retry background worker");
requireIncludes(adminRetry, "task.retry_queued", "admin retry queued audit");
requireNotIncludes(adminRetry, "generateSalesLetterWithDeepSeek", "admin retry synchronous DeepSeek call");
requireNotIncludes(adminRetry, "await db.insert(salesLetters).values", "admin retry synchronous letter insert");

console.log("[ok] generation task polling is read-only and DeepSeek retries are queued for background execution");
