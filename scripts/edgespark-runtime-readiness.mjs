import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = process.cwd();
const outputPath = path.join(root, "docs", "edgespark-runtime-readiness-latest.md");

const requirements = [
  {
    key: "admin",
    title: "管理员登录",
    vars: ["ADMIN_INITIAL_USERNAME"],
    secrets: ["ADMIN_PASSWORD_PEPPER"],
    optionalSecrets: ["ADMIN_INITIAL_PASSWORD"],
    verifies: ["管理后台登录", "管理员账号安全"]
  },
  {
    key: "deepseek",
    title: "DeepSeek 写信",
    vars: ["LETTER_PROVIDER", "DEEPSEEK_MODEL", "DEEPSEEK_BASE_URL"],
    secrets: ["DEEPSEEK_API_KEY"],
    verifies: ["DeepSeek 写信闭环", "异步写信任务"]
  },
  {
    key: "wechat_pay",
    title: "微信支付",
    vars: ["PAYMENT_PROVIDER", "PUBLIC_BASE_URL", "PAYMENT_NOTIFY_URL", "WECHAT_PAY_APP_ID", "WECHAT_PAY_MCH_ID"],
    optionalVars: ["WECHAT_MP_APP_ID"],
    secrets: ["WECHAT_PAY_PRIVATE_KEY", "WECHAT_PAY_CERT_SERIAL_NO", "WECHAT_PAY_API_V3_KEY"],
    optionalSecrets: ["WECHAT_PAY_PLATFORM_PUBLIC_KEY", "WECHAT_PAY_PLATFORM_CERT_SERIAL_NO", "WECHAT_MP_APP_SECRET"],
    verifies: ["微信 H5 支付下单", "微信支付回调验签", "订单权益到账"]
  },
  {
    key: "wechat_voice",
    title: "微信内 H5 语音输入",
    vars: ["PUBLIC_BASE_URL"],
    optionalVars: ["WECHAT_MP_APP_ID", "WECHAT_PAY_APP_ID"],
    secrets: ["WECHAT_MP_APP_SECRET"],
    external: ["微信公众平台 JS 接口安全域名"],
    verifies: ["微信 JS-SDK 签名", "手机微信按住说话"]
  },
  {
    key: "sms",
    title: "阿里云短信",
    vars: ["SMS_PROVIDER", "SMS_ALIYUN_SIGN_NAME", "SMS_ALIYUN_TEMPLATE_CODE"],
    secrets: ["SMS_API_KEY", "SMS_API_SECRET"],
    optionalSecrets: ["SMS_CODE_PEPPER"],
    verifies: ["短信发送", "手机号绑定"]
  },
  {
    key: "minimax_tts",
    title: "MiniMax 说话播放",
    vars: ["VOICE_PROVIDER", "MINIMAX_GROUP_ID", "MINIMAX_VOICE_ID", "MINIMAX_TTS_ENDPOINT", "MINIMAX_TTS_OUTPUT_FORMAT", "MINIMAX_TTS_MODEL"],
    secrets: ["VOICE_API_KEY"],
    verifies: ["智多星说话播放"]
  },
  {
    key: "server_asr",
    title: "服务端 ASR 语音输入",
    vars: ["VOICE_ASR_ENDPOINT", "VOICE_ASR_VERIFIED"],
    optionalVars: ["VOICE_ASR_PROVIDER", "VOICE_ASR_MODEL", "VOICE_ASR_REQUEST_FORMAT", "VOICE_INPUT_MODE"],
    optionalSecrets: ["VOICE_ASR_API_KEY", "VOICE_API_KEY"],
    verifies: ["浏览器不支持语音识别时的录音转写"]
  },
  {
    key: "runtime",
    title: "部署运行地址",
    vars: ["PUBLIC_BASE_URL", "TASK_QUEUE_NAME"],
    verifies: ["线上回跳", "异步任务队列"]
  }
];

