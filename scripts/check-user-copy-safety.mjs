import fs from "node:fs";

const files = ["h5/index.html", "h5/app.js"];
const forbidden = [
  { label: "AI", test: (value) => /\bAI\b/i.test(value) },
  { label: "prompt", test: (value) => /\bprompt\b/i.test(value) },
  { label: "mock", test: (value) => /\bmock\b/i.test(value) },
  { label: "\u5927\u6a21\u578b", test: (value) => value.includes("\u5927\u6a21\u578b") },
  { label: "\u667a\u80fd\u4f53", test: (value) => value.includes("\u667a\u80fd\u4f53") },
  { label: "\u673a\u5668\u4eba", test: (value) => value.includes("\u673a\u5668\u4eba") },
  { label: "\u7cfb\u7edf\u63d0\u793a\u8bcd", test: (value) => value.includes("\u7cfb\u7edf\u63d0\u793a\u8bcd") },
  { label: "\u6a21\u578b\u8def\u7531", test: (value) => value.includes("\u6a21\u578b\u8def\u7531") },
  { label: "\u5411\u91cf\u8bb0\u5fc6", test: (value) => value.includes("\u5411\u91cf\u8bb0\u5fc6") },
  { label: "\u6d4b\u8bd5\u53f7", test: (value) => value.includes("\u6d4b\u8bd5\u53f7") },
  { label: "CloudBase", test: (value) => /CloudBase/i.test(value) },
  { label: "\u5c0f\u7a0b\u5e8f", test: (value) => value.includes("\u5c0f\u7a0b\u5e8f") },
  { label: "\u6f14\u793a", test: (value) => value.includes("\u6f14\u793a") },
  { label: "\u5360\u4f4d", test: (value) => value.includes("\u5360\u4f4d") }
];

function fail(message) {
  throw new Error(`user copy safety check failed: ${message}`);
}

function extractJsStrings(source) {
  const strings = [];
  let index = 0;
  while (index < source.length) {
    const quote = source[index];
    if (quote !== "\"" && quote !== "'" && quote !== "`") {
      index += 1;
      continue;
    }
    let value = "";
    let cursor = index + 1;
    while (cursor < source.length) {
      const char = source[cursor];
      if (char === "\\") {
        value += source.slice(cursor, cursor + 2);
        cursor += 2;
        continue;
      }
      if (char === quote) break;
      value += char;
      cursor += 1;
    }
    strings.push({ value, offset: index });
    index = cursor + 1;
  }
  return strings;
}

function lineForOffset(source, offset) {
  return source.slice(0, offset).split(/\r?\n/).length;
}

for (const file of files) {
  const source = fs.readFileSync(file, "utf8");
  const candidates = file.endsWith(".js")
    ? extractJsStrings(source)
    : [{ value: source, offset: 0 }];
  for (const candidate of candidates) {
    for (const rule of forbidden) {
      if (rule.test(candidate.value)) {
        fail(`${file}:${lineForOffset(source, candidate.offset)} contains user-facing forbidden term ${rule.label}`);
      }
    }
  }
}

console.log("[ok] user H5 copy stays product-facing and avoids internal AI/mock terminology");
