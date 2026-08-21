import { expect, test } from "@playwright/test";
import JSZip from "jszip";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const TEMPLATE_IDS = [
  "zh-compact", "modern-sans", "classic-serif", "executive-minimal", "academic-research", "visual-two-column",
  "international-standard", "tech-precision", "consulting-brief", "finance-ledger", "creative-studio", "startup-signal",
];

async function createDocxBuffer() {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`);
  zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`);
  const paragraphs = ["示例用户", "产品经理", "docx@example.com", "工作经历", "示例公司", "2021 - 至今", "• 完成 5 个产品版本"]
    .map((text) => `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`).join("");
  zip.file("word/document.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs}<w:sectPr/></w:body></w:document>`);
  return zip.generateAsync({ type: "nodebuffer" });
}

async function createJobVersion(page, company = "示例科技", role = "高级产品经理") {
  await page.locator("#btn-new-application").click();
  await page.locator(".modal").getByLabel("公司", { exact: true }).fill(company);
  await page.locator(".modal").getByLabel("岗位", { exact: true }).fill(role);
  await page.getByRole("button", { name: "创建", exact: true }).click();
  await expect(page.locator("#workspace-document-list")).toContainText(`${company} · ${role}`);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test("无主动 AI 操作时不发出网络请求", async ({ page }) => {
  const requests = [];
  page.on("request", (request) => {
    if (!request.url().startsWith("http://127.0.0.1:43117")) requests.push(request.url());
  });
  await page.waitForTimeout(500);
  await page.getByRole("tab", { name: "模板" }).click();
  await page.locator("[data-template-id='classic-serif']").click();
  await page.getByRole("tab", { name: "检查" }).click();
  expect(requests).toEqual([]);
});

test("导入 Markdown、编辑、模板切换、保存和撤销", async ({ page }) => {
  await page.locator("#resume-file-input").setInputFiles("fixtures/valid/sample-resume.md");
  await expect(page.getByRole("heading", { name: "确认导入" })).toBeVisible();
  await page.getByRole("button", { name: "确认导入" }).click();
  await expect(page.locator("#resume-paper [data-edit-path='profile.name']")).not.toHaveText("林知远");

  await page.getByRole("tab", { name: "模板" }).click();
  await expect(page.locator(".template-item")).toHaveCount(12);
  for (const templateId of TEMPLATE_IDS) {
    await page.locator(`#template-list [data-template-id='${templateId}']`).click();
    await expect(page.locator("#resume-paper")).toHaveAttribute("data-template", templateId);
  }

  await page.locator("#template-search").fill("技术");
  await expect(page.locator(".template-item")).toHaveCount(1);
  await expect(page.locator("[data-template-id='tech-precision']")).toBeVisible();
  await page.locator("#template-search").fill("");
  await page.locator("#template-category").selectOption("creative");
  await expect(page.locator(".template-item")).toHaveCount(2);
  await expect(page.locator("[data-template-id='creative-studio']")).toBeVisible();
  await page.locator("#template-category").selectOption("all");

  const name = page.locator("#resume-paper [data-edit-path='profile.name']");
  const before = await name.textContent();
  await name.fill("示例候选人");
  await name.blur();
  await expect(name).toHaveText("示例候选人");
  await page.locator("#btn-undo").click();
  await expect(name).toHaveText(before);
  await page.locator("#btn-save").click();
  await expect(page.locator("#save-status")).toHaveText("已保存在本机");
});

test("十二套模板对基准样例保持单页", async ({ page }) => {
  await page.getByRole("tab", { name: "模板" }).click();
  for (const templateId of TEMPLATE_IDS) {
    await page.locator(`#template-list [data-template-id='${templateId}']`).click();
    await expect(page.locator("#resume-paper")).toHaveAttribute("data-template", templateId);
    await expect(page.locator("#overflow-status")).toHaveAttribute("data-status", "ok");
  }
});

test("精确排版实时预览、密度预设、边界校验与还原形成单次撤销", async ({ page }) => {
  await page.getByRole("tab", { name: "版式" }).click();
  const paper = page.locator("#resume-paper");
  const fontNumber = page.locator("#font-size-number");
  await fontNumber.fill("10.4");
  await expect.poll(() => paper.evaluate((element) => element.style.getPropertyValue("--resume-font-size"))).toBe("10.4pt");
  await fontNumber.blur();
  await expect(page.locator("#layout-custom-badge")).toContainText("1 项");
  await page.locator("#btn-undo").click();
  await expect(fontNumber).toHaveValue("10.0");

  await fontNumber.fill("20");
  await fontNumber.blur();
  await expect(fontNumber).toHaveValue("10.0");
  await expect(page.locator("#font-size-error")).toContainText("7.5");

  await page.locator("[data-density='compact']").click();
  await expect(page.locator("[data-density='compact']")).toHaveClass(/active/);
  await expect(page.locator("#font-size-number")).toHaveValue("9.7");
  await expect(page.locator("#page-margin-x-number")).toHaveValue("14.5");
  await page.locator(".layout-advanced > summary").click();
  await page.locator("#accent-color-text").fill("#123456");
  await page.locator("#accent-color-text").blur();
  await expect.poll(() => paper.evaluate((element) => element.style.getPropertyValue("--resume-accent"))).toBe("#123456");
  await page.locator("[data-layout-reset='accent']").click();
  await expect(page.locator("#accent-color-text")).toHaveValue("#176B5B");
  await page.locator("#btn-reset-layout").click();
  await expect(page.locator("#layout-custom-badge")).toHaveText("模板默认");
  await expect(page.locator("[data-density='standard']")).toHaveClass(/active/);
});

test("选区 AI 必须先测试连接，建议经差异预览应用并可撤销", async ({ page }) => {
  let calls = 0;
  const requestBodies = [];
  await page.route("https://mock.example/v1/chat/completions", async (route) => {
    calls += 1;
    const body = route.request().postDataJSON();
    requestBodies.push(body);
    const isTest = body.messages?.some((message) => message.content.includes('"ok"'));
    const content = isTest
      ? '{"ok":true}'
      : '{"suggestion":"聚焦复杂业务工具与设计系统","reason":"删去重复表达"}';
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ choices: [{ message: { content } }] }) });
  });

  await page.locator("#btn-ai-settings").click();
  await page.locator(".modal select").selectOption("custom");
  await page.getByLabel("模型", { exact: true }).fill("example-model");
  await page.getByLabel("Base URL", { exact: true }).fill("https://mock.example/v1");
  await page.getByLabel("API Key", { exact: true }).fill("test-key");
  await page.getByRole("button", { name: "测试连接并保存" }).click();
  await expect(page.locator("#ai-status-badge")).toContainText("已连接");
  const credentialStorage = await page.evaluate(() => ({
    local: localStorage.getItem("resume-formatter:ai-preferences-v3"),
    session: sessionStorage.getItem("resume-formatter:ai-credential-session-v3"),
  }));
  expect(credentialStorage.local).not.toContain("test-key");
  expect(credentialStorage.session).toContain("test-key");
  await page.locator("#btn-ai-settings").click();
  await expect(page.getByLabel("API Key", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("API Key", { exact: true })).toHaveAttribute("placeholder", /当前标签页已配置/);
  await page.getByRole("button", { name: "取消", exact: true }).click();

  const summary = page.locator("#resume-paper [data-edit-path='summary']");
  await summary.evaluate((element) => {
    const range = document.createRange();
    range.setStart(element.firstChild, 0);
    range.setEnd(element.firstChild, 15);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  });
  await expect(page.locator("#selection-toolbar")).toBeVisible();
  await page.locator("[data-ai-rewrite='professional']").click();
  await expect(page.getByRole("heading", { name: "改写建议" })).toBeVisible();
  await page.getByRole("button", { name: "应用建议" }).click();
  await expect(summary).toContainText("聚焦复杂业务工具与设计系统");
  await page.locator("#btn-undo").click();
  await expect(summary).not.toContainText("聚焦复杂业务工具与设计系统");
  expect(calls).toBe(2);
  const rewriteUser = requestBodies[1].messages.find((message) => message.role === "user").content;
  expect(rewriteUser).toContain("selectedText");
  expect(rewriteUser).not.toContain("林知远");
});

