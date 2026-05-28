import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const outputPath = path.join(root, "docs", "final-preflight-latest.md");
const readinessOutput = path.join(root, "docs", "production-readiness-preflight-latest.md");
const deliveryOutput = path.join(root, "docs", "delivery-status-preflight-latest.md");
const acceptanceInputsOutput = path.join(root, "docs", "final-acceptance-inputs-latest.md");

const steps = [
  ["typecheck", ["run", "typecheck"], "服务端与静态前端类型/源码检查"],
  ["build", ["run", "build"], "静态 Web 构建"],
  ["check:ui", ["run", "check:ui"], "用户端/后台关键交互覆盖标记"],
  ["check:env-contract", ["run", "check:env-contract"], "服务端环境变量与部署样例契约"],
  ["check:admin-config-control", ["run", "check:admin-config-control"], "后台配置真实控制用户端和服务端"],
  ["check:sensitive-output-safety", ["run", "check:sensitive-output-safety"], "供应商失败和敏感输出安全边界"],
  ["check:sms-code-safety", ["run", "check:sms-code-safety"], "短信验证码哈希安全边界"],
  ["check:generation-task-safety", ["run", "check:generation-task-safety"], "写信任务轮询与重试幂等安全门"],
  ["check:admin-permissions", ["run", "check:admin-permissions"], "后台高风险权限边界"],
  ["check:public-session-safety", ["run", "check:public-session-safety"], "公开写入与外部调用接口会话边界"],
  ["check:bind-phone-unique", ["run", "check:bind-phone-unique"], "手机号绑定唯一性与冲突回查"],
  ["check:payment-entitlement-safety", ["run", "check:payment-entitlement-safety"], "微信支付成功判定与权益发放安全门"],
  ["verify:order-payment-switch", ["run", "verify:order-payment-switch"], "支付开关和续付边界"],
  ["verify:live", ["run", "verify:live"], "线上入口/API 边界/截图巡检"],
  ["verify:journey", ["run", "verify:journey"], "移动端用户主流程旅程"],
  ["verify:production", ["run", "verify:production"], "生产基础验收，不触发外部付费调用", {
    XIABI_VERIFY_REPORT_PATH: readinessOutput
  }],
  ["acceptance:inputs", ["run", "acceptance:inputs"], "最终人工验收输入准备度清单，不触发外部付费调用", {
    XIABI_ACCEPTANCE_PREFLIGHT_IN_PROGRESS: "1"
  }],
  ["delivery:status", ["run", "delivery:status"], "最终交付状态清单生成", {
    XIABI_DELIVERY_READINESS_PATH: readinessOutput,
    XIABI_DELIVERY_OUTPUT_PATH: deliveryOutput
  }]
];

function runStep(name, args, extraEnv = {}) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const child = spawn([npmCommand, ...args].join(" "), {
      cwd: root,
      env: {
        ...process.env,
        ...extraEnv
      },
      shell: true
    });
    child.stdout.on("data", (chunk) => process.stdout.write(chunk));
    child.stderr.on("data", (chunk) => process.stderr.write(chunk));
    child.on("close", (code) => {
      resolve({
        name,
        status: code === 0 ? "passed" : "failed",
        code,
        durationMs: Date.now() - startedAt
      });
    });
  });
}

function renderReport(results) {
  const failed = results.filter((item) => item.status !== "passed");
  const lines = [
    "# 最终无外部费用预检报告",
    "",
    `生成时间：${new Date().toISOString()}`,
    `整体结果：${failed.length ? "失败" : "通过"}`,
    "",
    "## 检查项",
    "",
    "| 命令 | 状态 | 耗时 | 说明 |",
    "| --- | --- | --- | --- |"
  ];
  for (const result of results) {
    const step = steps.find(([name]) => name === result.name);
    lines.push(`| ${result.name} | ${result.status === "passed" ? "通过" : "失败"} | ${(result.durationMs / 1000).toFixed(1)}s | ${step?.[2] || ""} |`);
  }
  lines.push(
    "",
    "## 输出文件",
    "",
    `- 预检报告：${path.relative(root, outputPath).replace(/\\/g, "/")}`,
    `- 生产基础验收报告：${path.relative(root, readinessOutput).replace(/\\/g, "/")}`,
    `- 最终验收输入清单：${path.relative(root, acceptanceInputsOutput).replace(/\\/g, "/")}`,
    `- 预检交付状态清单：${path.relative(root, deliveryOutput).replace(/\\/g, "/")}`,
    "",
    "## 口径",
    "",
    "- 该预检不会主动设置 DeepSeek、短信、微信支付、MiniMax TTS 或 ASR 的真实调用环境变量。",
    "- 该预检通过只代表无外部费用的代码、线上基础和用户旅程检查通过；完整真实运行仍以 `npm run verify:production` 返回 `complete=true` 为准。",
    ""
  );
  return lines.join("\n");
}

async function main() {
  const results = [];
  for (const [name, args, description, extraEnv] of steps) {
    console.log(`\n=== ${name}: ${description} ===`);
    const result = await runStep(name, args, extraEnv);
    results.push(result);
    if (result.status !== "passed") break;
  }
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, renderReport(results), "utf8");
  console.log(`\nFinal preflight report written to ${path.relative(root, outputPath)}`);
  if (results.some((item) => item.status !== "passed")) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
