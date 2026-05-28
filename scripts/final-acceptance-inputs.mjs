import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const outputPath = path.join(root, "docs", "final-acceptance-inputs-latest.md");
const readinessPath = path.join(root, "docs", "production-readiness-latest.md");
const deliveryPath = path.join(root, "docs", "delivery-status-latest.md");
const preflightPath = path.join(root, "docs", "final-preflight-latest.md");

const batches = [
  {
    title: "后台账号、后台控制前台与供应商前置自检",
    externalEffect: "不发短信、不创建订单、不调用模型",
    required: ["XIABI_VERIFY_ADMIN_USERNAME", "XIABI_VERIFY_ADMIN_PASSWORD"],
    optional: ["XIABI_PRODUCTION_STRICT"],
    unlocks: ["管理后台登录与运营接口", "后台配置控制用户端", "短信供应商无发码自检", "微信支付无订单自检"],
    command: [
      '$env:XIABI_VERIFY_ADMIN_USERNAME="后台账号"',
      '$env:XIABI_VERIFY_ADMIN_PASSWORD="后台密码"',
      '$env:XIABI_PRODUCTION_STRICT="1"',
      "npm run verify:production:report"
    ]
  },
  {
    title: "DeepSeek 写信、权益、导出与 MiniMax 说话",
    externalEffect: "会真实调用 DeepSeek 和 MiniMax TTS，可能消耗额度",
    required: ["XIABI_VERIFY_DEEPSEEK", "XIABI_VERIFY_REPEAT_FREE", "XIABI_VERIFY_TTS"],
    optional: [],
    unlocks: ["DeepSeek 写信闭环", "首次免费权益与导出", "重复领取限制", "MiniMax 说话播放"],
    command: [
      '$env:XIABI_VERIFY_DEEPSEEK="1"',
      '$env:XIABI_VERIFY_REPEAT_FREE="1"',
      '$env:XIABI_VERIFY_TTS="1"',
      "npm run verify:production:report"
    ]
  },
  {
    title: "真实短信发送、验证码绑定与资产归属",
    externalEffect: "会真实发送短信；收到验证码后需要第二次运行",
    required: [
      "XIABI_VERIFY_ADMIN_USERNAME",
      "XIABI_VERIFY_ADMIN_PASSWORD",
      "XIABI_VERIFY_DEEPSEEK",
      "XIABI_VERIFY_SMS_PHONE"
    ],
    optional: ["XIABI_VERIFY_SMS_CODE"],
    unlocks: ["短信发送与手机号绑定", "短信发送审计链路", "手机号绑定后资产归属"],
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
    title: "微信支付下单与支付审计",
    externalEffect: "会真实向微信支付创建未支付订单；当前仍依赖商户产品权限",
    required: [
      "XIABI_VERIFY_ADMIN_USERNAME",
      "XIABI_VERIFY_ADMIN_PASSWORD",
      "XIABI_VERIFY_PAYMENT_CREATE"
    ],
    optional: ["XIABI_VERIFY_ALLOW_EXTERNAL_BLOCKED"],
    unlocks: ["微信支付下单", "微信支付拉起审计链路"],
    command: [
      '$env:XIABI_VERIFY_ADMIN_USERNAME="后台账号"',
      '$env:XIABI_VERIFY_ADMIN_PASSWORD="后台密码"',
      '$env:XIABI_VERIFY_PAYMENT_CREATE="1"',
      '$env:XIABI_VERIFY_ALLOW_EXTERNAL_BLOCKED="1"',
      "npm run verify:production:report"
    ]
  },
  {
    title: "真实付款、回调与权益到账",
    externalEffect: "需要先完成一笔真实小额付款；会复验回调/查单补偿和幂等发权益",
    required: [
      "XIABI_VERIFY_ADMIN_USERNAME",
      "XIABI_VERIFY_ADMIN_PASSWORD",
      "XIABI_VERIFY_PAID_ORDER_ID"
    ],
    optional: ["XIABI_VERIFY_REQUIRE_WEBHOOK"],
    unlocks: ["微信付款回调与权益到账", "重复补发不重复加权益"],
    command: [
      '$env:XIABI_VERIFY_ADMIN_USERNAME="后台账号"',
      '$env:XIABI_VERIFY_ADMIN_PASSWORD="后台密码"',
      '$env:XIABI_VERIFY_PAID_ORDER_ID="已完成付款的订单ID"',
      '$env:XIABI_VERIFY_REQUIRE_WEBHOOK="1"',
      "npm run verify:production:report"
    ]
  },
  {
    title: "服务端 ASR 音频样本与手机端语音入口",
    externalEffect: "会真实调用已配置的 ASR endpoint；微信内语音还需要手机微信实测",
    required: ["XIABI_VERIFY_ASR_AUDIO"],
    optional: ["XIABI_VERIFY_ASR_EXPECTED_TEXT"],
    deployment: ["VOICE_ASR_ENDPOINT", "VOICE_ASR_VERIFIED", "VOICE_INPUT_MODE"],
    unlocks: ["语音输入转写", "手机端按住说话服务端转写入口"],
    command: [
      '$env:XIABI_VERIFY_ASR_AUDIO="D:\\path\\to\\sample.wav"',
      '$env:XIABI_VERIFY_ASR_EXPECTED_TEXT="样本音频里应出现的关键句"',
      "npm run verify:production:report"
    ]
  },
  {
    title: "微信内 H5 语音 JS-SDK 人工验收",
    externalEffect: "不由本脚本自动调用；需要在手机微信中打开线上地址按住说话",
    required: [],
    optional: [],
    deployment: ["WECHAT_MP_APP_SECRET", "PUBLIC_BASE_URL", "微信公众平台 JS 接口安全域名"],
    unlocks: ["微信内录音与 translateVoice 返回文字"],
    command: [
      "# 在手机微信打开线上用户端",
      "# 按住说话，确认能返回真实文本并进入确认页"
    ]
  }
];

