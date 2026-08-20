import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import pdfWorkerSource from "pdfjs-dist/legacy/build/pdf.worker.mjs?raw";
import mammoth from "mammoth/mammoth.browser.js";
import { importTextByName, parseExtractedResumeText } from "./import-core.js";

export const FILE_LIMITS = Object.freeze({ maxBytes: 25 * 1024 * 1024, maxPdfPages: 30 });

let workerUrl = "";
function ensurePdfWorker() {
  if (!workerUrl) workerUrl = URL.createObjectURL(new Blob([pdfWorkerSource], { type: "text/javascript" }));
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
}

function checkSize(file) {
  if (file.size > FILE_LIMITS.maxBytes) throw new Error("文件超过 25 MB 限制。");
}

export async function importPdf(file, options = {}) {
  checkSize(file);
  ensurePdfWorker();
  const data = new Uint8Array(await file.arrayBuffer());
  let pdf;
  try {
    pdf = await pdfjs.getDocument({ data, isEvalSupported: false }).promise;
  } catch (error) {
    throw new Error(`PDF 无法读取：${error?.message || "文件可能已损坏或受密码保护"}`);
  }
  if (pdf.numPages > FILE_LIMITS.maxPdfPages) throw new Error(`PDF 共 ${pdf.numPages} 页，超过 30 页限制。`);
  const pages = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    if (options.signal?.aborted) throw new DOMException("导入已取消", "AbortError");
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    let text = "";
    for (const item of content.items) {
      text += `${item.str || ""}${item.hasEOL ? "\n" : " "}`;
    }
    pages.push(text.trim());
  }
  const raw = pages.join("\n\n").trim();
  if (raw.replace(/\s/g, "").length < Math.max(30, pdf.numPages * 12)) {
    throw new Error("PDF 中没有足够的可选择文字，可能是扫描件。本工具不支持 OCR，也不会静默猜测内容。");
  }
  const result = parseExtractedResumeText(raw, file.name);
  result.source = { type: "pdf", fileName: file.name, pages: pdf.numPages };
  result.warnings.push({ code: "PDF_LAYOUT", message: "PDF 只提取可选择文字；请确认栏目顺序、日期与未映射片段。" });
  return result;
}

export async function importDocx(file) {
  checkSize(file);
  let extracted;
  try {
    extracted = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
  } catch (error) {
    throw new Error(`DOCX 无法读取：${error?.message || "文件可能已损坏"}`);
  }
  const result = parseExtractedResumeText(extracted.value, file.name);
  result.source = { type: "docx", fileName: file.name };
  result.warnings.push(...(extracted.messages || []).map((item) => ({
    code: "DOCX_PARSER",
    message: item.message || String(item),
  })));
  result.warnings.push({ code: "DOCX_LAYOUT", message: "DOCX 只提取本地文字；表格与视觉布局需要在导入确认中复核。" });
  return result;
}

export async function importResumeFile(file, options = {}) {
  checkSize(file);
  const name = file.name || "resume";
  if (/\.pdf$/i.test(name) || file.type === "application/pdf") return importPdf(file, options);
  if (/\.docx$/i.test(name) || /wordprocessingml/.test(file.type)) return importDocx(file);
  if (/\.(md|markdown|json)$/i.test(name) || /(?:json|text|markdown)/.test(file.type)) {
    const raw = await file.text();
    try { return importTextByName(raw, name); } catch (error) { throw new Error(`文件解析失败：${error.message}`); }
  }
  throw new Error("支持 Markdown、JSON、JSON Resume、PDF 和 DOCX 文件。");
}