const acceptanceBatches = [
  {
    title: "后台账号、后台控制前台与供应商前置自检",
    needsGroups: ["admin", "deepseek", "wechat_pay", "sms", "minimax_tts"],
    verifierInputs: ["XIABI_VERIFY_ADMIN_USERNAME", "XIABI_VERIFY_ADMIN_PASSWORD"]
  },
  {
    title: "DeepSeek 写信、权益、导出与 MiniMax 说话",
    needsGroups: ["deepseek", "minimax_tts"],
    verifierInputs: ["XIABI_VERIFY_DEEPSEEK", "XIABI_VERIFY_REPEAT_FREE", "XIABI_VERIFY_TTS"]
  },
  {
    title: "真实短信发送、验证码绑定与资产归属",
    needsGroups: ["sms", "deepseek"],
    verifierInputs: ["XIABI_VERIFY_SMS_PHONE", "XIABI_VERIFY_SMS_CODE"]
  },
  {
    title: "微信支付下单与支付审计",
    needsGroups: ["wechat_pay"],
    verifierInputs: ["XIABI_VERIFY_PAYMENT_CREATE"]
  },
  {
    title: "微信真实付款、回调与权益到账",
    needsGroups: ["wechat_pay"],
    verifierInputs: ["XIABI_VERIFY_PAID_ORDER_ID"]
  },
  {
    title: "服务端 ASR 音频样本",
    needsGroups: ["server_asr"],
    verifierInputs: ["XIABI_VERIFY_ASR_AUDIO", "XIABI_VERIFY_ASR_EXPECTED_TEXT"]
  },
  {
    title: "微信内 H5 语音 JS-SDK 与手机实测",
    needsGroups: ["wechat_voice"],
    verifierInputs: ["XIABI_VERIFY_WECHAT_VOICE", "XIABI_VERIFY_WECHAT_VOICE_MANUAL"]
  }
];

function runEdgespark(args) {
  const command = process.platform === "win32" ? "cmd.exe" : "edgespark";
  const commandArgs = process.platform === "win32" ? ["/c", "edgespark", ...args] : args;
  return execFileAsync(command, commandArgs, {
    cwd: root,
    windowsHide: true,
    maxBuffer: 1024 * 1024
  });
}

function parseKeysFromCliTable(output) {
  const keys = new Set();
  for (const line of output.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("- ") || trimmed.startsWith("√") || trimmed.startsWith("KEY ") || trimmed.startsWith("─") || trimmed.startsWith("Done ")) {
      continue;
    }
    const match = trimmed.match(/^([A-Z][A-Z0-9_]+)/);
    if (match) keys.add(match[1]);
  }
  return keys;
}

function missingFrom(keys, names = []) {
  return names.filter((name) => !keys.has(name));
}

function presentFrom(keys, names = []) {
  return names.filter((name) => keys.has(name));
}

function statusFor(group, vars, secrets) {
  const missingRequiredVars = missingFrom(vars, group.vars);
  const missingRequiredSecrets = missingFrom(secrets, group.secrets);
  const missing = [...missingRequiredVars, ...missingRequiredSecrets];
  const optionalNames = [...(group.optionalVars || []), ...(group.optionalSecrets || [])];
  const missingOptional = [
    ...missingFrom(vars, group.optionalVars),
    ...missingFrom(secrets, group.optionalSecrets)
  ];
  if (missing.length) return { status: "未就绪", missing, missingOptional };
  if (missingOptional.length && optionalNames.length) return { status: "可运行但有可选缺口", missing: [], missingOptional };
  return { status: "已配置", missing: [], missingOptional: [] };
}

function groupMapFrom(results) {
  return new Map(results.map((item) => [item.key, item]));
}

function batchStatus(batch, groups) {
  const blockers = [];
  for (const key of batch.needsGroups) {
    const group = groups.get(key);
    if (!group || group.status === "未就绪") blockers.push(group?.title || key);
  }
  return {
    status: blockers.length ? "平台配置未就绪" : "平台配置已具备",
    blockers
  };
}