test("Gemini 密钥只通过请求头发送并可从当前标签页立即忘记", async ({ page }) => {
  const secret = "GEMINI_TEST_SESSION_SECRET";
  let request;
  await page.route("https://generativelanguage.googleapis.com/v1beta/**", async (route) => {
    request = route.request();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }] }),
    });
  });

  await page.locator("#btn-ai-settings").click();
  await page.locator(".modal select").selectOption("gemini");
  await page.getByLabel("API Key", { exact: true }).fill(secret);
  await page.getByRole("button", { name: "测试连接并保存" }).click();
  await expect(page.locator("#ai-status-badge")).toContainText("Gemini 已连接");
  expect(request.url()).not.toContain(secret);
  expect(request.url()).not.toContain("?key=");
  expect(request.headers()["x-goog-api-key"]).toBe(secret);
  expect(request.postData()).not.toContain(secret);
  expect(await page.locator("html").evaluate((element) => element.outerHTML)).not.toContain(secret);

  await page.locator("#btn-ai-settings").click();
  await page.getByRole("button", { name: "忘记 API Key" }).click();
  await expect(page.getByRole("button", { name: "忘记 API Key" })).toBeDisabled();
  const stored = await page.evaluate(() => ({
    local: localStorage.getItem("resume-formatter:ai-preferences-v3"),
    session: sessionStorage.getItem("resume-formatter:ai-credential-session-v3"),
  }));
  expect(stored.local).not.toContain(secret);
  expect(stored.session).toBeNull();
});

