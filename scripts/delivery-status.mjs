import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const readinessPath = process.env.XIABI_DELIVERY_READINESS_PATH
  ? path.resolve(process.env.XIABI_DELIVERY_READINESS_PATH)
  : path.join(root, "docs", "production-readiness-latest.md");
const outputPath = process.env.XIABI_DELIVERY_OUTPUT_PATH
  ? path.resolve(process.env.XIABI_DELIVERY_OUTPUT_PATH)
  : path.join(root, "docs", "delivery-status-latest.md");
const finalPreflightPath = path.join(root, "docs", "final-preflight-latest.md");
const preflightReadinessPath = path.join(root, "docs", "production-readiness-preflight-latest.md");
const preflightDeliveryPath = path.join(root, "docs", "delivery-status-preflight-latest.md");

const statusOrder = {
  "失败": 0,
  "外部阻塞": 1,
  "待输入": 2,
  "已验证": 3
};

const manualBatches = [
  {
    title: "后台账号、后台控制前台与供应商前置自检",
    owner: "项目管理员",
    needs: "后台账号、后台密码；该批次不发送短信、不创建订单，会自检短信签名/模板和微信支付证书",
    command: [
      '$env:XIABI_VERIFY_ADMIN_USERNAME="后台账号"',
      '$env:XIABI_VERIFY_ADMIN_PASSWORD="后台密码"',
      '$env:XIABI_PRODUCTION_STRICT="1"',
      "npm run verify:production:report"
    ]
  },
  {
    title: "DeepSeek 写信、权益、导出与 MiniMax 说话",
    owner: "项目验收",
    needs: "允许消耗一次 DeepSeek 和 MiniMax TTS 调用额度",
    command: [
      '$env:XIABI_VERIFY_DEEPSEEK="1"',
      '$env:XIABI_VERIFY_REPEAT_FREE="1"',
      '$env:XIABI_VERIFY_TTS="1"',
      "npm run verify:production:report"
    ]
  },
  {
    title: "阿里云短信与手机号绑定",
    owner: "项目管理员",
    needs: "可接收验证码的真实手机号、短信验证码",
    command: [
      '$env:XIABI_VERIFY_ADMIN_USERNAME="后台账号"',
      '$env:XIABI_VERIFY_ADMIN_PASSWORD="后台密码"',
      '$env:XIABI_VERIFY_DEEPSEEK="1"',
      '$env:XIABI_VERIFY_SMS_PHONE="可接收验证码的手机号"',
      "npm run verify:production:report",
      "",
      '$env:XIABI_VERIFY_SMS_CODE="收到的6位验证码"',
      "npm run verify:production:report"
    ]
  },
  {
    title: "微信支付下单权限",
    owner: "微信商户平台管理员",
    needs: "H5 支付或 JSAPI 支付产品权限",
    command: [
      '$env:XIABI_VERIFY_ADMIN_USERNAME="后台账号"',
      '$env:XIABI_VERIFY_ADMIN_PASSWORD="后台密码"',
      '$env:XIABI_VERIFY_PAYMENT_CREATE="1"',
      '$env:XIABI_VERIFY_ALLOW_EXTERNAL_BLOCKED="1"',
      "npm run verify:production:report"
    ]
  },
  {
    title: "微信真实付款、回调与权益到账",
    owner: "项目管理员",
    needs: "已完成真实付款的订单 ID",
    command: [
      '$env:XIABI_VERIFY_ADMIN_USERNAME="后台账号"',
      '$env:XIABI_VERIFY_ADMIN_PASSWORD="后台密码"',
      '$env:XIABI_VERIFY_PAID_ORDER_ID="已完成付款的订单ID"',
      '$env:XIABI_VERIFY_REQUIRE_WEBHOOK="1"',
      "npm run verify:production:report"
    ]
  },
  {
    title: "语音输入 ASR 样本与微信内按住说话",
    owner: "语音供应商/项目管理员",
    needs: "服务端路径需要可用 VOICE_ASR_ENDPOINT、真实音频样本、预期关键句；微信内路径需要 WECHAT_MP_APP_SECRET、公众号 JS 接口安全域名，并在微信里按住说话确认能返回文本",
    command: [
      "# 服务端 ASR 路径",
      '$env:XIABI_VERIFY_ASR_AUDIO="D:\\path\\to\\sample.wav"',
      '$env:XIABI_VERIFY_ASR_EXPECTED_TEXT="样本音频里应出现的关键句"',
      "npm run verify:production:report",
      "",
      "# 微信内 H5 路径",
      '$env:XIABI_VERIFY_WECHAT_VOICE="1"',
      "npm run verify:production:report",
      "",
      "# 手机微信实测通过后",
      '$env:XIABI_VERIFY_WECHAT_VOICE_MANUAL="1"',
      "npm run verify:production:report"
    ]
  }
];

