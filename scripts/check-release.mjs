import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const tracked = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  { cwd: root },
)
  .toString("utf8")
  .split("\0")
  .filter(Boolean);

const allowedBinaryExtensions = new Set();
const forbiddenPathExtensions = /\.(?:pdf|docx?|png|jpe?g|webp)$/i;
const forbiddenText = [
  { label: "绝对用户路径", pattern: /\/Users\// },
  { label: "内部系统引用", pattern: /GraceOS|Grace OS/ },
  { label: "未脱敏手机号", pattern: /(?<![\d])1[3-9]\d{9}(?![\d])/ },
  {
    label: "非示例邮箱",
    pattern: /[A-Z0-9._%+-]+@(?!example\.(?:com|org)\b)[A-Z0-9.-]+\.[A-Z]{2,}/i,
  },
];

const failures = [];
for (const relativePath of tracked) {
  if (forbiddenPathExtensions.test(relativePath) && !allowedBinaryExtensions.has(relativePath)) {
    failures.push(`${relativePath}: 公开仓库不应跟踪私人输入或导出文件类型`);
    continue;
  }

  let content;
  try {
    content = readFileSync(join(root, relativePath), "utf8");
  } catch {
    continue;
  }
  for (const rule of forbiddenText) {
    if (relativePath === "scripts/check-release.mjs") continue;
    if (rule.pattern.test(content)) failures.push(`${relativePath}: 命中${rule.label}`);
  }
}

const artifacts = ["index.html", "resume-formatter.html", "dist/resume-formatter.html"];
const hashes = artifacts.map((relativePath) => {
  const content = readFileSync(join(root, relativePath));
  return createHash("sha256").update(content).digest("hex");
});
assert.equal(new Set(hashes).size, 1, "三个公开 HTML 必须来自同一次构建");

const artifact = readFileSync(join(root, "index.html"), "utf8");
const networkApis = ["fetch(", "XMLHttpRequest", "WebSocket(", "sendBeacon("];
for (const api of networkApis) {
  if (artifact.includes(api)) failures.push(`index.html: 发现运行时网络 API ${api}`);
}
if (/(?:src|href)=["']https?:\/\//i.test(artifact)) {
  failures.push("index.html: 发现外部运行时资源");
}

if (failures.length > 0) {
  console.error("发布检查失败：\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log(`发布检查通过：${tracked.length} 个跟踪文件，公开 HTML SHA-256 ${hashes[0]}`);