test("彼源预设读取模型并使用最小兼容请求", async ({ page }) => {
  let modelsRequest;
  const chatRequests = [];
  await page.route("https://api.biyuan.ai/v1/models", async (route) => {
    modelsRequest = route.request();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: [{ id: "gpt-example" }, { id: "claude-example" }] }),
    });
  });
  await page.route("https://api.biyuan.ai/v1/chat/completions", async (route) => {
    const request = route.request();
    chatRequests.push(request);
    const body = request.postDataJSON();
    const isTest = body.messages?.some((message) => message.content.includes('"ok"'));
    const content = isTest
      ? '{"ok":true}'
      : [{ type: "text", text: '```json\n{"suggestion":"将企业工作台核心流程重构为可量化改进，关键任务完成时间缩短 32%。","reason":"突出动作与结果"}\n```' }];
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ choices: [{ message: { content } }] }),
    });
  });

  await page.locator("#btn-ai-settings").click();
  await page.getByLabel("API Key", { exact: true }).fill("other-provider-key");
  await page.locator(".modal select").selectOption("biyuan");
  await expect(page.getByLabel("Base URL", { exact: true })).toHaveValue("https://api.biyuan.ai/v1");
  await expect(page.getByLabel("模型", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("API Key", { exact: true })).toHaveValue("");
  await page.getByLabel("API Key", { exact: true }).fill("test-key");
  await page.getByRole("button", { name: "读取可用模型" }).click();
  await expect(page.getByText(/^已读取 2 个当前令牌可用模型/)).toBeVisible();
  expect(modelsRequest.headers().authorization).toBe("Bearer test-key");
  expect(modelsRequest.postData()).toBeNull();

  await page.getByLabel("模型", { exact: true }).fill("gpt-example");
  await page.getByRole("button", { name: "测试连接并保存" }).click();
  await expect(page.locator("#ai-status-badge")).toHaveText("彼源 AI 已连接");
  expect(chatRequests[0].headers().authorization).toBe("Bearer test-key");
  expect(Object.keys(chatRequests[0].postDataJSON()).sort()).toEqual(["messages", "model"]);

  const bullet = page.locator("#resume-paper .bullet-text").first();
  await bullet.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  });
  await page.locator("[data-ai-rewrite='professional']").click();
  await expect(page.getByRole("heading", { name: "改写建议" })).toBeVisible();
  await expect(page.locator(".diff-preview")).toContainText("关键任务完成时间缩短 32%");
  const rewriteBody = chatRequests[1].postDataJSON();
  expect(Object.keys(rewriteBody).sort()).toEqual(["messages", "model"]);
  expect(rewriteBody.messages[0].content).toContain('"required":["suggestion","reason"]');
});

test("母版与岗位版本独立编辑，JD 与证据形成本地闭环", async ({ page }) => {
  const masterSummary = await page.locator("#resume-paper [data-edit-path='summary']").textContent();
  await createJobVersion(page);
  const jobSummary = page.locator("#resume-paper [data-edit-path='summary']");
  await jobSummary.fill("面向示例岗位的定制摘要");
  await jobSummary.blur();

  await page.locator("#workspace-document-list .workspace-document").first().click();
  await expect(page.locator("#resume-paper [data-edit-path='summary']")).toHaveText(masterSummary);
  await page.getByRole("button", { name: /示例科技 · 高级产品经理/ }).click();
  await expect(page.locator("#resume-paper [data-edit-path='summary']")).toHaveText("面向示例岗位的定制摘要");

  await page.getByRole("tab", { name: "岗位" }).click();
  await page.locator("#job-jd").fill("岗位要求\n- 熟悉产品策略与用户研究\n- 负责企业工作台优化\n- 有数据分析经验优先");
  await page.locator("#btn-analyze-jd").click();
  await expect(page.locator(".requirement-item")).toHaveCount(4);
  await expect(page.locator(".requirement-item").first()).toContainText(/已有证据|表达缺口|无法判断/);

  await page.locator("#btn-add-evidence").click();
  await page.getByLabel("背景", { exact: true }).fill("企业工作台流程复杂");
  await page.getByLabel("任务", { exact: true }).fill("缩短关键任务路径");
  await page.getByLabel("个人行动", { exact: true }).fill("重构订单流程并组织用户验证");
  await page.getByLabel("结果", { exact: true }).fill("待补充");
  await page.locator(".modal").getByRole("combobox").first().selectOption("not-applicable");
  await page.getByRole("button", { name: "保存证据" }).click();
  await expect(page.locator(".evidence-item")).toContainText("重构订单流程并组织用户验证");
});