function hasEnv(name) {
  return typeof process.env[name] === "string" && process.env[name].trim() !== "";
}

function envStatus(name) {
  return hasEnv(name) ? "已设置" : "缺少";
}

function batchStatus(batch) {
  const missing = batch.required.filter((name) => !hasEnv(name));
  if (!batch.required.length && batch.deployment?.length) return "需人工确认";
  return missing.length ? "未就绪" : "可执行";
}

function renderCommand(lines) {
  return ["```powershell", ...lines, "```"].join("\n");
}

async function readSummary(filePath) {
  try {
    const content = await fs.readFile(filePath, "utf8");
    return {
      exists: true,
      generatedAt: content.match(/^生成时间：(.+)$/m)?.[1]?.trim() || "",
      overall: content.match(/^整体结果：(.+)$/m)?.[1]?.trim() || "",
      complete: content.match(/^完整可用：(.+)$/m)?.[1]?.trim() || "",
      verified: content.match(/^- 已验证：(.+)$/m)?.[1]?.trim() || "",
      pendingInput: content.match(/^- 待输入：(.+)$/m)?.[1]?.trim() || "",
      externalBlocked: content.match(/^- 外部阻塞：(.+)$/m)?.[1]?.trim() || "",
      failed: content.match(/^- 失败：(.+)$/m)?.[1]?.trim() || ""
    };
  } catch {
    return { exists: false };
  }
}

async function main() {
  const [readiness, delivery, preflight] = await Promise.all([
    readSummary(readinessPath),
    readSummary(deliveryPath),
    readSummary(preflightPath)
  ]);
  const readyBatches = batches.filter((batch) => batchStatus(batch) === "可执行").length;
  const missingNames = new Set();
  for (const batch of batches) {
    for (const name of batch.required) {
      if (!hasEnv(name)) missingNames.add(name);
    }
  }

  const lines = [
    "# 最终验收输入检查",
    "",
    `生成时间：${new Date().toISOString()}`,
    "",
    "## 当前报告快照",
    "",
    `- 生产验收报告：${readiness.exists ? "已找到" : "缺少"}${readiness.generatedAt ? `，生成时间 ${readiness.generatedAt}` : ""}`,
    `- 生产结论：${readiness.overall || "未读取到"}`,
    `- 完整可用：${readiness.complete || "未读取到"}`,
    `- 正式矩阵：已验证 ${readiness.verified || "0"} / 待输入 ${readiness.pendingInput || "0"} / 外部阻塞 ${readiness.externalBlocked || "0"} / 失败 ${readiness.failed || "0"}`,
    `- 交付状态清单：${delivery.exists ? "已找到" : "缺少"}${delivery.generatedAt ? `，生成时间 ${delivery.generatedAt}` : ""}`,
    `- 无外部费用预检：${preflight.exists ? "已找到" : "缺少"}${preflight.generatedAt ? `，生成时间 ${preflight.generatedAt}` : ""}`,
    "",
    "## 本机输入准备度",
    "",
    `- 可直接执行的最终验收批次：${readyBatches}/${batches.length}`,
    `- 当前仍缺少的 verifier 输入：${missingNames.size ? Array.from(missingNames).join("、") : "无"}`,
    "",
    "说明：本脚本只检查环境变量是否已准备，不打印任何真实账号、密码、手机号、订单号、密钥或音频路径，也不会调用外部服务。",
    "",
    "## 分批检查",
    ""
  ];

  for (const batch of batches) {
    const status = batchStatus(batch);
    lines.push(
      `### ${batch.title}`,
      "",
      `- 状态：${status}`,
      `- 外部影响：${batch.externalEffect}`,
      `- 可验收能力：${batch.unlocks.join("、")}`
    );
    if (batch.required.length) {
      lines.push(`- 必需输入：${batch.required.map((name) => `${name}（${envStatus(name)}）`).join("、")}`);
    }
    if (batch.optional.length) {
      lines.push(`- 可选输入：${batch.optional.map((name) => `${name}（${envStatus(name)}）`).join("、")}`);
    }
    if (batch.deployment?.length) {
      lines.push(`- 线上/平台前置项：${batch.deployment.join("、")}`);
    }
    lines.push("", renderCommand(batch.command), "");
  }

  await fs.writeFile(outputPath, `${lines.join("\n")}\n`, "utf8");
  console.log(`[ok] final acceptance inputs: ready ${readyBatches}/${batches.length}; report ${path.relative(root, outputPath).replace(/\\/g, "/")}`);
  if (missingNames.size) {
    console.log(`[info] missing verifier inputs: ${Array.from(missingNames).join(", ")}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
