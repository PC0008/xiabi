import fs from "node:fs";

const files = ["h5/app.js", "h5/admin.js"];
const failures = [];
const forbiddenRuntimeMarkers = [
  "db-polling-placeholder",
  "window.prompt("
];

function unique(values) {
  return [...new Set(values)].sort();
}

function literalAttributes(source, name) {
  return [...source.matchAll(new RegExp(`${name}="([^"]+)"`, "g"))]
    .map((match) => match[1])
    .filter((value) => !value.includes("${"));
}

for (const file of files) {
  const source = fs.readFileSync(file, "utf8");
  const actions = unique(literalAttributes(source, "data-action"));
  const handledActions = unique([...source.matchAll(/action === "([^"]+)"/g)].map((match) => match[1]));
  const missingActions = actions.filter((action) => !handledActions.includes(action));
  if (missingActions.length) failures.push(`${file} missing action handlers: ${missingActions.join(", ")}`);

  const routes = unique(literalAttributes(source, "data-go"));
  if (routes.length) {
    const renderedRoutes = new Set([
      "home",
      ...[...source.matchAll(/route === "([^"]+)"/g)].map((match) => match[1])
    ]);
    const missingRoutes = routes.filter((route) => !renderedRoutes.has(route));
    if (missingRoutes.length) failures.push(`${file} missing route renderers: ${missingRoutes.join(", ")}`);
  }
}

for (const marker of forbiddenRuntimeMarkers) {
  for (const file of ["h5/admin.js", "server/src/adapters/task/index.ts", "server/src/routes/tasks.ts"]) {
    const source = fs.readFileSync(file, "utf8");
    if (source.includes(marker)) failures.push(`${file} still contains runtime placeholder marker: ${marker}`);
  }
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("UI action coverage check passed.");