test("岗位版本按三方差异同步母版并逐项处理冲突", async ({ page }) => {
  await createJobVersion(page, "示例科技", "产品经理");
  const summary = page.locator("#resume-paper [data-edit-path='summary']");
  await summary.fill("岗位定制摘要");
  await summary.blur();

  await page.locator("#workspace-document-list .workspace-document").first().click();
  const masterSummary = page.locator("#resume-paper [data-edit-path='summary']");
  await masterSummary.fill("母版更新摘要");
  await masterSummary.blur();
  const masterPhone = page.locator("#resume-paper [data-edit-path='profile.phone']");
  await masterPhone.fill("139-0000-0000");
  await masterPhone.blur();

  await page.getByRole("button", { name: /示例科技 · 产品经理/ }).click();
  await page.getByRole("tab", { name: "岗位" }).click();
  await expect(page.locator("#master-sync-badge")).toHaveText("2 项更新");
  await page.locator("#btn-sync-master").click();
  await expect(page.getByRole("heading", { name: "同步母版更新" })).toBeVisible();
  await expect(page.locator(".sync-row.auto")).toContainText("电话");
  await page.getByLabel(/冲突处理：个人摘要/).selectOption("job");
  await page.getByRole("button", { name: "同步 2 项" }).click();
  await expect(page.locator("#resume-paper [data-edit-path='summary']")).toHaveText("岗位定制摘要");
  await expect(page.locator("#resume-paper [data-edit-path='profile.phone']")).toHaveText("139-0000-0000");
  await expect(page.locator("#master-sync-badge")).toHaveText("已同步");
});

test("快速扫描可解释首屏信号且大范围 AI 请求先披露发送范围", async ({ page }) => {
  const requests = [];
  await page.route("https://review.example/v1/chat/completions", async (route) => {
    const body = route.request().postDataJSON();
    requests.push(body);
    const isTest = body.messages?.some((message) => message.content.includes('"ok"'));
    const content = isTest
      ? '{"ok":true}'
      : '{"issues":[{"severity":"medium","fieldPath":"summary","title":"摘要可更聚焦","detail":"目标岗位不够明确","suggestion":"补充岗位方向"}]}';
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ choices: [{ message: { content } }] }) });
  });

  await page.getByRole("tab", { name: "检查" }).click();
  await page.locator("#btn-quick-scan").click();
  await expect(page.getByRole("heading", { name: "快速扫描" })).toBeVisible();
  await expect(page.locator(".quick-scan-identity")).toContainText("林知远");
  await expect(page.locator(".quick-scan-section.metrics")).toContainText("32%");
  await page.locator(".modal-footer").getByRole("button", { name: "关闭", exact: true }).click();

  await page.locator("#btn-ai-settings").click();
  await page.locator(".modal select").selectOption("custom");
  await page.getByLabel("模型", { exact: true }).fill("review-model");
  await page.getByLabel("Base URL", { exact: true }).fill("https://review.example/v1");
  await page.getByLabel("API Key", { exact: true }).fill("test-key");
  await page.getByRole("button", { name: "测试连接并保存" }).click();
  await page.locator("#btn-review-resume").click();
  await expect(page.getByRole("heading", { name: "发送全文审阅" })).toBeVisible();
  await expect(page.locator(".ai-preflight")).toContainText("简历全文");
  await expect(page.locator(".ai-preflight")).toContainText("review-model");
  expect(requests).toHaveLength(1);
  await page.getByRole("button", { name: "确认发送" }).click();
  await expect(page.locator("#ai-results")).toContainText("摘要可更聚焦");
  expect(requests).toHaveLength(2);
});