function parseSummary(markdown) {
  const summary = {};
  for (const [key, pattern] of [
    ["generatedAt", /^生成时间：(.+)$/m],
    ["baseUrl", /^线上地址：(.+)$/m],
    ["overall", /^整体结果：(.+)$/m],
    ["complete", /^完整可用：(.+)$/m],
    ["verified", /^- 已验证：(.+)$/m],
    ["pendingInput", /^- 待输入：(.+)$/m],
    ["externalBlocked", /^- 外部阻塞：(.+)$/m],
    ["failed", /^- 失败：(.+)$/m]
  ]) {
    const match = markdown.match(pattern);
    summary[key] = match ? match[1].trim() : "";
  }
  return summary;
}

function parseMatrix(markdown) {
  const lines = markdown.split(/\r?\n/);
  const rows = [];
  let inTable = false;
  for (const line of lines) {
    if (line.startsWith("| 能力 | 状态 | 证据 | 下一步 |")) {
      inTable = true;
      continue;
    }
    if (!inTable) continue;
    if (line.startsWith("| ---")) continue;
    if (!line.startsWith("| ")) break;
    const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
    if (cells.length === 4) {
      rows.push({
        capability: cells[0],
        status: cells[1],
        evidence: cells[2],
        next: cells[3]
      });
    }
  }
  return rows.sort((a, b) => (statusOrder[a.status] ?? 99) - (statusOrder[b.status] ?? 99));
}

function renderCommand(lines) {
  return ["```powershell", ...lines, "```"].join("\n");
}

async function readCurrentPreflightSnapshot() {
  if (path.resolve(readinessPath) === path.resolve(preflightReadinessPath)) return null;
  try {
    const [finalPreflight, preflightReadiness] = await Promise.all([
      fs.readFile(finalPreflightPath, "utf8"),
      fs.readFile(preflightReadinessPath, "utf8")
    ]);
    const finalGeneratedAt = finalPreflight.match(/^生成时间：(.+)$/m)?.[1]?.trim() || "";
    const finalResult = finalPreflight.match(/^整体结果：(.+)$/m)?.[1]?.trim() || "";
    const preflightSummary = parseSummary(preflightReadiness);
    return {
      finalGeneratedAt,
      finalResult,
      readinessGeneratedAt: preflightSummary.generatedAt,
      overall: preflightSummary.overall,
      verified: preflightSummary.verified,
      pendingInput: preflightSummary.pendingInput,
      externalBlocked: preflightSummary.externalBlocked,
      failed: preflightSummary.failed
    };
  } catch {
    return null;
  }
}

