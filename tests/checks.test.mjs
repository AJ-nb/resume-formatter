import assert from "node:assert/strict";
import test from "node:test";
import { buildQuickScan, runResumeChecks } from "../src/v2/checks.js";
import { createDefaultDocument } from "../src/v2/contracts.js";

test("深度检查覆盖重复动词、空泛职责、重复内容、日期、链接和技能证据", () => {
  const document = createDefaultDocument();
  const experience = document.sections.find((section) => section.type === "experience");
  const first = experience.entries[0];
  first.date = "2022.06 - 至今";
  first.bullets = [
    { id: "bullet-a", text: "负责团队相关工作" },
    { id: "bullet-b", text: "负责团队相关工作" },
    { id: "bullet-c", text: "负责协调项目事项" },
    { id: "bullet-d", text: "推动 product strategy research design delivery workflow across teams" },
  ];
  experience.entries.push({
    id: "entry-overlap",
    name: "并行经历",
    role: "顾问",
    date: "2023/01 - 2024/01",
    location: "",
    summary: "",
    bullets: [],
  });
  document.profile.email = "invalid-email";
  document.profile.website = "javascript:invalid";
  const checks = runResumeChecks(document);
  const codes = new Set(checks.map((item) => item.code));
  for (const code of [
    "CONTENT_REPEATED_VERB",
    "CONTENT_VAGUE_WORDING",
    "CONTENT_RESPONSIBILITY_ONLY",
    "CONTENT_DUPLICATE",
    "CONTENT_DATE_STYLE_MIXED",
    "CONTENT_DATE_OVERLAP",
    "PROFILE_EMAIL_INVALID",
    "PROFILE_LINK_INVALID",
    "CONTENT_SKILL_UNSUPPORTED",
  ]) assert.ok(codes.has(code), `missing ${code}`);
});

test("快速扫描按文档顺序返回身份、前三条成果和量化片段", () => {
  const document = createDefaultDocument();
  const scan = buildQuickScan(document, { role: "高级产品设计师" });
  assert.equal(scan.name, "林知远");
  assert.equal(scan.targetRole, "高级产品设计师");
  assert.equal(scan.readingOrder[0].path, "profile.name");
  assert.equal(scan.outcomes.length, 3);
  assert.ok(scan.quantified.some((item) => item.value.includes("32%")));
  assert.ok(scan.quantified.every((item) => item.path && item.text));
});