test("投递后冻结只读快照并可复制为新版本继续编辑", async ({ page }) => {
  await createJobVersion(page, "示例公司", "工程师");
  const initialTitle = await page.title();
  await page.evaluate(() => { window.print = () => { window.__capturedPrintTitle = document.title; }; });
  await page.locator("#btn-export-menu").click();
  await page.locator("#btn-print").click();
  const warnings = page.locator(".readiness-item.warning input");
  for (let index = 0; index < await warnings.count(); index += 1) await warnings.nth(index).check();
  await page.getByRole("button", { name: "打开打印对话框" }).click();
  await expect.poll(() => page.evaluate(() => window.__capturedPrintTitle || "")).toMatch(/^示例公司-工程师-林知远-\d{4}-\d{2}-\d{2}$/);
  await expect.poll(() => page.title()).toBe(initialTitle);
  await expect(page.locator("#readonly-status")).toBeVisible();
  await expect(page.locator("#btn-save")).toBeDisabled();
  await expect(page.locator("#resume-paper [data-edit-path='summary']")).toHaveAttribute("contenteditable", "false");
  await page.locator("#btn-copy-snapshot").click();
  await expect(page.locator("#readonly-status")).toBeHidden();
  await expect(page.locator("#workspace-document-list .workspace-document")).toHaveCount(3);
  await expect(page.locator("#resume-paper [data-edit-path='summary']")).toHaveAttribute("contenteditable", "plaintext-only");
});

test("证据 AI 仅发送选定证据，建议可应用并原子撤销", async ({ page }) => {
  const requests = [];
  await page.route("https://evidence.example/v1/chat/completions", async (route) => {
    const body = route.request().postDataJSON();
    requests.push(body);
    const isTest = body.messages.some((message) => message.content.includes('"ok"'));
    let content = '{"ok":true}';
    if (!isTest) {
      const user = JSON.parse(body.messages.find((message) => message.role === "user").content);
      content = JSON.stringify({ suggestion: "重构订单流程并组织用户验证，交付结果待补充。", evidenceIds: [user.evidence[0].id], warnings: [] });
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ choices: [{ message: { content } }] }) });
  });
  await createJobVersion(page, "证据科技", "运营经理");
  await page.getByRole("tab", { name: "岗位" }).click();
  await page.locator("#btn-add-evidence").click();
  await page.getByLabel("个人行动", { exact: true }).fill("重构订单流程并组织用户验证");
  await page.getByLabel("结果", { exact: true }).fill("待补充");
  await page.locator(".modal").getByRole("combobox").first().selectOption("not-applicable");
  await page.getByRole("button", { name: "保存证据" }).click();

  await page.locator("#btn-ai-settings").click();
  await page.locator(".modal select").first().selectOption("custom");
  await page.getByLabel("模型", { exact: true }).fill("evidence-model");
  await page.getByLabel("Base URL", { exact: true }).fill("https://evidence.example/v1");
  await page.getByLabel("API Key", { exact: true }).fill("test-key");
  await page.getByRole("button", { name: "测试连接并保存" }).click();

  const before = await page.locator("#resume-paper [data-edit-path='summary']").textContent();
  await page.locator(".evidence-draft-button").click();
  await page.getByRole("button", { name: "生成建议" }).click();
  await expect(page.getByRole("heading", { name: "证据生成建议" })).toBeVisible();
  await page.getByRole("button", { name: "应用建议" }).click();
  await expect(page.locator("#resume-paper [data-edit-path='summary']")).toHaveText("重构订单流程并组织用户验证，交付结果待补充。");
  await page.locator("#btn-undo").click();
  await expect(page.locator("#resume-paper [data-edit-path='summary']")).toHaveText(before);
  expect(JSON.stringify(requests[1])).toContain("重构订单流程并组织用户验证");
  expect(JSON.stringify(requests[1])).not.toContain("林知远");
});

