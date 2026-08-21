import assert from "node:assert/strict";
import test from "node:test";
import { evaluateExportReadiness, runResumeChecks } from "../src/v2/checks.js";
import { createDefaultDocument } from "../src/v2/contracts.js";
import {
  ApplicationWorkspaceStore,
  createEvidenceRecord,
  createWorkspaceBackup,
  extractJDRequirements,
  importWorkspaceBackup,
  matchRequirements,
  validateEvidence,
  workspaceStorageKeys,
} from "../src/v2/workspace.js";

class MemoryStorage {
  constructor(entries = {}) { this.values = new Map(Object.entries(entries)); }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

test("旧简历与版本迁入母版且保留回滚来源", () => {
  const document = createDefaultDocument();
  document.profile.name = "迁移候选人";
  const serialized = JSON.stringify(document);
  const versions = JSON.stringify([{ id: "old-v1", name: "初稿", createdAt: "2026-01-01T00:00:00.000Z", document }]);
  const storage = new MemoryStorage({
    "resume-formatter:document-v2": serialized,
    "resume-formatter:versions-v2": versions,
  });
  const store = new ApplicationWorkspaceStore(storage);
  assert.equal(store.getMasterDocument().profile.name, "迁移候选人");
  assert.equal(store.workspace.masterHistory[0].id, "old-v1");
  assert.equal(storage.getItem("resume-formatter:document-v2"), serialized);
  assert.equal(storage.getItem("resume-formatter:versions-v2"), versions);
  const rollback = JSON.parse(storage.getItem(workspaceStorageKeys.rollback));
  assert.equal(rollback.document, serialized);
  assert.equal(rollback.versions, versions);
});

test("岗位版本保存创建基线并与母版独立编辑", () => {
  const storage = new MemoryStorage();
  const store = new ApplicationWorkspaceStore(storage);
  const masterSummary = store.getMasterDocument().summary;
  const application = store.createApplication({ company: "示例科技", role: "产品经理" });
  const jobDocument = store.getActiveDocument();
  assert.equal(application.masterBaseline.summary, masterSummary);
  jobDocument.summary = "岗位定制摘要";
  store.setActiveDocument(jobDocument);
  store.activate(store.workspace.masterDocumentId);
  assert.equal(store.getActiveDocument().summary, masterSummary);
  store.activate(application.documentId);
  assert.equal(store.getActiveDocument().summary, "岗位定制摘要");
});

test("照片资产按稳定哈希去重并可恢复完整简历", () => {
  const store = new ApplicationWorkspaceStore(new MemoryStorage());
  const master = store.getMasterDocument();
  master.assets.photo = { dataUrl: "data:image/png;base64,QUJD", scale: 1.2, offsetX: 2, offsetY: -3 };
  store.setActiveDocument(master);
  const first = store.createApplication({ company: "甲公司", role: "设计师" });
  store.activate(store.workspace.masterDocumentId);
  const second = store.createApplication({ company: "乙公司", role: "设计师" });
  assert.equal(Object.keys(store.workspace.assets).length, 1);
  store.activate(first.documentId);
  assert.equal(store.getActiveDocument().assets.photo.dataUrl, "data:image/png;base64,QUJD");
  store.activate(second.documentId);
  assert.equal(store.getActiveDocument().assets.photo.scale, 1.2);
});

test("证据要求个人行动、明确结果和已核实来源", () => {
  assert.deepEqual(validateEvidence(createEvidenceRecord({})).map((item) => item.code), ["EVIDENCE_ACTION", "EVIDENCE_RESULT"]);
  assert.deepEqual(validateEvidence(createEvidenceRecord({ action: "重构流程", result: "待补充" })), []);
  assert.deepEqual(validateEvidence(createEvidenceRecord({ action: "重构流程", result: "耗时下降 20%", verification: "verified" })).map((item) => item.code), ["EVIDENCE_SOURCE"]);
});

test("JD 本地提取区分必要与优先且不推断真实能力缺口", () => {
  const requirements = extractJDRequirements(`岗位要求\n- 熟悉 SQL 与 Python\n- 3 年以上数据分析经验\n- 有云平台经验优先`);
  assert.ok(requirements.some((item) => item.category === "skill"));
  assert.ok(requirements.some((item) => item.category === "experience"));
  assert.ok(requirements.some((item) => item.importance === "preferred"));
  const document = createDefaultDocument();
  const matches = matchRequirements(document, [{ action: "使用 SQL 分析漏斗", result: "待补充" }], requirements);
  assert.ok(matches.every((item) => item.source === "deterministic"));
  assert.ok(matches.every((item) => item.status !== "capability_gap"));
});

test("PDF 门禁阻止硬错误并要求逐项确认警告", () => {
  const document = createDefaultDocument();
  document.profile.name = "";
  document.profile.email = "";
  document.profile.phone = "";
  document.layout.templateId = "visual-two-column";
  const checks = runResumeChecks(document, { overflow: { overflow: true, overflowMm: 4.2 } });
  assert.ok(checks.filter((item) => item.severity === "blocker").length >= 3);
  assert.equal(evaluateExportReadiness(checks, "pdf", checks.map((item) => item.code)).ready, false);
  assert.equal(evaluateExportReadiness(checks, "json", []).ready, true);

  const valid = createDefaultDocument();
  valid.layout.templateId = "visual-two-column";
  const warnings = runResumeChecks(valid);
  assert.equal(evaluateExportReadiness(warnings, "pdf", []).ready, false);
  assert.equal(evaluateExportReadiness(warnings, "pdf", warnings.filter((item) => item.severity === "warning").map((item) => item.code)).ready, true);
});

test("工作区备份包含岗位资料但递归剥离凭据", () => {
  const store = new ApplicationWorkspaceStore(new MemoryStorage());
  const application = store.createApplication({ company: "示例公司", role: "工程师", jdText: "负责可靠性平台" });
  const record = store.workspace.documents[application.documentId];
  record.document.apiKey = "credential-value-placeholder";
  record.document.nested = { password: "password-value-placeholder", note: "保留" };
  const backup = createWorkspaceBackup(store.workspace);
  const serialized = JSON.stringify(backup);
  assert.match(serialized, /负责可靠性平台/);
  assert.doesNotMatch(serialized, /credential-value-placeholder|password-value-placeholder|"apiKey"|"password"/);
  const restored = importWorkspaceBackup(backup);
  assert.equal(restored.applications[0].company, "示例公司");
  assert.equal(restored.documents[application.documentId].document.nested.note, "保留");
});
