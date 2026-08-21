import assert from "node:assert/strict";
import test from "node:test";
import {
  AI_PROVIDERS,
  compareFacts,
  createSelectionReference,
  listAvailableModels,
  requestStructured,
  selectionIsCurrent,
  testConnection,
  validateRewritePayload,
} from "../src/v2/ai.js";

const okSchema = { type: "object", additionalProperties: false, required: ["ok"], properties: { ok: { type: "boolean" } } };

function responseFor(url) {
  if (url.includes(":generateContent")) return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "{\"ok\":true}" }] } }] }), { status: 200 });
  if (url.endsWith("/responses")) return new Response(JSON.stringify({ output_text: "{\"ok\":true}" }), { status: 200 });
  return new Response(JSON.stringify({ choices: [{ message: { content: "{\"ok\":true}" } }] }), { status: 200 });
}

test("选区哈希检测陈旧内容", async () => {
  const reference = await createSelectionReference({ fieldPath: "summary", text: "一段需要改写的文字", start: 2, end: 8 });
  assert.equal(reference.originalText, "需要改写的文");
  assert.equal(await selectionIsCurrent(reference, "一段需要改写的文字"), true);
  assert.equal(await selectionIsCurrent(reference, "一段已经改写的文字"), false);
});

test("数字、日期、比例和专有缩写变化触发事实保护", () => {
  const unchanged = compareFacts("2024 年将 API 延迟降低 25%", "在 2024 年推动 API 优化，延迟降低 25%");
  assert.equal(unchanged.changed, false);
  const changed = compareFacts("2024 年将 API 延迟降低 25%", "2025 年将 API 延迟降低 40%");
  assert.equal(changed.changed, true);
  assert.ok(changed.removed.includes("2024"));
  assert.ok(changed.added.includes("40%"));
  const validated = validateRewritePayload({ suggestion: "2025 年完成 8 个项目", reason: "更具体" }, "2024 年完成 6 个项目");
  assert.equal(validated.requiresConfirmation, true);
});

test("七类提供商连接测试使用各自协议且无主动请求", async () => {
  let calls = 0;
  const requests = [];
  const fetchImpl = async (url, options) => { calls += 1; requests.push({ url: String(url), options }); return responseFor(String(url)); };
  assert.equal(calls, 0);
  for (const provider of Object.keys(AI_PROVIDERS)) {
    const defaults = AI_PROVIDERS[provider];
    const config = {
      provider,
      baseUrl: defaults.baseUrl || "https://custom.example.com/v1",
      model: defaults.model || "example-model",
      apiKey: defaults.keyRequired ? "test-key" : "",
    };
    const result = await testConnection(config, { fetchImpl, timeoutMs: 100 });
    assert.equal(result.testStatus, "passed");
    assert.ok(result.testedFingerprint);
  }
  assert.equal(calls, 7);
  const biyuan = requests.find((request) => request.url === "https://api.biyuan.ai/v1/chat/completions");
  assert.ok(biyuan);
  assert.equal(biyuan.options.headers.Authorization, "Bearer test-key");
  assert.deepEqual(Object.keys(JSON.parse(biyuan.options.body)).sort(), ["messages", "model"]);
});

test("彼源读取当前令牌可用模型且不发送简历内容", async () => {
  let request;
  const result = await listAvailableModels({
    provider: "biyuan",
    apiKey: "test-key",
  }, {
    fetchImpl: async (url, options) => {
      request = { url: String(url), options };
      return new Response(JSON.stringify({ data: [{ id: "gpt-example" }, { id: "claude-example" }, { id: "gpt-example" }] }), { status: 200 });
    },
  });
  assert.equal(request.url, "https://api.biyuan.ai/v1/models");
  assert.equal(request.options.method, "GET");
  assert.equal(request.options.headers.Authorization, "Bearer test-key");
  assert.equal(request.options.body, undefined);
  assert.deepEqual(result.models, ["gpt-example", "claude-example"]);
});