test("工作区备份包含岗位资料但普通 HTML 与两类导出均不含密钥", async ({ page }) => {
  await createJobVersion(page, "备份科技", "数据产品经理");
  await page.getByRole("tab", { name: "岗位" }).click();
  await page.locator("#job-jd").fill("仅用于工作区的虚构 JD 内容");
  await page.locator("#job-jd").blur();
  await page.locator("#btn-add-evidence").click();
  await page.getByLabel("个人行动", { exact: true }).fill("仅用于工作区的虚构证据");
  await page.getByLabel("结果", { exact: true }).fill("待补充");
  await page.getByRole("button", { name: "保存证据" }).click();
  await page.evaluate(() => sessionStorage.setItem("resume-formatter:ai-credential-session-v3", JSON.stringify({ provider: "custom", baseUrl: "https://secret.example/v1", model: "example", apiKey: "WORKSPACE_SECRET" })));

  await page.locator("#btn-export-menu").click();
  const workspaceDownload = page.waitForEvent("download");
  await page.locator("#btn-export-workspace").click();
  await page.getByRole("button", { name: "导出备份" }).click();
  const workspacePath = await (await workspaceDownload).path();
  const workspaceContent = await (await import("node:fs/promises")).readFile(workspacePath, "utf8");
  expect(workspaceContent).toContain("仅用于工作区的虚构 JD 内容");
  expect(workspaceContent).toContain("仅用于工作区的虚构证据");
  expect(workspaceContent).not.toContain("WORKSPACE_SECRET");

  await page.locator("#btn-export-menu").click();
  const htmlDownload = page.waitForEvent("download");
  await page.locator("#btn-export-html").click();
  const htmlPath = await (await htmlDownload).path();
  const htmlContent = await (await import("node:fs/promises")).readFile(htmlPath, "utf8");
  expect(htmlContent).not.toContain("仅用于工作区的虚构 JD 内容");
  expect(htmlContent).not.toContain("仅用于工作区的虚构证据");
  expect(htmlContent).not.toContain("WORKSPACE_SECRET");
});

test("隐私面板可清点、备份并限定清除本工具数据", async ({ page }) => {
  await createJobVersion(page, "隐私示例公司", "示例岗位");
  await page.getByRole("tab", { name: "岗位" }).click();
  await page.locator("#job-jd").fill("仅用于清除验证的虚构 JD");
  await page.locator("#job-jd").blur();
  await page.evaluate(() => {
    localStorage.setItem("another-app:state", "keep-me");
    localStorage.setItem("resume-formatter:obsolete-secret", "remove-me");
    sessionStorage.setItem("resume-formatter:ai-credential-session-v3", JSON.stringify({ apiKey: "CLEAR_TEST_SECRET", testStatus: "passed" }));
  });

  await page.locator("#btn-export-menu").click();
  await page.locator("#btn-privacy").click();
  await expect(page.getByRole("heading", { name: "隐私与本地数据" })).toBeVisible();
  await expect(page.locator(".privacy-inventory")).toContainText("1 个");
  await expect(page.getByRole("button", { name: "导出工作区备份" })).toBeVisible();
  await page.getByRole("button", { name: "清除全部本地数据" }).click();
  await expect(page.getByRole("heading", { name: "确认清除本地数据" })).toBeVisible();
  await page.getByRole("button", { name: "确认清除" }).click();
  await expect(page.locator("#resume-paper [data-edit-path='profile.name']")).toHaveText("");

  const storage = await page.evaluate(() => ({
    unrelated: localStorage.getItem("another-app:state"),
    oldSecret: localStorage.getItem("resume-formatter:obsolete-secret"),
    sessionKeys: Object.keys(sessionStorage).filter((key) => key.startsWith("resume-formatter:")),
    localData: Object.fromEntries(Object.keys(localStorage).filter((key) => key.startsWith("resume-formatter:")).map((key) => [key, localStorage.getItem(key)])),
  }));
  expect(storage.unrelated).toBe("keep-me");
  expect(storage.oldSecret).toBeNull();
  expect(storage.sessionKeys).toEqual([]);
  expect(JSON.stringify(storage.localData)).not.toContain("remove-me");
  expect(JSON.stringify(storage.localData)).not.toContain("CLEAR_TEST_SECRET");

  await page.reload();
  await expect(page.locator("#resume-paper [data-edit-path='profile.name']")).toHaveText("");
});

test("投递 PDF 门禁阻止缺失姓名并允许普通备份", async ({ page }) => {
  const name = page.locator("#resume-paper [data-edit-path='profile.name']");
  await name.fill("");
  await name.blur();
  await page.locator("#btn-export-menu").click();
  await page.locator("#btn-print").click();
  await expect(page.getByRole("heading", { name: "投递 PDF 检查" })).toBeVisible();
  await expect(page.locator(".readiness-item.blocker")).toContainText("姓名");
  await expect(page.getByRole("button", { name: "打开打印对话框" })).toBeDisabled();
  await page.getByRole("button", { name: "返回修改" }).click();
  await page.locator("#btn-export-menu").click();
  const downloadPromise = page.waitForEvent("download");
  await page.locator("#btn-export-json").click();
  expect(await downloadPromise).toBeTruthy();
});

