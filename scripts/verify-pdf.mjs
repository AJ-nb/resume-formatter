import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { connect } from "node:net";
import { chromium } from "playwright";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const localPort = 43118;
const url = process.env.RESUME_FORMATTER_URL || `http://127.0.0.1:${localPort}`;
const outputDir = join(process.cwd(), "output", "pdf");
const outputPath = join(outputDir, "anonymous-resume.pdf");
await mkdir(outputDir, { recursive: true });

let server = null;
if (!process.env.RESUME_FORMATTER_URL) {
  server = spawn(process.execPath, [join(process.cwd(), "scripts", "serve.mjs"), String(localPort)], {
    cwd: process.cwd(),
    stdio: "ignore",
  });
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const ready = await new Promise((resolve) => {
      const socket = connect(localPort, "127.0.0.1");
      socket.once("connect", () => { socket.end(); resolve(true); });
      socket.once("error", () => resolve(false));
    });
    if (ready) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
    if (attempt === 49) throw new Error("PDF 验证服务器启动超时");
  }
}

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1024 } });
  await page.goto(url, { waitUntil: "networkidle" });
  await page.emulateMedia({ media: "print" });
  await page.pdf({
    path: outputPath,
    printBackground: true,
    preferCSSPageSize: true,
    tagged: true,
  });
} finally {
  await browser.close();
  server?.kill();
}

const bytes = new Uint8Array(await readFile(outputPath));
const pdf = await getDocument({ data: bytes, isEvalSupported: false }).promise;
assert.equal(pdf.numPages, 1, "匿名样例应打印为单页");
const firstPage = await pdf.getPage(1);
const viewport = firstPage.getViewport({ scale: 1 });
assert.ok(Math.abs(viewport.width - 595.28) < 2, `A4 宽度异常：${viewport.width}`);
assert.ok(Math.abs(viewport.height - 841.89) < 2, `A4 高度异常：${viewport.height}`);
const text = (await firstPage.getTextContent()).items.map((item) => item.str).join(" ");
const normalizedText = text.replace(/(\p{Script=Han})\s+(?=\p{Script=Han})/gu, "$1");
assert.match(normalizedText, /林知远/, "PDF 应保留可选择的姓名文字");
assert.match(normalizedText, /工作经历/, "PDF 应保留可选择的栏目文字");
console.log(`PDF verified: ${outputPath} | ${pdf.numPages} page | ${viewport.width.toFixed(2)} x ${viewport.height.toFixed(2)} pt | selectable text ${text.length} chars`);
