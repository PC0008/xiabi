import { exec } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execAsync = promisify(exec);
const baseUrl = process.env.XIABI_VERIFY_BASE_URL || "https://immortal-sponge-1728.edgespark.app";
const assetsDir = path.resolve("docs/assets");

async function assertHttp(pathname, check) {
  const response = await fetch(`${baseUrl}${pathname}`);
  const text = await response.text();
  if (!response.ok) throw new Error(`${pathname} returned ${response.status}`);
  if (check && !check(text)) throw new Error(`${pathname} returned unexpected content`);
  return { pathname, status: response.status };
}

async function screenshot(url, output, viewport) {
  const command = `npx --yes playwright screenshot --wait-for-timeout=3000 --viewport-size=${viewport} "${url}" "${output}"`;
  await execAsync(command, { windowsHide: true });
  const stat = await fs.stat(output);
  if (stat.size < 10_000) throw new Error(`${output} looks too small to be a valid screenshot`);
  return { output, size: stat.size };
}

await fs.mkdir(assetsDir, { recursive: true });

const checks = [
  await assertHttp("/api/public/health", (text) => text.includes("\"status\":\"ok\"")),
  await assertHttp("/index.html", (text) => text.includes("app.js")),
  await assertHttp("/admin.html", (text) => text.includes("admin.js")),
  await assertHttp("/api/public/config", (text) => text.includes("pricing"))
];

const screenshots = [
  await screenshot(`${baseUrl}/index.html`, path.join(assetsDir, "verify-home-mobile.png"), "390,844"),
  await screenshot(`${baseUrl}/admin.html`, path.join(assetsDir, "verify-admin-login.png"), "1440,1000")
];

console.log(JSON.stringify({ ok: true, baseUrl, checks, screenshots }, null, 2));
