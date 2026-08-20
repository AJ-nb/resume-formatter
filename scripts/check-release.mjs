import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const tracked = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { cwd: root })
  .toString("utf8").split("\0").filter(Boolean);
const publishable = tracked.filter((relativePath) => existsSync(join(root, relativePath)));
const failures = [];

const forbiddenPathExtensions = /\.(?:pdf|docx?|png|jpe?g|webp)$/i;
const forbiddenText = [
  { label: "绝对用户路径", pattern: /(?:\/Users\/|[A-Z]:\\Users\\)/i },
  { label: "内部系统引用", pattern: /GraceOS|Grace OS/ },
  { label: "未脱敏手机号", pattern: /(?<![\d-])1[3-9]\d{9}(?![\d-])/ },
  { label: "非示例邮箱", pattern: /[A-Z0-9._%+-]+@(?!(?:example\.(?:com|org)|feross\.org)\b)[A-Z0-9.-]+\.[A-Z]{2,}/i },
  { label: "疑似 API 密钥", pattern: /(?:sk-[A-Za-z0-9_-]{20,}|AIza[A-Za-z0-9_-]{24,})/ },
];

for (const relativePath of publishable) {
  if (forbiddenPathExtensions.test(relativePath)) {
    failures.push(`${relativePath}: 公开仓库不应跟踪私人输入、截图或导出文件`);
    continue;
  }
  let content;
  try { content = readFileSync(join(root, relativePath), "utf8"); } catch { continue; }
  for (const rule of forbiddenText) {
    if (relativePath === "scripts/check-release.mjs") continue;
    if (rule.pattern.test(content)) failures.push(`${relativePath}: 命中${rule.label}`);
  }
}

const artifacts = ["index.html", "resume-formatter.html", "dist/resume-formatter.html"];
const hashes = artifacts.map((relativePath) => createHash("sha256").update(readFileSync(join(root, relativePath))).digest("hex"));
assert.equal(new Set(hashes).size, 1, "三个公开 HTML 必须来自同一次构建");
for (const artifact of artifacts) {
  const bytes = statSync(join(root, artifact)).size;
  if (bytes > 5 * 1024 * 1024) failures.push(`${artifact}: ${(bytes / 1024 / 1024).toFixed(2)} MB，超过 5 MB 预算`);
}

const html = readFileSync(join(root, "index.html"), "utf8");
if (/(?:src|href)=["']https?:\/\//i.test(html)) failures.push("index.html: 发现外部运行时资源");
if (!html.includes('id="embedded-resume-state"')) failures.push("index.html: 缺少离线文档嵌入点");
if (!html.includes("sessionStorage") || !html.includes("localStorage")) failures.push("index.html: 缺少已声明的本地配置存储实现");

const networkApis = ["fetch(", "XMLHttpRequest", "WebSocket(", "sendBeacon("];
for (const relativePath of publishable.filter((path) =>
  path.startsWith("src/")
  && path.endsWith(".js")
  && path !== "src/v2/ai.js")) {
  const content = readFileSync(join(root, relativePath), "utf8");
  for (const api of networkApis) if (content.includes(api)) failures.push(`${relativePath}: 网络 API ${api} 只能出现在 src/v2/ai.js`);
}
const aiSource = readFileSync(join(root, "src/v2/ai.js"), "utf8");
if (!aiSource.includes("fetchImpl")) failures.push("src/v2/ai.js: 缺少可测试的网络适配边界");
if (/apiKey/.test(readFileSync(join(root, "src/v2/contracts.js"), "utf8"))) failures.push("src/v2/contracts.js: 凭据不得进入简历合同");

const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const lock = JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8"));
if (!lock.lockfileVersion || !lock.packages?.[""]) failures.push("package-lock.json: 锁文件结构无效");
const directDependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };
const allowedLicenses = /^(?:MIT|ISC|Apache-2\.0|BSD-2-Clause|BSD-3-Clause|BlueOak-1\.0\.0|\(MIT OR GPL-3\.0-or-later\))$/;
for (const name of Object.keys(directDependencies)) {
  const dependencyPackage = JSON.parse(readFileSync(join(root, "node_modules", name, "package.json"), "utf8"));
  const license = typeof dependencyPackage.license === "string" ? dependencyPackage.license : "UNKNOWN";
  if (!allowedLicenses.test(license)) failures.push(`${name}: 直接依赖许可证 ${license} 未登记为允许`);
}

if (failures.length) {
  console.error(`发布检查失败：\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

console.log(`发布检查通过：${publishable.length} 个文件，${Object.keys(directDependencies).length} 个直接依赖，单文件 ${(statSync(join(root, "index.html")).size / 1024 / 1024).toFixed(2)} MB，SHA-256 ${hashes[0]}`);
