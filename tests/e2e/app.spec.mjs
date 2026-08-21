import { expect, test } from "@playwright/test";
import JSZip from "jszip";
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
    await page.locator(`[data-template-id='${templateId}']`).click();
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
  for (const templateId of TEMPLATE_IDS) {
    await page.locator("#quick-template").selectOption(templateId);
    await expect(page.locator("#resume-paper")).toHaveAttribute("data-template", templateId);
    await expect(page.locator("#overflow-status")).toHaveAttribute("data-status", "ok");
  }
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
  const rememberCheckbox = page.getByLabel("记住到本机");
  const rememberBox = await rememberCheckbox.boundingBox();
  expect(rememberBox.width).toBeLessThanOrEqual(20);
  expect(rememberBox.height).toBeLessThanOrEqual(20);
  const fields = page.locator(".modal input");
  await fields.nth(0).fill("example-model");
  await fields.nth(1).fill("https://mock.example/v1");
  await fields.nth(2).fill("test-key");
  await page.getByRole("button", { name: "测试连接并保存" }).click();
  await expect(page.locator("#ai-status-badge")).toContainText("已连接");

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
  const fields = page.locator(".modal input");
  await fields.nth(2).fill("other-provider-key");
  await page.locator(".modal select").selectOption("biyuan");
  await expect(fields.nth(1)).toHaveValue("https://api.biyuan.ai/v1");
  await expect(fields.nth(0)).toHaveValue("");
  await expect(fields.nth(2)).toHaveValue("");
  await fields.nth(2).fill("test-key");
  await page.getByRole("button", { name: "读取可用模型" }).click();
  await expect(page.locator(".field-help")).toContainText("已读取 2 个");
  expect(modelsRequest.headers().authorization).toBe("Bearer test-key");
  expect(modelsRequest.postData()).toBeNull();

  await fields.nth(0).fill("gpt-example");
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
  await expect.poll(async () => (await handle.boundingBox())?.y || 0).toBeGreaterThan(780);

  await page.getByRole("tab", { name: "版式" }).click();
  await page.locator("#quick-template").selectOption("tech-precision");
  await expect(page.locator("#resume-paper")).toHaveAttribute("data-template", "tech-precision");

  await page.keyboard.press("Tab");
  const focus = await page.evaluate(() => ({
    tag: document.activeElement?.tagName,
    outline: getComputedStyle(document.activeElement).outlineStyle,
  }));
  expect(focus.tag).toBe("BUTTON");
  expect(focus.outline).not.toBe("none");
  const transitionSeconds = await page.locator("#inspector").evaluate((element) => parseFloat(getComputedStyle(element).transitionDuration));
  expect(transitionSeconds).toBeLessThan(0.001);

  const undersized = await page.locator("button").evaluateAll((buttons) => buttons
    .map((button) => ({ id: button.id, rect: button.getBoundingClientRect() }))
    .filter(({ id, rect }) => id !== "inspector-handle" && rect.width > 0 && rect.height > 0 && (rect.width < 24 || rect.height < 24))
    .map(({ id, rect }) => ({ id, width: rect.width, height: rect.height })));
  expect(undersized).toEqual([]);

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
    sessionStorage.setItem("resume-formatter:ai-session-v2", JSON.stringify({ provider: "custom", apiKey: "SHOULD_NOT_EXPORT" }));
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
  const reopened = await context.newPage();
  const externalRequests = [];
  reopened.on("request", (request) => { if (!request.url().startsWith("file:")) externalRequests.push(request.url()); });
  await reopened.goto(pathToFileURL(path).href);
  await expect(reopened.locator("#resume-paper [data-edit-path='profile.name']")).toHaveText("离线样例用户");
  expect(externalRequests).toEqual([]);
  await reopened.close();
});
