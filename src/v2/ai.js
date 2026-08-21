import { documentToPlainText } from "./contracts.js";

export const AI_PROVIDERS = Object.freeze({
  openai: { name: "OpenAI", baseUrl: "https://api.openai.com/v1", model: "gpt-5-mini", protocol: "responses", keyRequired: true, structuredOutput: "json_schema" },
  deepseek: { name: "DeepSeek", baseUrl: "https://api.deepseek.com", model: "deepseek-chat", protocol: "chat", keyRequired: true, structuredOutput: "json_object" },
  gemini: { name: "Gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta", model: "gemini-2.5-flash", protocol: "gemini", keyRequired: true, structuredOutput: "json_schema" },
  openrouter: { name: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", model: "openai/gpt-5-mini", protocol: "chat", keyRequired: true, structuredOutput: "json_schema" },
  biyuan: {
    name: "彼源 AI",
    baseUrl: "https://api.biyuan.ai/v1",
    model: "",
    protocol: "chat",
    keyRequired: true,
    structuredOutput: "prompt",
    minimalChatRequest: true,
    supportsModelDiscovery: true,
  },
  ollama: { name: "Ollama", baseUrl: "http://localhost:11434/v1", model: "qwen3:8b", protocol: "chat", keyRequired: false, structuredOutput: "json_object" },
  custom: { name: "自定义兼容端点", baseUrl: "", model: "", protocol: "chat", keyRequired: true, structuredOutput: "json_schema" },
});

export const REWRITE_MODES = Object.freeze({
  professional: "专业化",
  concise: "精炼",
  impact: "结果导向",
});

const SESSION_KEY = "resume-formatter:ai-session-v2";
const LOCAL_KEY = "resume-formatter:ai-local-v2";

const rewriteSchema = {
  type: "object",
  additionalProperties: false,
  required: ["suggestion", "reason"],
  properties: {
    suggestion: { type: "string" },
    reason: { type: "string" },
  },
};

const reviewSchema = {
  type: "object",
  additionalProperties: false,
  required: ["issues"],
  properties: {
    issues: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["severity", "fieldPath", "title", "detail", "suggestion"],
        properties: {
          severity: { type: "string", enum: ["high", "medium", "low"] },
          fieldPath: { type: "string" },
          title: { type: "string" },
          detail: { type: "string" },
          suggestion: { type: "string" },
        },
      },
    },
  },
};

const jdSchema = {
  type: "object",
  additionalProperties: false,
  required: ["suggestions"],
  properties: {
    suggestions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["requirement", "evidence", "recommendation"],
        properties: {
          requirement: { type: "string" },
          evidence: { type: "string" },
          recommendation: { type: "string" },
        },
      },
    },
  },
};

export function normalizeAIConfig(input = {}) {
  const provider = AI_PROVIDERS[input.provider] ? input.provider : "openai";
  const defaults = AI_PROVIDERS[provider];
  return {
    provider,
    baseUrl: String(input.baseUrl || defaults.baseUrl).replace(/\/+$/, ""),
    model: String(input.model || defaults.model),
    apiKey: String(input.apiKey || ""),
    remember: Boolean(input.remember),
    testStatus: input.testStatus === "passed" ? "passed" : "untested",
    testedFingerprint: String(input.testedFingerprint || ""),
    testedAt: input.testedAt || null,
  };
}

export function redactConfig(config) {
  const { apiKey: _apiKey, ...safe } = normalizeAIConfig(config);
  return safe;
}

export function loadAIConfig(session = globalThis.sessionStorage, local = globalThis.localStorage) {
  for (const storage of [session, local]) {
    try {
      const value = storage?.getItem(storage === session ? SESSION_KEY : LOCAL_KEY);
      if (value) return normalizeAIConfig(JSON.parse(value));
    } catch { /* storage can be blocked under file:// */ }
  }
  return normalizeAIConfig();
}

