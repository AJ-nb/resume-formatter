import assert from "node:assert/strict";
import test from "node:test";
import {
  TEMPLATES,
  createDefaultDocument,
  migrateDocument,
  resolveLayout,
  validateDocument,
} from "../src/v2/contracts.js";
import { importJsonObject, parseExtractedResumeText, sanitizePlainText } from "../src/v2/import-core.js";
import { parseMarkdownV2, serializeMarkdown } from "../src/v2/markdown.js";

test("Schema v1 幂等迁移并保留照片与版本记录", () => {
  const legacy = {
    schemaVersion: 1,
    documentId: "legacy-1",
    resumeName: "迁移样例",
    profile: { name: "示例用户", email: "person@example.com" },
    sections: [{
      id: "s1",
      type: "experience",
      entries: [{ id: "e1", name: "示例公司", role: "工程师", date: "2023", bullets: [{ id: "b1", content: [{ type: "text", value: "完成 3 个模块" }] }] }],
    }],
    photo: { dataUrl: "data:image/png;base64,AA==", scale: 1.2 },
    versions: [{ id: "v1", name: "初稿" }],
  };
  const once = migrateDocument(legacy);
  const twice = migrateDocument(once);
  assert.equal(once.schemaVersion, 2);
  assert.equal(once.sections[0].entries[0].bullets[0].text, "完成 3 个模块");
  assert.equal(once.assets.photo.scale, 1.2);
  assert.equal(once.versions[0].id, "v1");
  assert.deepEqual(twice.migration, once.migration);
  assert.equal(twice.documentId, "legacy-1");
});

test("Markdown v2 覆盖摘要、标准栏目和自定义栏目并可往返", () => {
  const markdown = `---
schema_version: 2
resume_name: 测试简历
name: 示例用户
email: person@example.com
---

## 个人摘要
关注可靠的复杂系统设计。

## 工作经历
### 示例公司
role: 产品经理
date: 2022 - 至今
- 将处理时间缩短 25%。

## 社区贡献
### 开源项目
- 维护文档与发布流程。
`;
  const result = parseMarkdownV2(markdown, "sample.md");
  assert.equal(result.document.summary, "关注可靠的复杂系统设计。");
  assert.ok(result.document.sections.some((section) => section.type === "experience"));
  assert.ok(result.document.sections.some((section) => section.type === "custom" && section.title === "社区贡献"));
  const roundTrip = parseMarkdownV2(serializeMarkdown(result.document), "roundtrip.md");
  assert.equal(roundTrip.document.profile.name, "示例用户");
  assert.equal(roundTrip.document.sections[0].entries[0].bullets[0].text, "将处理时间缩短 25%。");
});

test("当前 JSON 与 JSON Resume 统一为 ResumeDocumentV2", () => {
  const current = importJsonObject(createDefaultDocument(), "current.json");
  assert.equal(current.document.schemaVersion, 2);
  assert.equal(current.source.type, "json");

  const jsonResume = importJsonObject({
    basics: { name: "示例用户", label: "数据分析师", email: "data@example.com", summary: "关注可解释分析。" },
    work: [{ name: "示例机构", position: "分析师", startDate: "2021", endDate: "2024", highlights: ["交付 6 个分析项目"] }],
    skills: [{ name: "分析", keywords: ["SQL", "Python"] }],
  }, "json-resume.json");
  assert.equal(jsonResume.source.type, "json-resume");
  assert.equal(jsonResume.document.profile.headline, "数据分析师");
  assert.equal(jsonResume.document.sections.find((section) => section.type === "experience").entries[0].date, "2021 - 2024");
});

test("PDF/DOCX 提取文本映射保留未映射片段且不执行 HTML", () => {
  const result = parseExtractedResumeText(`示 例 用 户
产 品 设 计 师
person@example.com
这是一段无法确定归属的文字
工 作 经 历
示 例 公 司
2022 - 至今
• 将交付时间缩短 20%
`, "resume.pdf");
  assert.equal(result.document.profile.name, "示例用户");
  assert.equal(result.document.profile.headline, "产品设计师");
  assert.ok(result.document.sections.some((section) => section.type === "experience"));
  assert.ok(result.unmapped.some((item) => item.text.includes("无法确定")));
  assert.equal(sanitizePlainText("<img src=x onerror=alert(1)>\u0000"), "<img src=x onerror=alert(1)>");
});

test("十二套模板具有独立合同，版式覆盖值被夹紧", () => {
  assert.equal(TEMPLATES.length, 12);
  assert.equal(new Set(TEMPLATES.map((item) => item.id)).size, 12);
  assert.equal(TEMPLATES.find((item) => item.id === "visual-two-column").machineReadability, "caution");
  assert.equal(TEMPLATES.find((item) => item.id === "creative-studio").structure, "two-column");
  assert.ok(TEMPLATES.filter((item) => item.machineReadability === "caution").every((item) => item.structure === "two-column"));
  assert.ok(TEMPLATES.every((item) => item.readabilityNote && item.keywords.length));
  const document = createDefaultDocument();
  document.layout.paper = "Letter";
  document.layout.tokenOverrides = { fontSize: 99, lineHeight: 0.2, sectionGap: 30, accent: "javascript:red" };
  const layout = resolveLayout(document);
  assert.equal(layout.paper, "Letter");
  assert.equal(layout.tokens.fontSize, 12);
  assert.equal(layout.tokens.lineHeight, 1.15);
  assert.equal(layout.tokens.sectionGap, 8);
  assert.notEqual(layout.tokens.accent, "javascript:red");
  assert.equal(validateDocument(document).filter((item) => item.level === "error").length, 0);
});