function renderNameList(names) {
  return names.length ? names.map((name) => `\`${name}\``).join("、") : "无";
}

function renderStatus(status) {
  if (status === "已配置") return "已配置";
  if (status === "可运行但有可选缺口") return "可运行但有可选缺口";
  return "未就绪";
}

async function main() {
  const [varResult, secretResult] = await Promise.all([
    runEdgespark(["var", "list"]),
    runEdgespark(["secret", "list"])
  ]);
  const vars = parseKeysFromCliTable(varResult.stdout);
  const secrets = parseKeysFromCliTable(secretResult.stdout);
  const groupResults = requirements.map((group) => ({
    ...group,
    ...statusFor(group, vars, secrets),
    configuredVars: presentFrom(vars, group.vars),
    configuredOptionalVars: presentFrom(vars, group.optionalVars),
    configuredSecrets: presentFrom(secrets, group.secrets),
    configuredOptionalSecrets: presentFrom(secrets, group.optionalSecrets)
  }));
  const groups = groupMapFrom(groupResults);
  const batches = acceptanceBatches.map((batch) => ({ ...batch, ...batchStatus(batch, groups) }));
  const readyGroups = groupResults.filter((item) => item.status !== "未就绪").length;
  const readyBatches = batches.filter((item) => !item.blockers.length).length;

  const lines = [
    "# Edgespark 运行配置就绪度",
    "",
    `生成时间：${new Date().toISOString()}`,
    "",
    "说明：本报告来自 `edgespark var list` 和 `edgespark secret list`，只记录变量/密钥是否存在，不输出任何密钥值。",
    "",
    "## 总览",
    "",
    `- 普通变量：${vars.size} 个`,
    `- Secret：${secrets.size} 个`,
    `- 能力组：${readyGroups}/${groupResults.length} 已具备基础配置`,
    `- 最终验收批次：${readyBatches}/${batches.length} 平台配置已具备`,
    "",
    "## 能力组",
    "",
    "| 能力 | 状态 | 缺少必需项 | 可选缺口 | 可验收内容 |",
    "| --- | --- | --- | --- | --- |"
  ];

  for (const group of groupResults) {
    const optionalGaps = [...group.missingOptional, ...(group.external || [])];
    lines.push(`| ${group.title} | ${renderStatus(group.status)} | ${renderNameList(group.missing)} | ${renderNameList(optionalGaps)} | ${group.verifies.join("、")} |`);
  }

  lines.push(
    "",
    "## 最终验收批次",
    "",
    "| 批次 | 平台配置状态 | 配置阻塞 | 还需本机验收输入 |",
    "| --- | --- | --- | --- |"
  );
  for (const batch of batches) {
    lines.push(`| ${batch.title} | ${batch.status} | ${batch.blockers.join("、") || "无"} | ${renderNameList(batch.verifierInputs)} |`);
  }

  lines.push(
    "",
    "## 当前关键缺口",
    "",
    "- 微信内 H5 语音输入缺 `WECHAT_MP_APP_SECRET`，并且还需要在微信公众平台配置 JS 接口安全域名后做手机实测。",
    "- 服务端 ASR 语音输入缺 `VOICE_ASR_ENDPOINT` 和 `VOICE_ASR_VERIFIED`；MiniMax 官方公开文档未列独立 ASR/STT 端点时，不应臆造 endpoint。",
    "- 微信支付平台变量和商户密钥已存在，但真实付款仍依赖微信商户产品权限和小额实付验收。",
    "- 本报告只证明平台配置存在性；最终仍以 `npm run verify:production:report` 的真实外部链路验收为准。",
    ""
  );

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, lines.join("\n"), "utf8");
  console.log(`[ok] Edgespark runtime readiness written to ${path.relative(root, outputPath).replace(/\\/g, "/")}`);
  console.log(`[info] groups ready ${readyGroups}/${groupResults.length}; acceptance batches platform-ready ${readyBatches}/${batches.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