export function saveAIConfig(config, session = globalThis.sessionStorage, local = globalThis.localStorage) {
  const value = normalizeAIConfig(config);
  try { session?.setItem(SESSION_KEY, JSON.stringify(value)); } catch { /* ignored */ }
  try {
    if (value.remember) local?.setItem(LOCAL_KEY, JSON.stringify(value));
    else local?.removeItem(LOCAL_KEY);
  } catch { /* ignored */ }
  return value;
}

export async function sha256(value) {
  const bytes = new TextEncoder().encode(String(value));
  if (globalThis.crypto?.subtle) {
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  let hash = 2166136261;
  for (const byte of bytes) hash = Math.imul(hash ^ byte, 16777619);
  return `fallback-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export async function configFingerprint(config) {
  const value = normalizeAIConfig(config);
  return sha256([value.provider, value.baseUrl, value.model, value.apiKey].join("\u241f"));
}

export async function createSelectionReference({ fieldPath, text, start, end, sectionTitle = "", bulletId = "" }) {
  const selectedText = String(text).slice(start, end);
  return {
    fieldPath,
    start,
    end,
    originalText: selectedText,
    originalHash: await sha256(selectedText),
    sectionTitle,
    bulletId,
  };
}

export async function selectionIsCurrent(reference, currentValue) {
  if (!reference || typeof currentValue !== "string") return false;
  const selected = currentValue.slice(reference.start, reference.end);
  return selected === reference.originalText && await sha256(selected) === reference.originalHash;
}

function collectFacts(text) {
  const source = String(text || "");
  const patterns = [
    /(?<![\p{L}\d])(?:19|20)\d{2}(?:[./-]\d{1,2})?(?![\p{L}\d])/gu,
    /(?<![\p{L}\d])\d+(?:\.\d+)?\s*(?:%|％|万|亿|k|m|K|M)(?![\p{L}])/gu,
    /(?<![\p{L}\d])\d+(?:\.\d+)?(?![\p{L}\d])/gu,
    /\b[A-Z][A-Z0-9+.#-]{1,}\b/g,
  ];
  const facts = new Map();
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const key = match[0].replace(/\s+/g, "").toUpperCase();
      facts.set(key, (facts.get(key) || 0) + 1);
    }
  }
  return facts;
}

export function compareFacts(original, suggestion) {
  const before = collectFacts(original);
  const after = collectFacts(suggestion);
  const removed = [];
  const added = [];
  for (const [fact, count] of before) {
    if ((after.get(fact) || 0) < count) removed.push(fact);
  }
  for (const [fact, count] of after) {
    if ((before.get(fact) || 0) < count) added.push(fact);
  }
  return {
    removed,
    added,
    changed: removed.length > 0 || added.length > 0,
    message: removed.length || added.length
      ? `事实信息发生变化：删除 ${removed.join("、") || "无"}；新增 ${added.join("、") || "无"}。`
      : "未检测到数字、日期、比例或大写缩写变化。",
  };
}

export function validateRewritePayload(payload, original) {
  if (!payload || typeof payload !== "object") throw new Error("AI 返回内容不是对象。");
  const suggestion = String(payload.suggestion || "").trim();
  if (!suggestion) throw new Error("AI 没有返回改写建议。");
  if (suggestion.length > Math.max(8000, String(original).length * 8)) throw new Error("AI 返回内容异常过长。");
  const factWarnings = compareFacts(original, suggestion);
  return {
    suggestion,
    reason: String(payload.reason || "").trim(),
    factWarnings,
    requiresConfirmation: factWarnings.changed,
  };
}

function parseJsonText(text) {
  const source = String(text || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try { return JSON.parse(source); } catch {
    const start = source.indexOf("{");
    const end = source.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(source.slice(start, end + 1));
    throw new Error("AI 返回了无法解析的 JSON。");
  }
}

function schemaPrompt(schema) {
  return [
    "输出要求：只返回一个符合下列 JSON Schema 的 JSON 对象，不要添加 Markdown、解释或其他文字。",
    JSON.stringify(schema),
  ].join("\n");
}

function chatMessageText(choice) {
  const content = choice?.message?.content;
  if (typeof content === "string" && content.trim()) return content;
  if (Array.isArray(content)) {
    const text = content
      .map((part) => typeof part === "string" ? part : part?.text)
      .filter((part) => typeof part === "string")
      .join("")
      .trim();
    if (text) return text;
  }
  if (content && typeof content === "object" && typeof content.text === "string" && content.text.trim()) {
    return content.text;
  }
  if (typeof choice?.text === "string" && choice.text.trim()) return choice.text;
  return "";
}

function outputFromResponses(data) {
  if (typeof data?.output_text === "string") return data.output_text;
  for (const item of data?.output || []) {
    for (const content of item?.content || []) {
      if (typeof content?.text === "string") return content.text;
    }
  }
  throw new Error("OpenAI Responses 返回中缺少文本输出。");
}

function validateConfig(config, { requireModel = true } = {}) {
  const value = normalizeAIConfig(config);
  const provider = AI_PROVIDERS[value.provider];
  if (!value.baseUrl) throw new Error("请填写 Base URL。");
  if (requireModel && !value.model) throw new Error("请填写模型名称。");
  if (provider.keyRequired && !value.apiKey) throw new Error("请填写 API Key。");
  let parsed;
  try { parsed = new URL(value.baseUrl); } catch { throw new Error("Base URL 不是有效网址。"); }
  if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("Base URL 只支持 HTTP 或 HTTPS。");
  return value;
}

async function fetchWithTimeout(url, options, timeoutMs, fetchImpl, externalSignal) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException("请求超时", "TimeoutError")), timeoutMs);
  const onAbort = () => controller.abort(externalSignal.reason);
  externalSignal?.addEventListener("abort", onAbort, { once: true });
  try {
    const response = await fetchImpl(url, { ...options, signal: controller.signal });
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 500);
      if (response.status === 401 || response.status === 403) throw new Error(`认证失败（${response.status}），请检查密钥与端点。`);
      throw new Error(`请求失败（${response.status}）：${detail || response.statusText}`);
    }
    return response;
  } catch (error) {
    if (error?.name === "AbortError" || error?.name === "TimeoutError") throw new Error("请求已取消或超时。");
    if (error instanceof TypeError) throw new Error(`网络或 CORS 错误：${error.message}`);
    throw error;
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener("abort", onAbort);
  }
}

function openAIHeaders(config) {
  const headers = { "Content-Type": "application/json" };
  if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;
  if (config.provider === "openrouter") {
    headers["HTTP-Referer"] = "https://aj-nb.github.io/resume-formatter/";
    headers["X-Title"] = "Resume Formatter";
  }
  return headers;
}

async function callResponses(config, system, user, schema, options) {
  const response = await fetchWithTimeout(`${config.baseUrl}/responses`, {
    method: "POST",
    headers: openAIHeaders(config),
    body: JSON.stringify({
      model: config.model,
      input: [
        { role: "system", content: [{ type: "input_text", text: system }] },
        { role: "user", content: [{ type: "input_text", text: user }] },
      ],
      text: { format: { type: "json_schema", name: "resume_formatter_result", strict: true, schema } },
    }),
  }, options.timeoutMs, options.fetchImpl, options.signal);
  return parseJsonText(outputFromResponses(await response.json()));
}

async function callChat(config, system, user, schema, options) {
  const provider = AI_PROVIDERS[config.provider];
  const systemPrompt = provider.structuredOutput === "prompt"
    ? `${system}\n\n${schemaPrompt(schema)}`
    : system;
  const body = {
    model: config.model,
    messages: [{ role: "system", content: systemPrompt }, { role: "user", content: user }],
  };
  if (!provider.minimalChatRequest) {
    body.temperature = 0.2;
    body.stream = false;
  }
  if (provider.structuredOutput === "json_schema") {
    body.response_format = { type: "json_schema", json_schema: { name: "resume_formatter_result", strict: true, schema } };
  } else if (provider.structuredOutput === "json_object") {
    body.response_format = { type: "json_object" };
  }
  const response = await fetchWithTimeout(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: openAIHeaders(config),
    body: JSON.stringify(body),
  }, options.timeoutMs, options.fetchImpl, options.signal);
  const data = await response.json();
  if (data?.error) {
    const detail = typeof data.error === "string" ? data.error : data.error.message || JSON.stringify(data.error);
    throw new Error(`提供商返回错误：${String(detail).slice(0, 500)}`);
  }
  const choice = data?.choices?.[0];
  if (choice?.finish_reason === "length") throw new Error("模型输出因长度限制被截断，请重试或更换模型。");
  const content = chatMessageText(choice);
  if (!content) throw new Error("兼容端点没有返回最终文本，请重试或选择支持 Chat Completions 的模型。");
  return parseJsonText(content);
}

export async function listAvailableModels(config, options = {}) {
  const value = validateConfig(config, { requireModel: false });
  const provider = AI_PROVIDERS[value.provider];
  if (!provider.supportsModelDiscovery) throw new Error("当前提供商不支持在应用内读取模型列表。");
  const fetchImpl = options.fetchImpl || globalThis.fetch?.bind(globalThis);
  if (!fetchImpl) throw new Error("当前环境不支持网络请求。");
  const response = await fetchWithTimeout(`${value.baseUrl}/models`, {
    method: "GET",
    headers: openAIHeaders(value),
  }, options.timeoutMs || 15_000, fetchImpl, options.signal);
  let data;
  try { data = await response.json(); } catch { throw new Error("模型列表返回了无法解析的 JSON。"); }
  const source = Array.isArray(data?.data) ? data.data : Array.isArray(data?.models) ? data.models : [];
  const models = [...new Set(source
    .map((item) => typeof item === "string" ? item : item?.id || item?.name)
    .map((item) => String(item || "").trim())
    .filter(Boolean))];
  if (!models.length) throw new Error("接口没有返回可用模型，请检查令牌权限或分组设置。");
  return { provider: value.provider, models };
}

async function callGemini(config, system, user, schema, options) {
  const endpoint = `${config.baseUrl}/models/${encodeURIComponent(config.model)}:generateContent?key=${encodeURIComponent(config.apiKey)}`;
  const response = await fetchWithTimeout(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: { responseMimeType: "application/json", responseJsonSchema: schema, temperature: 0.2 },
    }),
  }, options.timeoutMs, options.fetchImpl, options.signal);
  const data = await response.json();
  const content = data?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("");
  if (!content) throw new Error("Gemini 返回中缺少候选文本。");
  return parseJsonText(content);
}

export async function requestStructured(config, { system, user, schema }, options = {}) {
  const value = validateConfig(config);
  const runtime = {
    fetchImpl: options.fetchImpl || globalThis.fetch?.bind(globalThis),
    timeoutMs: options.timeoutMs || 30_000,
    signal: options.signal,
  };
  if (!runtime.fetchImpl) throw new Error("当前环境不支持网络请求。");
  const protocol = AI_PROVIDERS[value.provider].protocol;
  if (protocol === "responses") return callResponses(value, system, user, schema, runtime);
  if (protocol === "gemini") return callGemini(value, system, user, schema, runtime);
  return callChat(value, system, user, schema, runtime);
}

export async function testConnection(config, options = {}) {
  const value = validateConfig(config);
  const schema = {
    type: "object",
    additionalProperties: false,
    required: ["ok"],
    properties: { ok: { type: "boolean" } },
  };
  const started = performance.now?.() ?? Date.now();
  const result = await requestStructured(value, {
    system: "Return JSON only. This is a connectivity test.",
    user: "Return {\"ok\": true}.",
    schema,
  }, { ...options, timeoutMs: options.timeoutMs || 15_000 });
  if (result?.ok !== true) throw new Error("连接已建立，但模型没有返回预期结构。");
  const fingerprint = await configFingerprint(value);
  return {
    ...value,
    testStatus: "passed",
    testedFingerprint: fingerprint,
    testedAt: new Date().toISOString(),
    latencyMs: Math.round((performance.now?.() ?? Date.now()) - started),
  };
}

export async function assertTestedConfig(config) {
  const value = normalizeAIConfig(config);
  const fingerprint = await configFingerprint(value);
  if (value.testStatus !== "passed" || value.testedFingerprint !== fingerprint) {
    throw new Error("当前配置尚未通过连接测试，或测试后配置已改变。");
  }
  return value;
}

export async function rewriteSelection(config, request, options = {}) {
  const value = await assertTestedConfig(config);
  const mode = REWRITE_MODES[request.mode] || REWRITE_MODES.professional;
  const context = {
    fieldPath: request.reference.fieldPath,
    section: request.reference.sectionTitle || "",
    selectedText: request.reference.originalText,
    mode,
    jdContext: request.jdContext || "",
  };
  const payload = await requestStructured(value, {
    system: [
      "你是严谨的简历编辑。只改写用户选中的文字，不虚构事实，不添加原文没有的数字、日期、技能、公司或结果。",
      "保持语言与原文一致。专业化强调清晰与可信；精炼删除冗余；结果导向只重组已有结果，不创造结果。",
      "返回符合 JSON Schema 的对象。",
    ].join("\n"),
    user: JSON.stringify(context),
    schema: rewriteSchema,
  }, options);
  return {
    ...validateRewritePayload(payload, request.reference.originalText),
    provider: value.provider,
    model: value.model,
    createdAt: new Date().toISOString(),
    reference: request.reference,
  };
}

export async function reviewResume(config, document, options = {}) {
  const value = await assertTestedConfig(config);
  const payload = await requestStructured(value, {
    system: "你是简历审阅者。只列出具体、可执行的问题，不批量改写，不虚构经历。severity 只用 high、medium、low，fieldPath 应尽量指向输入中的栏目。返回 JSON。",
    user: documentToPlainText(document),
    schema: reviewSchema,
  }, options);
  if (!Array.isArray(payload?.issues)) throw new Error("全文审阅结果缺少 issues 数组。");
  return { issues: payload.issues.slice(0, 30), provider: value.provider, model: value.model };
}

export function deterministicJDKeywords(document, jdText) {
  const resumeText = documentToPlainText(document).toLowerCase();
  const tokens = String(jdText || "")
    .toLowerCase()
    .match(/[a-z][a-z0-9+#.-]{1,}|[\u4e00-\u9fff]{2,8}/g) || [];
  const stop = new Set(["负责", "要求", "相关", "工作", "岗位", "能力", "经验", "熟悉", "以及", "能够", "具有", "优先", "the", "and", "with", "for", "you", "are"]);
  const counts = new Map();
  for (const token of tokens) if (!stop.has(token)) counts.set(token, (counts.get(token) || 0) + 1);
  const keywords = [...counts.entries()].filter(([, count]) => count >= 1).sort((a, b) => b[1] - a[1]).slice(0, 24);
  return keywords.map(([keyword, frequency]) => ({ keyword, frequency, matched: resumeText.includes(keyword) }));
}

export async function compareWithJD(config, document, jdText, options = {}) {
  const value = await assertTestedConfig(config);
  const keywords = deterministicJDKeywords(document, jdText);
  const payload = await requestStructured(value, {
    system: "对照岗位描述与简历，只指出已有证据与缺口。不得把岗位要求写成候选人已具备的事实，不得虚构关键词命中。返回 JSON。",
    user: JSON.stringify({ resume: documentToPlainText(document), jobDescription: String(jdText).slice(0, 20_000) }),
    schema: jdSchema,
  }, options);
  if (!Array.isArray(payload?.suggestions)) throw new Error("JD 对照结果缺少 suggestions 数组。");
  return { keywords, suggestions: payload.suggestions.slice(0, 20), provider: value.provider, model: value.model };
}

export const aiStorageKeys = Object.freeze({ session: SESSION_KEY, local: LOCAL_KEY });
