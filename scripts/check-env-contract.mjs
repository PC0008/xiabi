import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const sourceRoot = path.join(root, "server", "src");
const envExample = fs.readFileSync(path.join(root, ".env.example"), "utf8");

const envKeys = new Set(
  envExample
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => line.split("=")[0].trim())
);

const envReads = new Map();
const patterns = [
  /\bvars\.get\(\s*["']([A-Z0-9_]+)["']\s*\)/g,
  /\bsecret\.get\(\s*["']([A-Z0-9_]+)["']\s*\)/g,
  /\boptionalVar\(\s*["']([A-Z0-9_]+)["']\s*\)/g,
  /\boptionalSecret\(\s*["']([A-Z0-9_]+)["']\s*\)/g
];

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "__generated__") continue;
      walk(fullPath);
      continue;
    }
    if (!entry.isFile() || !/\.(ts|tsx|js|mjs)$/.test(entry.name)) continue;
    const source = fs.readFileSync(fullPath, "utf8");
    for (const pattern of patterns) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(source))) {
        const key = match[1];
        const refs = envReads.get(key) || [];
        refs.push(path.relative(root, fullPath).replace(/\\/g, "/"));
        envReads.set(key, refs);
      }
    }
  }
}

walk(sourceRoot);

const missing = [...envReads.keys()]
  .filter((key) => !envKeys.has(key))
  .sort();

if (missing.length) {
  for (const key of missing) {
    const refs = [...new Set(envReads.get(key) || [])].join(", ");
    console.error(`${key} is read by code but missing from .env.example (${refs})`);
  }
  process.exit(1);
}

console.log(`[ok] .env.example covers ${envReads.size} runtime variables read by server code`);
