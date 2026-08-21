import {
  APP_VERSION,
  TEMPLATES,
  clone,
  createDefaultDocument,
  createId,
  documentToPlainText,
  migrateDocument,
} from "./contracts.js";

export const WORKSPACE_VERSION = 1;

const WORKSPACE_KEY = "resume-formatter:application-workspace-v1";
const ROLLBACK_KEY = "resume-formatter:pre-workspace-rollback-v1";
const DOCUMENT_KEY = "resume-formatter:document-v2";
const VERSION_KEY = "resume-formatter:versions-v2";
const LEGACY_LAST_KEY = "resume-formatter:last-document";

const CREDENTIAL_FIELD = /^(?:api[-_]?key|secret|password|credential|access[-_]?token|refresh[-_]?token)$/i;

function safeStorage(storage) {
  try {
    const key = "__rf_workspace_probe__";
    storage.setItem(key, "1");
    storage.removeItem(key);
    return storage;
  } catch {
    return null;
  }
}

function now() {
  return new Date().toISOString();
}

function normalizeLanguage(value) {
  return ["zh-CN", "en"].includes(value) ? value : "zh-CN";
}

function stableAssetHash(value) {
  const source = String(value || "");
  let hash = 0xcbf29ce484222325n;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= BigInt(source.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return `fnv1a64-${hash.toString(16).padStart(16, "0")}-${source.length}`;
}

function photoMime(dataUrl) {
  return String(dataUrl).match(/^data:([^;,]+)[;,]/)?.[1] || "application/octet-stream";
}

export function dehydrateDocumentAssets(document, assetCatalog = {}) {
  const result = migrateDocument(clone(document));
  const photo = result.assets?.photo;
  if (!photo?.dataUrl) return result;
  let assetId = stableAssetHash(photo.dataUrl);
  const collision = assetCatalog[assetId] && assetCatalog[assetId].dataUrl !== photo.dataUrl;
  if (collision) assetId = `${assetId}-${stableAssetHash(photo.dataUrl.slice(-2048))}`;
  if (!assetCatalog[assetId]) {
    assetCatalog[assetId] = Object.freeze({
      id: assetId,
      hash: assetId,
      kind: "photo",
      mime: photoMime(photo.dataUrl),
      dataUrl: photo.dataUrl,
      createdAt: now(),
    });
  }
  result.assets.photo = {
    assetId,
    scale: Number(photo.scale || 1),
    offsetX: Number(photo.offsetX || 0),
    offsetY: Number(photo.offsetY || 0),
  };
  return result;
}

export function hydrateDocumentAssets(document, assetCatalog = {}) {
  const result = migrateDocument(clone(document));
  const photo = result.assets?.photo;
  if (!photo?.assetId || photo.dataUrl) return result;
  const asset = assetCatalog[photo.assetId];
  result.assets.photo = asset?.dataUrl ? { ...photo, dataUrl: asset.dataUrl } : null;
  return result;
}

export function createEvidenceRecord(input = {}) {
  return {
    id: input.id || createId("evidence"),
    fieldPath: String(input.fieldPath || ""),
    context: String(input.context || ""),
    task: String(input.task || ""),
    action: String(input.action || ""),
    scope: String(input.scope || ""),
    result: String(input.result || ""),
    source: String(input.source || ""),
    verification: ["verified", "unverified", "not-applicable"].includes(input.verification)
      ? input.verification
      : "unverified",
    createdAt: input.createdAt || now(),
    updatedAt: input.updatedAt || now(),
  };
}

export function validateEvidence(record) {
  const issues = [];
  if (!record?.action?.trim()) issues.push({ code: "EVIDENCE_ACTION", field: "action", message: "需要填写个人行动。" });
  if (!record?.result?.trim()) issues.push({ code: "EVIDENCE_RESULT", field: "result", message: "结果未知时请明确填写“待补充”。" });
  if (record?.verification === "verified" && !record?.source?.trim()) {
    issues.push({ code: "EVIDENCE_SOURCE", field: "source", message: "标记为已核实时需要填写证明来源。" });
  }
  return issues;
}

export function createApplicationRecord(input = {}) {
  const timestamp = now();
  return {
    id: input.id || createId("application"),
    company: String(input.company || ""),
    role: String(input.role || ""),
    language: normalizeLanguage(input.language),
    jdText: String(input.jdText || ""),
    sourceNote: String(input.sourceNote || ""),
    documentId: String(input.documentId || ""),
    masterBaseline: input.masterBaseline ? migrateDocument(clone(input.masterBaseline)) : null,
    evidence: Array.isArray(input.evidence) ? input.evidence.map(createEvidenceRecord) : [],
    requirementMatches: Array.isArray(input.requirementMatches) ? clone(input.requirementMatches) : [],
    exportRecords: Array.isArray(input.exportRecords) ? clone(input.exportRecords) : [],
    confirmations: Array.isArray(input.confirmations) ? [...new Set(input.confirmations.map(String))] : [],
    status: ["draft", "ready", "applied", "archived"].includes(input.status) ? input.status : "draft",
    createdAt: input.createdAt || timestamp,
    updatedAt: input.updatedAt || timestamp,
  };
}

function documentRecord(document, kind, input = {}) {
  const normalized = migrateDocument(document);
  return {
    id: normalized.documentId,
    kind,
    applicationId: input.applicationId || null,
    title: String(input.title || normalized.resumeName || (kind === "master" ? "简历母版" : "岗位版本")),
    status: input.status === "frozen" ? "frozen" : "editable",
    document: normalized,
    createdAt: input.createdAt || now(),
    updatedAt: input.updatedAt || now(),
  };
}

function readLegacyDocument(storage) {
  const current = storage?.getItem(DOCUMENT_KEY);
  if (current) {
    try { return migrateDocument(JSON.parse(current)); } catch { /* recover below */ }
  }
  const legacyId = storage?.getItem(LEGACY_LAST_KEY);
  const legacy = legacyId ? storage?.getItem(`resume-formatter:draft:${legacyId}`) : null;
  if (legacy) {
    try { return migrateDocument(JSON.parse(legacy)); } catch { /* recover below */ }
  }
  return createDefaultDocument();
}

function readLegacyVersions(storage) {
  try { return JSON.parse(storage?.getItem(VERSION_KEY) || "[]"); } catch { return []; }
}

export function createWorkspaceFromLegacy(document, versions = []) {
  const master = migrateDocument(document || createDefaultDocument());
  const timestamp = now();
  return {
    workspaceVersion: WORKSPACE_VERSION,
    appVersion: APP_VERSION,
    workspaceId: createId("workspace"),
    masterDocumentId: master.documentId,
    activeDocumentId: master.documentId,
    documents: {
      [master.documentId]: documentRecord(master, "master", { title: master.resumeName || "简历母版" }),
    },
    applications: [],
    assets: {},
    masterHistory: Array.isArray(versions) ? versions.map((version) => ({
      id: version.id || createId("history"),
      name: String(version.name || "历史版本"),
      createdAt: version.createdAt || timestamp,
      document: migrateDocument(version.document || master),
    })) : [],
    metadata: { createdAt: timestamp, updatedAt: timestamp, migratedAt: timestamp, source: "resume-v2" },
  };
}

export function normalizeWorkspace(input) {
  if (!input || typeof input !== "object") throw new Error("工作区必须是 JSON 对象。");
  if (Number(input.workspaceVersion) !== WORKSPACE_VERSION) throw new Error(`不支持工作区 v${input.workspaceVersion ?? "?"}。`);
  const rawDocuments = input.documents && typeof input.documents === "object" ? input.documents : {};
  const documents = {};
  for (const raw of Object.values(rawDocuments)) {
    if (!raw?.document) continue;
    const record = documentRecord(raw.document, raw.kind === "master" ? "master" : "application", raw);
    documents[record.id] = record;
  }
  const masterDocumentId = String(input.masterDocumentId || Object.values(documents).find((item) => item.kind === "master")?.id || "");
  if (!masterDocumentId || !documents[masterDocumentId]) throw new Error("工作区缺少有效母版。");
  documents[masterDocumentId].kind = "master";
  const applications = Array.isArray(input.applications)
    ? input.applications.map(createApplicationRecord).filter((item) => documents[item.documentId])
    : [];
  const activeDocumentId = documents[input.activeDocumentId] ? input.activeDocumentId : masterDocumentId;
  const workspace = {
    workspaceVersion: WORKSPACE_VERSION,
    appVersion: APP_VERSION,
    workspaceId: String(input.workspaceId || createId("workspace")),
    masterDocumentId,
    activeDocumentId,
    documents,
    applications,
    assets: input.assets && typeof input.assets === "object" ? clone(input.assets) : {},
    masterHistory: Array.isArray(input.masterHistory) ? clone(input.masterHistory) : [],
    metadata: {
      createdAt: input.metadata?.createdAt || now(),
      updatedAt: input.metadata?.updatedAt || now(),
      migratedAt: input.metadata?.migratedAt || null,
      source: String(input.metadata?.source || "workspace-v1"),
    },
  };
  for (const record of Object.values(workspace.documents)) {
    record.document = dehydrateDocumentAssets(hydrateDocumentAssets(record.document, workspace.assets), workspace.assets);
  }
  return workspace;
}

function stripCredentials(value) {
  if (Array.isArray(value)) return value.map(stripCredentials);
  if (!value || typeof value !== "object") return value;
  const result = {};
  for (const [key, child] of Object.entries(value)) {
    if (!CREDENTIAL_FIELD.test(key)) result[key] = stripCredentials(child);
  }
  return result;
}

export function createWorkspaceBackup(workspace) {
  const normalized = normalizeWorkspace(workspace);
  return stripCredentials({
    backupType: "resume-formatter-workspace",
    exportedAt: now(),
    workspace: normalized,
  });
}

export function importWorkspaceBackup(input) {
  const source = input?.backupType === "resume-formatter-workspace" ? input.workspace : input;
  return normalizeWorkspace(stripCredentials(source));
}

function requirementCategory(text) {
  if (/(本科|硕士|博士|学历|degree|bachelor|master)/i.test(text)) return "education";
  if (/(年经验|years? of experience|经验)/i.test(text)) return "experience";
  if (/(负责|职责|推动|管理|responsib|deliver|lead)/i.test(text)) return "responsibility";
  if (/(熟悉|掌握|技能|工具|技术|proficien|skill|sql|python|figma|java|cloud)/i.test(text)) return "skill";
  return "other";
}

function requirementKeywords(text) {
  const stop = new Set(["负责", "要求", "相关", "工作", "岗位", "能力", "经验", "熟悉", "以及", "能够", "具有", "优先", "以上", "the", "and", "with", "for", "you", "are", "will"]);
  return [...new Set((String(text).toLowerCase().match(/[a-z][a-z0-9+#.-]{1,}|[\u4e00-\u9fff]{2,8}/g) || [])
    .filter((token) => !stop.has(token)))].slice(0, 8);
}

export function extractJDRequirements(jdText) {
  const pieces = String(jdText || "")
    .replace(/\r/g, "")
    .split(/\n+|(?<=[。；;])\s*/)
    .map((item) => item.replace(/^\s*(?:[-*•·]|\d+[.)、])\s*/, "").trim())
    .filter((item) => item.length >= 4)
    .slice(0, 80);
  return pieces.map((text, index) => ({
    id: `requirement-${index + 1}-${stableAssetHash(text).slice(8, 16)}`,
    excerpt: text.slice(0, 500),
    category: requirementCategory(text),
    importance: /(优先|加分|preferred|nice to have)/i.test(text) ? "preferred" : "required",
    keywords: requirementKeywords(text),
  }));
}

function textHits(haystack, keywords) {
  if (!keywords.length) return 0;
  return keywords.filter((keyword) => haystack.includes(keyword.toLowerCase())).length;
}

export function matchRequirements(document, evidence, requirements) {
  const resumeText = documentToPlainText(document).toLowerCase();
  const evidenceText = (evidence || []).map((item) => [item.context, item.task, item.action, item.scope, item.result].join(" ")).join("\n").toLowerCase();
  return (requirements || []).map((requirement) => {
    const resumeHits = textHits(resumeText, requirement.keywords || []);
    const evidenceHits = textHits(evidenceText, requirement.keywords || []);
    const threshold = Math.min(2, Math.max(1, requirement.keywords?.length || 1));
    const status = resumeHits >= threshold ? "evidence"
      : evidenceHits >= threshold ? "expression_gap"
        : "unknown";
    return {
      id: requirement.id,
      excerpt: requirement.excerpt,
      category: requirement.category,
      importance: requirement.importance,
      status,
      evidencePaths: status === "evidence" ? ["resume"] : status === "expression_gap" ? (evidence || []).filter((item) => textHits([item.action, item.result].join(" ").toLowerCase(), requirement.keywords || [])).map((item) => `evidence.${item.id}`) : [],
      explanation: status === "evidence" ? "简历中存在可定位的关键词证据。" : status === "expression_gap" ? "证据表中存在相关信息，但简历表达尚未覆盖。" : "现有简历与证据不足以判断，不自动推断能力缺口。",
      suggestion: status === "expression_gap" ? "选择对应证据生成或补充 Bullet。" : status === "unknown" ? "补充证据，或手动标记真实能力缺口。" : "核对表述是否准确。",
      source: "deterministic",
    };
  });
}

export function recommendTemplates(document, application = {}) {
  const contentLength = documentToPlainText(document).length;
  const roleText = `${application.role || ""} ${document.profile?.headline || ""}`.toLowerCase();
  return TEMPLATES.map((template) => {
    let score = template.machineReadability === "caution" ? -4 : 4;
    const reasons = [template.machineReadability === "caution" ? "双栏存在机器读取风险" : "单栏阅读顺序稳定"];
    const keywordHits = template.keywords.filter((keyword) => roleText.includes(keyword.toLowerCase()));
    if (keywordHits.length) { score += keywordHits.length * 5; reasons.unshift(`匹配${keywordHits.slice(0, 2).join("、")}岗位语境`); }
    if (application.language === "en" && template.id === "international-standard") { score += 14; reasons.unshift("适合英文岗位版本"); }
    if (contentLength > 2800 && ["zh-compact", "tech-precision"].includes(template.id)) { score += 8; reasons.unshift("适合较长内容"); }
    if (document.layout?.showPhoto && template.supportsPhoto) { score += 2; reasons.push("支持照片"); }
    if (document.layout?.showPhoto && !template.supportsPhoto) score -= 2;
    return { templateId: template.id, score, reasons: reasons.slice(0, 2) };
  }).sort((left, right) => right.score - left.score || left.templateId.localeCompare(right.templateId)).slice(0, 3);
}

export class ApplicationWorkspaceStore {
  constructor(storage = globalThis.localStorage) {
    this.storage = storage ? safeStorage(storage) : null;
    this.workspace = this.load();
  }

  load() {
    if (!this.storage) return createWorkspaceFromLegacy(createDefaultDocument());
    const current = this.storage.getItem(WORKSPACE_KEY);
    if (current) {
      try { return normalizeWorkspace(JSON.parse(current)); } catch { /* recover from legacy below */ }
    }
    const legacyDocument = this.storage.getItem(DOCUMENT_KEY);
    const legacyVersions = this.storage.getItem(VERSION_KEY);
    if (!this.storage.getItem(ROLLBACK_KEY) && (legacyDocument || legacyVersions)) {
      this.storage.setItem(ROLLBACK_KEY, JSON.stringify({
        capturedAt: now(),
        document: legacyDocument || null,
        versions: legacyVersions || null,
      }));
    }
    const workspace = createWorkspaceFromLegacy(readLegacyDocument(this.storage), readLegacyVersions(this.storage));
    this.workspace = workspace;
    this.persist();
    return workspace;
  }

  persist() {
    if (!this.storage || !this.workspace) return false;
    this.workspace.appVersion = APP_VERSION;
    this.workspace.metadata.updatedAt = now();
    this.storage.setItem(WORKSPACE_KEY, JSON.stringify(this.workspace));
    return true;
  }

  getActiveRecord() {
    return this.workspace.documents[this.workspace.activeDocumentId];
  }

  getActiveDocument() {
    return hydrateDocumentAssets(this.getActiveRecord().document, this.workspace.assets);
  }

  getMasterDocument() {
    return hydrateDocumentAssets(this.workspace.documents[this.workspace.masterDocumentId].document, this.workspace.assets);
  }

  getActiveApplication() {
    return this.workspace.applications.find((item) => item.documentId === this.workspace.activeDocumentId) || null;
  }

  setActiveDocument(document, { persist = true } = {}) {
    const record = this.getActiveRecord();
    if (!record) throw new Error("活动文档不存在。");
    record.document = dehydrateDocumentAssets(document, this.workspace.assets);
    record.title = document.resumeName || record.title;
    record.updatedAt = now();
    if (record.kind === "master") this.workspace.masterDocumentId = record.id;
    if (persist) this.persist();
  }

  activate(documentId) {
    if (!this.workspace.documents[documentId]) throw new Error("岗位版本不存在。");
    this.workspace.activeDocumentId = documentId;
    this.persist();
    return this.getActiveDocument();
  }

  createApplication(input = {}) {
    const master = this.getMasterDocument();
    const applicationId = createId("application");
    const document = migrateDocument(clone(master));
    document.documentId = createId("resume");
    document.resumeName = [input.company, input.role].filter(Boolean).join(" - ") || "新岗位版本";
    document.metadata.createdAt = now();
    document.metadata.updatedAt = now();
    const application = createApplicationRecord({ ...input, id: applicationId, documentId: document.documentId, masterBaseline: master });
    this.workspace.documents[document.documentId] = documentRecord(
      dehydrateDocumentAssets(document, this.workspace.assets),
      "application",
      { applicationId, title: document.resumeName },
    );
    this.workspace.applications.push(application);
    this.workspace.activeDocumentId = document.documentId;
    this.persist();
    return application;
  }

  updateApplication(applicationId, changes) {
    const application = this.workspace.applications.find((item) => item.id === applicationId);
    if (!application) throw new Error("岗位任务不存在。");
    for (const key of ["company", "role", "jdText", "sourceNote", "status"]) {
      if (key in changes) application[key] = String(changes[key] ?? "");
    }
    if ("language" in changes) application.language = normalizeLanguage(changes.language);
    if (Array.isArray(changes.requirementMatches)) application.requirementMatches = clone(changes.requirementMatches);
    application.updatedAt = now();
    const record = this.workspace.documents[application.documentId];
    if (record && ("company" in changes || "role" in changes)) record.title = [application.company, application.role].filter(Boolean).join(" - ") || "岗位版本";
    this.persist();
    return application;
  }

  addEvidence(applicationId, input) {
    const application = this.workspace.applications.find((item) => item.id === applicationId);
    if (!application) throw new Error("岗位任务不存在。");
    const record = createEvidenceRecord(input);
    const issues = validateEvidence(record);
    if (issues.length) throw new Error(issues.map((item) => item.message).join(" "));
    application.evidence.unshift(record);
    application.updatedAt = now();
    this.persist();
    return record;
  }

  setRequirementStatus(applicationId, requirementId, status) {
    const allowed = ["evidence", "expression_gap", "evidence_gap", "capability_gap", "unknown"];
    if (!allowed.includes(status)) throw new Error("要求匹配状态无效。");
    const application = this.workspace.applications.find((item) => item.id === applicationId);
    const requirement = application?.requirementMatches.find((item) => item.id === requirementId);
    if (!requirement) throw new Error("岗位要求不存在。");
    requirement.status = status;
    requirement.source = "user";
    application.updatedAt = now();
    this.persist();
  }

  recordExport(type, details = {}) {
    const application = this.getActiveApplication();
    if (!application) return null;
    const record = { id: createId("export"), type, createdAt: now(), ...clone(details) };
    application.exportRecords.unshift(record);
    if (type === "pdf") application.status = "applied";
    this.persist();
    return record;
  }

  replaceWorkspace(input) {
    this.workspace = importWorkspaceBackup(input);
    this.persist();
    return this.getActiveDocument();
  }

  backup() {
    return createWorkspaceBackup(this.workspace);
  }
}

export const workspaceStorageKeys = Object.freeze({
  workspace: WORKSPACE_KEY,
  rollback: ROLLBACK_KEY,
  document: DOCUMENT_KEY,
  versions: VERSION_KEY,
});