test("彼源 prompt 模式携带完整 Schema 并兼容文本分片响应", async () => {
  let body;
  const schema = {
    type: "object",
    additionalProperties: false,
    required: ["suggestion", "reason"],
    properties: { suggestion: { type: "string" }, reason: { type: "string" } },
  };
  const result = await requestStructured({
    provider: "biyuan",
    apiKey: "test-key",
    model: "gpt-example",
  }, {
    system: "只改写选中的文字。",
    user: '{"selectedText":"负责产品设计"}',
    schema,
  }, {
    fetchImpl: async (_url, options) => {
      body = JSON.parse(options.body);
      return new Response(JSON.stringify({
        choices: [{
          message: { content: [{ type: "text", text: '```json\n{"suggestion":"主导产品设计","reason":"职责表达更清晰"}\n```' }] },
        }],
      }), { status: 200 });
    },
  });
  assert.deepEqual(Object.keys(body).sort(), ["messages", "model"]);
  assert.match(body.messages[0].content, /JSON Schema/);
  assert.match(body.messages[0].content, /"required":\["suggestion","reason"\]/);
  assert.deepEqual(result, { suggestion: "主导产品设计", reason: "职责表达更清晰" });
});

test("兼容端点区分提供商错误、截断和空最终文本", async () => {
  const config = { provider: "biyuan", apiKey: "test-key", model: "gpt-example" };
  const request = { system: "s", user: "u", schema: okSchema };
  await assert.rejects(() => requestStructured(config, request, {
    fetchImpl: async () => new Response(JSON.stringify({ error: { message: "upstream unavailable" } }), { status: 200 }),
  }), /upstream unavailable/);
  await assert.rejects(() => requestStructured(config, request, {
    fetchImpl: async () => new Response(JSON.stringify({ choices: [{ finish_reason: "length", message: { content: "" } }] }), { status: 200 }),
  }), /长度限制被截断/);
  await assert.rejects(() => requestStructured(config, request, {
    fetchImpl: async () => new Response(JSON.stringify({ choices: [{ message: { content: null } }] }), { status: 200 }),
  }), /没有返回最终文本/);
});

test("彼源模型读取覆盖认证、空列表和非法响应", async () => {
  const config = { provider: "biyuan", apiKey: "test-key" };
  await assert.rejects(() => listAvailableModels(config, {
    fetchImpl: async () => new Response("Invalid token", { status: 401 }),
  }), /认证失败/);
  await assert.rejects(() => listAvailableModels(config, {
    fetchImpl: async () => new Response("{broken", { status: 200 }),
  }), /无法解析的 JSON/);
  await assert.rejects(() => listAvailableModels(config, {
    fetchImpl: async () => new Response(JSON.stringify({ data: [] }), { status: 200 }),
  }), /没有返回可用模型/);
});

test("401、CORS、超时、取消与非法响应均给出失败", async () => {
  const config = { provider: "openai", baseUrl: "https://api.openai.com/v1", model: "test", apiKey: "bad" };
  await assert.rejects(() => requestStructured(config, { system: "s", user: "u", schema: okSchema }, {
    fetchImpl: async () => new Response("unauthorized", { status: 401 }),
  }), /认证失败/);
  await assert.rejects(() => requestStructured(config, { system: "s", user: "u", schema: okSchema }, {
    fetchImpl: async () => { throw new TypeError("Failed to fetch"); },
  }), /CORS/);
  await assert.rejects(() => requestStructured(config, { system: "s", user: "u", schema: okSchema }, {
    timeoutMs: 5,
    fetchImpl: (_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))),
  }), /取消或超时/);
  const controller = new AbortController();
  const pending = requestStructured(config, { system: "s", user: "u", schema: okSchema }, {
    signal: controller.signal,
    fetchImpl: (_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))),
  });
  controller.abort();
  await assert.rejects(() => pending, /取消或超时/);
  await assert.rejects(() => requestStructured(config, { system: "s", user: "u", schema: okSchema }, {
    fetchImpl: async () => new Response("{broken", { status: 200 }),
  }), /JSON/);
});

test("响应体中断不会产生可应用结果", async () => {
  const config = { provider: "openai", baseUrl: "https://api.openai.com/v1", model: "test", apiKey: "key" };
  const interrupted = {
    ok: true,
    json: async () => { throw new SyntaxError("Unexpected end of JSON input"); },
  };
  await assert.rejects(() => requestStructured(config, { system: "s", user: "u", schema: okSchema }, { fetchImpl: async () => interrupted }), /Unexpected end/);
});
