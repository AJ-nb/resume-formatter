import {
  APP_VERSION,
  TEMPLATES,
  clone,
  createDefaultDocument,
  createId,
  documentToPlainText,
  migrateDocument,
} from "./contracts.js";
import { stripSensitiveData } from "./privacy.js";

export const WORKSPACE_VERSION = 1;

const WORKSPACE_KEY = "resume-formatter:application-workspace-v1";
const ROLLBACK_KEY = "resume-formatter:pre-workspace-rollback-v1";
const DOCUMENT_KEY = "resume-formatter:document-v2";
const VERSION_KEY = "resume-formatter:versions-v2";
const LEGACY_LAST_KEY = "resume-formatter:last-document";

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

function sameValue(left, right) {
  if (left === right) return true;
  if (left === undefined || right === undefined) return false;
  return JSON.stringify(left) === JSON.stringify(right);
}

function copyValue(value) {
  return value === undefined ? undefined : clone(value);
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

function normalizeAssetCatalog(input) {
  const result = {};
  if (!input || typeof input !== "object") return result;
  for (const [key, asset] of Object.entries(input)) {
    const dataUrl = typeof asset?.dataUrl === "string" && /^data:image\/(?:jpeg|png|webp);base64,/i.test(asset.dataUrl)
      ? asset.dataUrl
      : "";
    if (!dataUrl) continue;
    const id = String(key);
    result[id] = Object.freeze({
      id,
      hash: String(asset.hash || id),
      kind: "photo",
      mime: photoMime(dataUrl),
      dataUrl,
      createdAt: asset.createdAt ? String(asset.createdAt) : now(),
    });
  }
  return result;
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
  const dataUrl = typeof asset?.dataUrl === "string" && /^data:image\/(?:jpeg|png|webp);base64,/i.test(asset.dataUrl) ? asset.dataUrl : "";
  result.assets.photo = dataUrl ? { ...photo, dataUrl } : null;
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
    parentApplicationId: String(input.parentApplicationId || ""),
    lastMasterSyncAt: input.lastMasterSyncAt || null,
    submittedAt: input.submittedAt || null,
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
    assets: normalizeAssetCatalog(input.assets),
    masterHistory: Array.isArray(input.masterHistory) ? input.masterHistory.map((item) => ({
      id: String(item?.id || createId("history")),
      name: String(item?.name || "历史版本"),
      createdAt: item?.createdAt ? String(item.createdAt) : now(),
      document: migrateDocument(item?.document || documents[masterDocumentId].document),
    })) : [],
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

export function createWorkspaceBackup(workspace) {
  const normalized = normalizeWorkspace(workspace);
  return stripSensitiveData({
    backupType: "resume-formatter-workspace",
    exportedAt: now(),
    workspace: normalized,
  });
}

export function importWorkspaceBackup(input) {
  const source = input?.backupType === "resume-formatter-workspace" ? input.workspace : input;
  return normalizeWorkspace(stripSensitiveData(source));
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

const PROFILE_LABELS = Object.freeze({
  name: "姓名",
  headline: "求职方向",
  location: "所在地",
  phone: "电话",
  email: "邮箱",
  website: "网站",
  github: "GitHub",
});

function orderedIds(...lists) {
  const ids = [];
  for (const list of lists) {
    for (const item of list || []) if (item?.id && !ids.includes(item.id)) ids.push(item.id);
  }
  return ids;
}

function byId(list, id) {
  return (list || []).find((item) => item.id === id);
}

function syncChange(path, label, entityType, baselineValue, masterValue, jobValue) {
  const status = sameValue(jobValue, baselineValue) ? "auto" : "conflict";
  return {
    id: `master-sync-${stableAssetHash(path).slice(8, 24)}`,
    path,
    label,
    entityType,
    kind: masterValue === undefined ? "remove" : baselineValue === undefined ? "add" : "update",
    status,
    baselineValue: copyValue(baselineValue),
    masterValue: copyValue(masterValue),
    jobValue: copyValue(jobValue),
  };
}

function compareSyncValue(changes, path, label, entityType, baselineValue, masterValue, jobValue) {
  if (sameValue(masterValue, baselineValue) || sameValue(jobValue, masterValue)) return;
  changes.push(syncChange(path, label, entityType, baselineValue, masterValue, jobValue));
}

function compareEntity(changes, path, label, entityType, baselineValue, masterValue, jobValue) {
  if (baselineValue && masterValue && jobValue) return true;
  compareSyncValue(changes, path, label, entityType, baselineValue, masterValue, jobValue);
  return false;
}

export function createMasterSyncPlan(baselineInput, masterInput, jobInput) {
  const baseline = migrateDocument(baselineInput);
  const master = migrateDocument(masterInput);
  const job = migrateDocument(jobInput);
  const changes = [];

  for (const key of Object.keys(PROFILE_LABELS)) {
    compareSyncValue(changes, `profile.${key}`, PROFILE_LABELS[key], "field", baseline.profile?.[key], master.profile?.[key], job.profile?.[key]);
  }
  compareSyncValue(changes, "summary", "个人摘要", "field", baseline.summary, master.summary, job.summary);
  compareSyncValue(changes, "assets.photo", "证件照", "field", baseline.assets?.photo, master.assets?.photo, job.assets?.photo);

  for (const sectionId of orderedIds(master.sections, baseline.sections, job.sections)) {
    const baselineSection = byId(baseline.sections, sectionId);
    const masterSection = byId(master.sections, sectionId);
    const jobSection = byId(job.sections, sectionId);
    const sectionLabel = masterSection?.title || jobSection?.title || baselineSection?.title || "栏目";
    const sectionPath = `sections.${sectionId}`;
    if (!compareEntity(changes, sectionPath, sectionLabel, "section", baselineSection, masterSection, jobSection)) continue;
    compareSyncValue(changes, `${sectionPath}.title`, `${sectionLabel} · 栏目名称`, "field", baselineSection.title, masterSection.title, jobSection.title);
    compareSyncValue(changes, `${sectionPath}.type`, `${sectionLabel} · 栏目类型`, "field", baselineSection.type, masterSection.type, jobSection.type);

    for (const entryId of orderedIds(masterSection.entries, baselineSection.entries, jobSection.entries)) {
      const baselineEntry = byId(baselineSection.entries, entryId);
      const masterEntry = byId(masterSection.entries, entryId);
      const jobEntry = byId(jobSection.entries, entryId);
      const entryLabel = masterEntry?.name || masterEntry?.role || jobEntry?.name || baselineEntry?.name || "条目";
      const entryPath = `${sectionPath}.entries.${entryId}`;
      if (!compareEntity(changes, entryPath, `${sectionLabel} · ${entryLabel}`, "entry", baselineEntry, masterEntry, jobEntry)) continue;
      for (const [key, label] of [["name", "名称"], ["role", "角色"], ["date", "日期"], ["location", "地点"], ["summary", "说明"]]) {
        compareSyncValue(changes, `${entryPath}.${key}`, `${sectionLabel} · ${entryLabel} · ${label}`, "field", baselineEntry[key], masterEntry[key], jobEntry[key]);
      }

      for (const bulletId of orderedIds(masterEntry.bullets, baselineEntry.bullets, jobEntry.bullets)) {
        const baselineBullet = byId(baselineEntry.bullets, bulletId);
        const masterBullet = byId(masterEntry.bullets, bulletId);
        const jobBullet = byId(jobEntry.bullets, bulletId);
        const bulletPath = `${entryPath}.bullets.${bulletId}`;
        const bulletLabel = `${sectionLabel} · ${entryLabel} · ${(masterBullet?.text || jobBullet?.text || baselineBullet?.text || "Bullet").slice(0, 28)}`;
        if (!compareEntity(changes, bulletPath, bulletLabel, "bullet", baselineBullet, masterBullet, jobBullet)) continue;
        compareSyncValue(changes, `${bulletPath}.text`, bulletLabel, "field", baselineBullet.text, masterBullet.text, jobBullet.text);
      }
    }
  }

  return {
    planVersion: 1,
    createdAt: now(),
    baselineDocumentId: baseline.documentId,
    masterDocumentId: master.documentId,
    jobDocumentId: job.documentId,
    autoUpdates: changes.filter((item) => item.status === "auto"),
    conflicts: changes.filter((item) => item.status === "conflict"),
    changeCount: changes.length,
  };
}

function resolvePath(document, path) {
  const parts = path.split(".");
  let current = document;
  for (let index = 0; index < parts.length - 1; index += 1) {
    const part = parts[index];
    if (part === "sections") current = byId(current.sections, parts[++index]);
    else if (part === "entries") current = byId(current.entries, parts[++index]);
    else if (part === "bullets") current = byId(current.bullets, parts[++index]);
    else current = current?.[part];
    if (!current) throw new Error(`母版同步字段不存在：${path}`);
  }
  return { parent: current, key: parts.at(-1) };
}

function masterOrderedInsert(target, value, masterList) {
  const masterIndex = masterList.findIndex((item) => item.id === value.id);
  const nextMasterId = masterList.slice(masterIndex + 1).find((item) => target.some((candidate) => candidate.id === item.id))?.id;
  const targetIndex = nextMasterId ? target.findIndex((item) => item.id === nextMasterId) : target.length;
  target.splice(targetIndex, 0, clone(value));
}

function applyEntityChange(document, master, change) {
  const parts = change.path.split(".");
  let target;
  let masterList;
  if (change.entityType === "section") {
    target = document.sections;
    masterList = master.sections;
  } else if (change.entityType === "entry") {
    const sectionId = parts[1];
    target = byId(document.sections, sectionId)?.entries;
    masterList = byId(master.sections, sectionId)?.entries || [];
  } else {
    const sectionId = parts[1];
    const entryId = parts[3];
    target = byId(byId(document.sections, sectionId)?.entries, entryId)?.bullets;
    masterList = byId(byId(master.sections, sectionId)?.entries, entryId)?.bullets || [];
  }
  if (!target) throw new Error(`母版同步结构不存在：${change.path}`);
  const entityId = parts.at(-1);
  const index = target.findIndex((item) => item.id === entityId);
  if (change.masterValue === undefined) {
    if (index >= 0) target.splice(index, 1);
  } else if (index >= 0) {
    target[index] = clone(change.masterValue);
  } else {
    masterOrderedInsert(target, change.masterValue, masterList);
  }
}

function applySyncChange(document, master, change) {
  if (change.entityType !== "field") return applyEntityChange(document, master, change);
  const { parent, key } = resolvePath(document, change.path);
  parent[key] = copyValue(change.masterValue);
}

export function applyMasterSyncPlan(jobInput, masterInput, plan, resolutions = {}) {
  const document = migrateDocument(clone(jobInput));
  const master = migrateDocument(masterInput);
  for (const conflict of plan.conflicts || []) {
    if (!["master", "job"].includes(resolutions[conflict.id])) throw new Error(`需要选择如何处理：${conflict.label}`);
  }
  const selected = [
    ...(plan.autoUpdates || []),
    ...(plan.conflicts || []).filter((item) => resolutions[item.id] === "master"),
  ];
  const order = (item) => item.entityType === "field" ? 2 : item.kind === "remove" ? 0 : 1;
  selected.sort((left, right) => order(left) - order(right));
  for (const change of selected) applySyncChange(document, master, change);
  document.metadata.updatedAt = now();
  return {
    document,
    appliedChanges: selected.map((item) => item.id),
    keptChanges: (plan.conflicts || []).filter((item) => resolutions[item.id] === "job").map((item) => item.id),
  };
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
    const nextDocument = dehydrateDocumentAssets(document, this.workspace.assets);
    if (record.status === "frozen") {
      if (!sameValue(record.document, nextDocument)) throw new Error("已投递版本是只读快照，请复制后继续修改。");
      return false;
    }
    record.document = nextDocument;
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

  previewMasterSync(applicationId) {
    const application = this.workspace.applications.find((item) => item.id === applicationId);
    const record = application ? this.workspace.documents[application.documentId] : null;
    if (!application || !record) throw new Error("岗位任务不存在。");
    return createMasterSyncPlan(application.masterBaseline || this.getMasterDocument(), this.getMasterDocument(), hydrateDocumentAssets(record.document, this.workspace.assets));
  }

  syncApplicationWithMaster(applicationId, resolutions = {}) {
    const application = this.workspace.applications.find((item) => item.id === applicationId);
    const record = application ? this.workspace.documents[application.documentId] : null;
    if (!application || !record) throw new Error("岗位任务不存在。");
    if (record.status === "frozen") throw new Error("已投递版本不可同步，请复制后继续修改。");
    const master = this.getMasterDocument();
    const plan = this.previewMasterSync(applicationId);
    const result = applyMasterSyncPlan(hydrateDocumentAssets(record.document, this.workspace.assets), master, plan, resolutions);
    record.document = dehydrateDocumentAssets(result.document, this.workspace.assets);
    record.updatedAt = now();
    application.masterBaseline = clone(master);
    application.lastMasterSyncAt = now();
    application.updatedAt = now();
    this.persist();
    return { ...result, plan };
  }

  copyApplication(applicationId) {
    const source = this.workspace.applications.find((item) => item.id === applicationId);
    const sourceRecord = source ? this.workspace.documents[source.documentId] : null;
    if (!source || !sourceRecord) throw new Error("岗位任务不存在。");
    const applicationIdNext = createId("application");
    const document = hydrateDocumentAssets(sourceRecord.document, this.workspace.assets);
    document.documentId = createId("resume");
    document.resumeName = `${document.resumeName || sourceRecord.title || "岗位版本"} - 继续编辑`;
    document.metadata.createdAt = now();
    document.metadata.updatedAt = now();
    const application = createApplicationRecord({
      ...source,
      id: applicationIdNext,
      documentId: document.documentId,
      status: "draft",
      parentApplicationId: source.id,
      masterBaseline: source.masterBaseline || this.getMasterDocument(),
      exportRecords: [],
      submittedAt: null,
      createdAt: now(),
      updatedAt: now(),
    });
    this.workspace.documents[document.documentId] = documentRecord(dehydrateDocumentAssets(document, this.workspace.assets), "application", {
      applicationId: application.id,
      title: document.resumeName,
    });
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
    const exportRecord = { id: createId("export"), type, createdAt: now(), ...clone(details) };
    application.exportRecords.unshift(exportRecord);
    if (type === "pdf") {
      application.status = "applied";
      application.submittedAt = exportRecord.createdAt;
      const documentRecordValue = this.workspace.documents[application.documentId];
      if (documentRecordValue) documentRecordValue.status = "frozen";
    }
    this.persist();
    return exportRecord;
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
