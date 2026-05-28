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
const varReads = new Map();
const secretReads = new Map();
const patterns = [
  [/\bvars\.get\(\s*["']([A-Z0-9_]+)["']\s*\)/g, varReads],
  [/\bsecret\.get\(\s*["']([A-Z0-9_]+)["']\s*\)/g, secretReads],
  [/\boptionalVar\(\s*["']([A-Z0-9_]+)["']\s*\)/g, varReads],
  [/\boptionalSecret\(\s*["']([A-Z0-9_]+)["']\s*\)/g, secretReads]
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
    for (const [pattern, typedReads] of patterns) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(source))) {
        const key = match[1];
        const relativePath = path.relative(root, fullPath).replace(/\\/g, "/");
        const refs = envReads.get(key) || [];
        refs.push(relativePath);
        envReads.set(key, refs);
        const typedRefs = typedReads.get(key) || [];
        typedRefs.push(relativePath);
        typedReads.set(key, typedRefs);
      }
    }
  }
}

walk(sourceRoot);

const runtimeTypes = fs.readFileSync(path.join(root, "server", "src", "defs", "runtime.ts"), "utf8");

function parseRuntimeUnion(typeName) {
  const match = runtimeTypes.match(new RegExp(`export type ${typeName} =([\\s\\S]*?);`));
  if (!match) throw new Error(`missing ${typeName} in server/src/defs/runtime.ts`);
  return new Set([...match[1].matchAll(/"([A-Z0-9_]+)"/g)].map((item) => item[1]));
}

const varTypes = parseRuntimeUnion("VarKey");
const secretTypes = parseRuntimeUnion("SecretKey");

function reportMissingTypedKeys(reads, declared, label) {
  const missingTypedKeys = [...reads.keys()]
    .filter((key) => !declared.has(key))
    .sort();
  for (const key of missingTypedKeys) {
    const refs = [...new Set(reads.get(key) || [])].join(", ");
    console.error(`${key} is read as ${label} but missing from server/src/defs/runtime.ts (${refs})`);
  }
  return missingTypedKeys.length;
}

const missing = [...envReads.keys()]
  .filter((key) => !envKeys.has(key))
  .sort();

let failureCount = 0;
if (missing.length) {
  for (const key of missing) {
    const refs = [...new Set(envReads.get(key) || [])].join(", ");
    console.error(`${key} is read by code but missing from .env.example (${refs})`);
  }
  failureCount += missing.length;
}

failureCount += reportMissingTypedKeys(varReads, varTypes, "VarKey");
failureCount += reportMissingTypedKeys(secretReads, secretTypes, "SecretKey");

if (failureCount) process.exit(1);

console.log(`[ok] .env.example and runtime types cover ${envReads.size} runtime variables read by server code`);
