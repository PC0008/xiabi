import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
const required = [
  "h5/index.html",
  "h5/admin.html",
  "h5/app.js",
  "h5/admin.js",
  "h5/mock-store.js",
  "h5/styles.css",
  "h5/admin.css",
  "assets/ui/zhiduoxing-call-avatar.png"
];

for (const item of required) {
  const fullPath = path.join(root, item);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Missing required web source: ${item}`);
  }
}

console.log("Static web source check passed.");
