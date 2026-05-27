import fs from "node:fs";

const files = ["h5/app.js", "h5/admin.js"];
const failures = [];
const forbiddenRuntimeMarkers = [
  "db-polling-placeholder",
  "window.prompt(",
  "phoneBound: readFlag(keys.phoneBound)",
  "annualActive: readFlag(keys.annualActive)",
  "writeFlag(keys.phoneBound",
  "writeFlag(keys.annualActive",
  "phoneBound: \"h5PhoneBound\"",
  "annualActive: \"h5AnnualActive\"",
  "phoneBound: storedState.phoneBound",
  "annualActive: storedState.annualActive",
  "${state.generationError}",
  "${state.smsNotice}",
  "${state.paymentNotice}",
  "${state.feedbackText}",
  "${state.typedText}",
  "${state.phoneInput}",
  "${state.smsCode}",
  "${state.voiceError ||",
  "${adminState.toast}",
  "${adminState.loginUsername}",
  "${adminState.loginPassword}",
  "${adminState.loginError}",
  "${adminState.adminUser.displayName",
  "adminMockConfig",
  "readAdminMockConfig",
  "XiabiMockStore",
  "const sampleAnswers",
  "state.answers.push(value ||"
];
const requiredMarkers = [
  {
    file: "h5/app.js",
    marker: "answerItems: currentAnswerItems()",
    message: "generation task must send structured question/answer context"
  },
  {
    file: "server/src/adapters/letter/deepseek.ts",
    marker: "input.input?.answerItems",
    message: "DeepSeek brief must read structured question/answer context"
  },
  {
    file: "server/src/routes/tasks.ts",
    marker: "HOURLY_GENERATION_LIMIT",
    message: "public generation task creation must be rate-limited"
  },
  {
    file: "server/src/routes/tasks.ts",
    marker: "answer_too_long",
    message: "public generation task creation must reject oversized answers before queuing"
  },
  {
    file: "server/src/routes/admin.ts",
    marker: "ADMIN_LOGIN_FAILURE_LIMIT",
    message: "admin login must rate-limit repeated failed attempts"
  }
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
  for (const file of ["h5/app.js", "h5/admin.js", "h5/store.js", "server/src/adapters/task/index.ts", "server/src/routes/tasks.ts"]) {
    const source = fs.readFileSync(file, "utf8");
    if (source.includes(marker)) failures.push(`${file} still contains runtime placeholder marker: ${marker}`);
  }
}

for (const requirement of requiredMarkers) {
  const source = fs.readFileSync(requirement.file, "utf8");
  if (!source.includes(requirement.marker)) {
    failures.push(`${requirement.file} missing required marker: ${requirement.message}`);
  }
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("UI action coverage check passed.");
