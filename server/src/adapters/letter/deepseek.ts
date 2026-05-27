import { secret, vars } from "edgespark";

export type SalesLetterContent = {
  title: string;
  scene: string;
  paragraphs: string[];
  provider?: string;
  model?: string;
};

export type SalesLetterInput = {
  answers: string[];
  input?: Record<string, unknown>;
  templates?: unknown;
};

type DeepSeekMessage = {
  role: "system" | "user";
  content: string;
};

type DeepSeekResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

const FALLBACK_TEMPLATE_RULES = [
  "写成适合微信私聊发送的销售信。",
  "结构为：共情开头、问题拆解、解决方案、可信理由、轻量行动邀请。",
  "语气真诚、克制、具体，不要夸张承诺，不要绝对化表达。",
  "输出 4 到 6 个自然段，每段不超过 120 个汉字。"
].join("\n");

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeTemplateRules(templates: unknown) {
  if (!Array.isArray(templates) || !templates.length) return FALLBACK_TEMPLATE_RULES;
  const template = templates.find((item) => {
    if (!item || typeof item !== "object") return false;
    const status = cleanString((item as Record<string, unknown>).status);
    return status === "enabled" || status === "启用";
  }) || templates[0];
  if (!template || typeof template !== "object") return FALLBACK_TEMPLATE_RULES;

  const data = template as Record<string, unknown>;
  const structure = Array.isArray(data.structure) ? data.structure.map(cleanString).filter(Boolean).join(" -> ") : cleanString(data.structure);
  const prompt = cleanString(data.prompt || data.rules || data.requirement);
  return [
    cleanString(data.name) && `模板名称：${cleanString(data.name)}`,
    cleanString(data.goal) && `适用目标：${cleanString(data.goal)}`,
    cleanString(data.scene) && `适用场景：${cleanString(data.scene)}`,
    structure && `段落结构：${structure}`,
    prompt && `后台写信要求：${prompt}`,
    !prompt && FALLBACK_TEMPLATE_RULES
  ].filter(Boolean).join("\n");
}

function buildUserBrief(input: SalesLetterInput) {
  const labels = ["写给谁", "写信目标", "产品或服务", "客户顾虑", "补充信息"];
  const answers = input.answers
    .map((answer, index) => `${labels[index] || `信息${index + 1}`}：${cleanString(answer) || "用户未补充"}`)
    .join("\n");
  const extra = input.input && Object.keys(input.input).length
    ? `\n补充上下文：${JSON.stringify(input.input)}`
    : "";
  return `${answers || "用户暂未提供完整信息，请根据已有内容写一封稳妥的销售信。"}${extra}`;
}

function parseJsonContent(raw: string): SalesLetterContent {
  const text = raw.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const parsed = JSON.parse(text) as Partial<SalesLetterContent>;
  const paragraphs = Array.isArray(parsed.paragraphs)
    ? parsed.paragraphs.map(cleanString).filter(Boolean)
    : [];
  if (!cleanString(parsed.title) || !cleanString(parsed.scene) || !paragraphs.length) {
    throw new Error("DeepSeek returned incomplete sales letter JSON.");
  }
  return {
    title: cleanString(parsed.title),
    scene: cleanString(parsed.scene),
    paragraphs
  };
}

export async function generateSalesLetterWithDeepSeek(input: SalesLetterInput) {
  const provider = vars.get("LETTER_PROVIDER") || "deepseek";
  if (provider !== "deepseek") return null;

  const apiKey = secret.get("DEEPSEEK_API_KEY");
  if (!apiKey) return null;

  const model = vars.get("DEEPSEEK_MODEL") || "deepseek-v4-pro";
  const baseUrl = (vars.get("DEEPSEEK_BASE_URL") || "https://api.deepseek.com").replace(/\/+$/, "");
  const messages: DeepSeekMessage[] = [
    {
      role: "system",
      content: [
        "你是“智多星”的销售信写作助手。",
        "只输出严格 JSON，不要输出 Markdown，不要解释。",
        "JSON 格式必须是：{\"title\":\"...\",\"scene\":\"...\",\"paragraphs\":[\"...\"]}。",
        "正文面向最终用户可直接复制发送，禁止出现 AI、大模型、prompt、智能体、系统提示词、模型路由等技术词。",
        normalizeTemplateRules(input.templates)
      ].join("\n")
    },
    {
      role: "user",
      content: `请根据以下通话整理信息，写一封可直接发送的销售信：\n${buildUserBrief(input)}`
    }
  ];

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.7,
      stream: false
    })
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`DeepSeek request failed: ${response.status} ${detail.slice(0, 300)}`);
  }

  const payload = await response.json() as DeepSeekResponse;
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error("DeepSeek returned empty content.");

  return {
    ...parseJsonContent(content),
    provider: "deepseek",
    model
  };
}
