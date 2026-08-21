import assert from "node:assert/strict";
import test from "node:test";
import { clearResumeFormatterStorage, createLocalDataInventory, redactSensitiveText, stripSensitiveData } from "../src/v2/privacy.js";

class MemoryStorage {
  constructor(entries = {}) { this.values = new Map(Object.entries(entries)); }
  get length() { return this.values.size; }
  key(index) { return [...this.values.keys()][index] ?? null; }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

test("递归脱敏删除凭据字段并替换活动密钥文本", () => {
  const source = { note: "保留", apiKey: "field-secret", clientSecret: "nested-secret", authToken: "token-secret", nested: [{ password: "hidden", text: "Bearer bearer-secret-value" }, "active-secret-value"] };
  const result = stripSensitiveData(source, { secrets: ["active-secret-value"] });
  assert.deepEqual(result, { note: "保留", nested: [{ text: "[REDACTED]" }, "[REDACTED]"] });
  assert.equal(redactSensitiveText("https://example.test/v1?key=visible", []), "https://example.test/v1?key=[REDACTED]");
  assert.equal(redactSensitiveText('api_key="visible-value"', []), 'api_key="[REDACTED]"');
});

test("清理仅删除 resume-formatter 前缀并保留同来源其他数据", () => {
  const local = new MemoryStorage({ "resume-formatter:document-v2": "private", "another-app:state": "keep" });
  const session = new MemoryStorage({ "resume-formatter:ai-credential-session-v3": "secret", "unrelated": "keep" });
  const removed = clearResumeFormatterStorage(local, session);
  assert.deepEqual(removed.local, ["resume-formatter:document-v2"]);
  assert.deepEqual(removed.session, ["resume-formatter:ai-credential-session-v3"]);
  assert.equal(local.getItem("another-app:state"), "keep");
  assert.equal(session.getItem("unrelated"), "keep");
});

test("本地数据清点只返回计数与凭据状态", () => {
  const inventory = createLocalDataInventory({
    documents: { master: {}, job: {} },
    applications: [{ jdText: "虚构 JD", evidence: [{ id: "e1" }] }],
    assets: { photo: {} },
    masterHistory: [{ id: "v1" }, { id: "v2" }],
  }, [{ id: "v1" }], { apiKey: "secret" });
  assert.deepEqual(inventory, { documents: 2, applications: 1, assets: 1, versions: 2, jdCharacters: 5, evidence: 1, hasCredential: true });
});