for (const viewport of [
  { width: 1440, height: 1024 },
  { width: 1280, height: 800 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
]) {
  test(`关键布局在 ${viewport.width}x${viewport.height} 内无视口溢出`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const result = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      bodyWidth: document.body.scrollWidth,
      overlapping: [...document.querySelectorAll("button")].some((button) => {
        const rect = button.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && (rect.right > window.innerWidth + 1 || rect.left < -1);
      }),
    }));
    expect(result.bodyWidth).toBeLessThanOrEqual(result.viewport);
    expect(result.overlapping).toBe(false);
    if (viewport.width <= 900) {
      await page.locator("[data-mobile-view='preview']").click();
      await expect(page.locator("#resume-paper")).toBeVisible();
      await page.locator("#inspector-handle").click();
      await expect(page.locator("#inspector-layout")).toBeVisible();
    }
  });
}

test("移动端检查器支持拖动，并保留焦点、动效与触控约束", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  const handle = page.locator("#inspector-handle");
  await expect.poll(async () => (await handle.boundingBox())?.y || 0).toBeGreaterThan(760);

  await page.getByRole("tab", { name: "版式" }).click();
  const recommended = page.locator("[data-recommended-template-id]").first();
  const recommendedId = await recommended.getAttribute("data-recommended-template-id");
  await recommended.click();
  await expect(page.locator("#resume-paper")).toHaveAttribute("data-template", recommendedId);

  await page.keyboard.press("Tab");
  const focus = await page.evaluate(() => ({
    tag: document.activeElement?.tagName,
    outline: getComputedStyle(document.activeElement).outlineStyle,
  }));
  expect(focus.tag).toBe("BUTTON");
  expect(focus.outline).not.toBe("none");
  const transitionSeconds = await page.locator("#inspector").evaluate((element) => parseFloat(getComputedStyle(element).transitionDuration));
  expect(transitionSeconds).toBeLessThan(0.001);

  const undersized = await page.locator('button, input:not([type="checkbox"]):not([type="radio"]), select, textarea').evaluateAll((controls) => controls
    .map((button) => ({ id: button.id, tag: button.tagName, type: button.type || "", rect: button.getBoundingClientRect() }))
    .filter(({ rect }) => rect.width > 0 && rect.height > 0 && (rect.width < 39.5 || rect.height < 39.5))
    .map(({ id, tag, type, rect }) => ({ id, tag, type, width: rect.width, height: rect.height })));
  expect(undersized).toEqual([]);
  const inspectorSurface = await page.locator("#inspector").evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(inspectorSurface).toMatch(/^rgb\(/);

  let box = await handle.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, 300, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator("body")).toHaveClass(/inspector-open/);
  await expect(handle).toHaveAttribute("aria-expanded", "true");

  box = await handle.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, 838, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator("body")).not.toHaveClass(/inspector-open/);
  await expect(handle).toHaveAttribute("aria-expanded", "false");
});

test("导出状态不包含 AI 密钥", async ({ page }) => {
  await page.evaluate(() => {
    sessionStorage.setItem("resume-formatter:ai-credential-session-v3", JSON.stringify({ provider: "custom", baseUrl: "https://secret.example/v1", model: "example", apiKey: "SHOULD_NOT_EXPORT" }));
  });
  const downloadPromise = page.waitForEvent("download");
  await page.locator("#btn-export-menu").click();
  await page.locator("#btn-export-json").click();
  const download = await downloadPromise;
  const path = await download.path();
  const content = await (await import("node:fs/promises")).readFile(path, "utf8");
  expect(content).not.toContain("SHOULD_NOT_EXPORT");
  expect(JSON.parse(content).schemaVersion).toBe(2);
});

test("PDF 与 DOCX 在浏览器本地解析并进入确认流程", async ({ page, context }) => {
  const source = await context.newPage();
  await source.setContent(`<main><h1>示例用户</h1><p>产品设计师</p><p>pdf@example.com</p><h2>工作经历</h2><p>示例机构</p><p>2022 - 至今</p><p>• 完成 4 个项目</p></main>`);
  const pdfBuffer = await source.pdf({ format: "A4", printBackground: true });
  await source.close();

  await page.locator("#resume-file-input").setInputFiles({ name: "sample.pdf", mimeType: "application/pdf", buffer: pdfBuffer });
  await expect(page.getByRole("heading", { name: "确认导入" })).toBeVisible();
  await expect(page.locator(".import-stat").nth(1)).toContainText("未映射片段");
  await page.getByRole("button", { name: "确认导入" }).click();
  await expect(page.locator("#resume-paper [data-edit-path='profile.name']")).toHaveText("示例用户");

  const docxBuffer = await createDocxBuffer();
  await page.locator("#resume-file-input").setInputFiles({
    name: "sample.docx",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    buffer: docxBuffer,
  });
  await expect(page.getByRole("heading", { name: "确认导入" })).toBeVisible();
  await page.getByRole("button", { name: "确认导入" }).click();
  await expect(page.locator("#resume-paper [data-edit-path='profile.name']")).toHaveText("示例用户");
});