async function main() {
  const markdown = await fs.readFile(readinessPath, "utf8");
  const summary = parseSummary(markdown);
  const matrix = parseMatrix(markdown);
  const remaining = matrix.filter((item) => item.status !== "已验证");
  const preflightSnapshot = await readCurrentPreflightSnapshot();
  const lines = [
    "# 最终交付状态清单",
    "",
    `生成时间：${new Date().toISOString()}`,
    `来源报告：${path.relative(root, readinessPath).replace(/\\/g, "/")}`,
    `来源报告生成时间：${summary.generatedAt || "未读取到"}`,
    `线上地址：${summary.baseUrl || "未读取到"}`,
    "",
    "## 当前结论",
    "",
    `- 完整可用：${summary.complete || "未读取到"}`,
    `- 整体结果：${summary.overall || "未读取到"}`,
    `- 已验证：${summary.verified || "0"}`,
    `- 待输入：${summary.pendingInput || "0"}`,
    `- 外部阻塞：${summary.externalBlocked || "0"}`,
    `- 失败：${summary.failed || "0"}`,
    ""
  ];
  if (preflightSnapshot) {
    lines.push(
      "## 当前代码预检快照",
      "",
      `- 预检报告：${path.relative(root, finalPreflightPath).replace(/\\/g, "/")}`,
      `- 预检生成时间：${preflightSnapshot.finalGeneratedAt || "未读取到"}`,
      `- 预检结果：${preflightSnapshot.finalResult || "未读取到"}`,
      `- 预检生产基础报告：${path.relative(root, preflightReadinessPath).replace(/\\/g, "/")}`,
      `- 预检基础状态：${preflightSnapshot.overall || "未读取到"}`,
      `- 预检统计：已验证 ${preflightSnapshot.verified || "0"} / 待输入 ${preflightSnapshot.pendingInput || "0"} / 外部阻塞 ${preflightSnapshot.externalBlocked || "0"} / 失败 ${preflightSnapshot.failed || "0"}`,
      `- 预检交付清单：${path.relative(root, preflightDeliveryPath).replace(/\\/g, "/")}`,
      "",
      "说明：本节只证明当前代码、线上基础接口和移动端旅程的无外部费用预检状态；上方正式结论仍以真实外部联调报告为准。",
      ""
    );
  }
  lines.push(
    "## 剩余验收项",
    "",
    "| 能力 | 当前状态 | 下一步 |",
    "| --- | --- | --- |"
  );
  if (remaining.length) {
    for (const item of remaining) {
      lines.push(`| ${item.capability} | ${item.status} | ${item.next || "等待最终复验。"} |`);
    }
  } else {
    lines.push("| 全部能力 | 已验证 | 可以准备最终交付。 |");
  }
  lines.push(
    "",
    "## 最终人工验证批次",
    "",
    "以下命令只在最终交付验收时执行。它们可能真实调用 DeepSeek、短信、微信支付、MiniMax 或 ASR 服务；不要把真实密钥写入仓库。"
  );
  for (const batch of manualBatches) {
    lines.push(
      "",
      `### ${batch.title}`,
      "",
      `- 责任方：${batch.owner}`,
      `- 需要准备：${batch.needs}`,
      "",
      renderCommand(batch.command)
    );
  }
  lines.push(
    "",
    "## 判定规则",
    "",
    "- `npm run verify:production` 返回 `complete=true`，才表示目标进入完整真实运行状态。",
    "- `ok=true` 只代表本次执行的检查没有失败，不代表所有外部链路都已经验收。",
    "- MiniMax 官方当前未公开独立 ASR/STT 端点；只有拿到可用 `VOICE_ASR_ENDPOINT` 并通过真实音频样本后，才应设置 `VOICE_ASR_VERIFIED=1`。",
    "- 微信内 H5 语音输入需要 `WECHAT_MP_APP_SECRET`、公众号 JS 接口安全域名和手机微信实测；仅拿到 JS-SDK 签名不等于已经完成手机端语音验收。",
    ""
  );
  await fs.writeFile(outputPath, lines.join("\n"), "utf8");
  console.log(`Delivery status written to ${path.relative(root, outputPath)}`);
  console.log(`Remaining items: ${remaining.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
