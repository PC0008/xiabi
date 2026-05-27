import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
const h5 = path.join(root, "h5");
const assets = path.join(root, "assets");
const dist = path.join(root, "web", "dist");

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const sourcePath = path.join(from, entry.name);
    const targetPath = path.join(to, entry.name);
    if (entry.isDirectory()) copyDir(sourcePath, targetPath);
    else if (entry.isFile()) fs.copyFileSync(sourcePath, targetPath);
  }
}

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });

for (const file of fs.readdirSync(h5, { withFileTypes: true })) {
  if (!file.isFile() || file.name === "server.js") continue;
  fs.copyFileSync(path.join(h5, file.name), path.join(dist, file.name));
}

copyDir(assets, path.join(dist, "assets"));

fs.writeFileSync(path.join(dist, "DEPLOY_README.md"), [
  "# Xiabi Edgespark web bundle",
  "",
  "- User entry: /index.html",
  "- Admin entry: /admin.html",
  "- API base: /api/public",
  "",
  "Secrets must be configured through EdgeSpark secret commands, not frontend files."
].join("\n"));

console.log(`Built static web bundle at ${dist}`);