test("扫描型 PDF 与损坏 DOCX 返回可恢复错误", async ({ page, context }) => {
  const scanned = await context.newPage();
  await scanned.setContent(`<canvas id="scan" width="900" height="1200"></canvas><script>const c=document.querySelector('canvas').getContext('2d');c.fillStyle='#fff';c.fillRect(0,0,900,1200);c.fillStyle='#111';c.font='48px sans-serif';c.fillText('image only resume',80,120);</script>`);
  const pdfBuffer = await scanned.pdf({ format: "A4", printBackground: true });
  await scanned.close();
  await page.locator("#resume-file-input").setInputFiles({ name: "scan.pdf", mimeType: "application/pdf", buffer: pdfBuffer });
  await expect(page.locator("#toast-root")).toContainText("不支持 OCR");

  await page.locator("#resume-file-input").setInputFiles({
    name: "broken.docx",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    buffer: Buffer.from("not a docx"),
  });
  await expect(page.locator("#toast-root")).toContainText("DOCX 无法读取");
});

test("溢出定位、自动适配和照片调整保持页面可恢复", async ({ page }) => {
  const summary = page.locator("#resume-paper [data-edit-path='summary']");
  await summary.fill("面向复杂业务的产品设计与交付经验。".repeat(90));
  await summary.blur();
  await expect(page.locator("#overflow-status")).toHaveAttribute("data-status", "overflow");
  await expect(page.locator("#resume-paper .overflow-start")).toHaveCount(1);
  const before = await page.locator("#resume-paper").evaluate((paper) => paper.querySelector(".paper-content").scrollHeight - paper.querySelector(".paper-content").clientHeight);
  await page.locator("#btn-auto-fit").click();
  const after = await page.locator("#resume-paper").evaluate((paper) => paper.querySelector(".paper-content").scrollHeight - paper.querySelector(".paper-content").clientHeight);
  expect(after).toBeLessThanOrEqual(before);

  await page.locator("#btn-photo").click();
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
  await page.locator("#photo-file-input").setInputFiles({ name: "portrait.png", mimeType: "image/png", buffer: png });
  await page.locator(".modal input[type='range']").first().fill("1.25");
  await page.getByRole("button", { name: "应用" }).click();
  await expect(page.locator("#resume-paper .resume-photo img")).toBeVisible();
});

test("独立 HTML 可离线重开并恢复内嵌状态", async ({ page, context }, testInfo) => {
  const name = page.locator("#resume-paper [data-edit-path='profile.name']");
  await name.fill("离线样例用户");
  await name.blur();
  const downloadPromise = page.waitForEvent("download");
  await page.locator("#btn-export-menu").click();
  await page.locator("#btn-export-html").click();
  const download = await downloadPromise;
  const path = testInfo.outputPath("offline-resume.html");
  await download.saveAs(path);
  const offlineHtml = await readFile(path, "utf8");
  const inlineScript = offlineHtml.match(/<script>([\s\S]*?)<\/script>/i)?.[1] || "";
  const serializedHash = createHash("sha256").update(inlineScript).digest("base64");
  expect(offlineHtml).toContain(`script-src 'sha256-${serializedHash}'`);
  const reopened = await context.newPage();
  const externalRequests = [];
  const securityErrors = [];
  reopened.on("request", (request) => { if (!request.url().startsWith("file:")) externalRequests.push(request.url()); });
  reopened.on("console", (message) => { if (/content security policy|refused to/i.test(message.text())) securityErrors.push(message.text()); });
  await reopened.goto(pathToFileURL(path).href);
  await expect(reopened.locator("#resume-paper [data-edit-path='profile.name']")).toHaveText("离线样例用户");
  const securityMeta = await reopened.evaluate(() => ({
    csp: document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content || "",
    referrer: document.querySelector('meta[name="referrer"]')?.content || "",
    embeddedTag: document.querySelector("#embedded-resume-state")?.tagName || "",
  }));
  expect(securityMeta.csp).toMatch(/script-src 'sha256-/);
  expect(securityMeta.referrer).toBe("no-referrer");
  expect(securityMeta.embeddedTag).toBe("TEMPLATE");
  expect(externalRequests).toEqual([]);
  expect(securityErrors).toEqual([]);
  await reopened.close();
});
