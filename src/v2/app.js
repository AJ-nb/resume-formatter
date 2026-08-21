import { createIcons, icons } from "lucide";
import {
  AI_PROVIDERS,
  REWRITE_MODES,
  compareWithJD,
  createSelectionReference,
  draftBulletFromEvidence,
  listAvailableModels,
  loadAIConfig,
  normalizeAIConfig,
  reviewResume,
  rewriteSelection,
  saveAIConfig,
  selectionIsCurrent,
  testConnection,
} from "./ai.js";
import { CHECK_SEVERITIES, evaluateExportReadiness, runResumeChecks } from "./checks.js";
import {
  SECTION_DEFINITIONS,
  TEMPLATE_CATEGORIES,
  TEMPLATES,
  clone,
  createEmptyEntry,
  createEmptySection,
  createId,
  getTemplate,
  migrateDocument,
  resolveLayout,
  validateDocument,
} from "./contracts.js";
import { importResumeFile } from "./file-import.js";
import { serializeMarkdown } from "./markdown.js";
import {
  diffWords,
  getByPath,
  locateOverflow,
  renderDocument,
  renderMobileEditor,
  setByPath,
} from "./renderer.js";
import { ResumeStore } from "./store.js";
import { createWorkspaceFromLegacy, extractJDRequirements, matchRequirements, recommendTemplates } from "./workspace.js";

const store = new ResumeStore();
let aiConfig = loadAIConfig();
let activeSelection = null;
let overflowState = { overflow: false, overflowPx: 0, firstPath: "" };
let renderFrame = 0;
let templateQuery = "";
let templateCategory = "all";
let currentChecks = [];

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

function refreshIcons() {
  createIcons({ icons, attrs: { "aria-hidden": "true" } });
}

function node(tag, className, text) {
  const item = document.createElement(tag);
  if (className) item.className = className;
  if (text != null) item.textContent = text;
  return item;
}

function toast(message, level = "info") {
  const item = node("div", `toast ${level}`, message);
  $("#toast-root").append(item);
  setTimeout(() => item.remove(), 3600);
}

function setActive(buttons, target, attribute) {
  for (const button of buttons) {
    const active = button.dataset[attribute] === target;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  }
}

function openModal(title, { wide = false, dismissible = true } = {}) {
  const root = $("#modal-root");
  root.replaceChildren();
  root.classList.add("open");
  const backdrop = node("div", "modal-backdrop");
  const modal = node("section", `modal${wide ? " wide" : ""}`);
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  const header = node("header", "modal-header");
  header.append(node("h2", "", title));
  const closeButton = node("button", "modal-close");
  closeButton.type = "button";
  closeButton.dataset.icon = "x";
  closeButton.setAttribute("aria-label", "关闭");
  closeButton.append(node("i"));
  closeButton.firstChild.dataset.lucide = "x";
  const body = node("div", "modal-body");
  const footer = node("footer", "modal-footer");
  if (dismissible) {
    header.append(closeButton);
    closeButton.addEventListener("click", closeModal);
    backdrop.addEventListener("click", closeModal);
  }
  modal.append(header, body, footer);
  root.append(backdrop, modal);
  refreshIcons();
  return { root, modal, body, footer, close: closeModal };
}

function closeModal() {
  const root = $("#modal-root");
  root.classList.remove("open");
  root.replaceChildren();
}

function modalButton(label, kind = "", handler) {
  const button = node("button", `modal-button${kind ? ` ${kind}` : ""}`, label);
  button.type = "button";
  if (handler) button.addEventListener("click", handler);
  return button;
}

function formField(label, control, full = false) {
  const wrapper = node("label", `form-field${full ? " full" : ""}`);
  wrapper.append(node("span", "", label), control);
  return wrapper;
}

function renderTemplateCards(doc, grid, count) {
  const query = templateQuery.trim().toLocaleLowerCase("zh-CN");
  const matches = TEMPLATES.filter((template) => {
    const categoryMatch = templateCategory === "all" || template.category === templateCategory;
    const haystack = [template.name, template.description, ...template.keywords].join(" ").toLocaleLowerCase("zh-CN");
    return categoryMatch && (!query || haystack.includes(query));
  });
  count.textContent = `${matches.length} / ${TEMPLATES.length} 套`;
  grid.replaceChildren();
  for (const template of matches) {
    const button = node("button", `template-item${doc.layout.templateId === template.id ? " active" : ""}`);
    button.type = "button";
    button.dataset.templateId = template.id;
    button.setAttribute("aria-pressed", String(doc.layout.templateId === template.id));
    const swatch = node("div", "template-swatch");
    swatch.dataset.preview = template.preview;
    swatch.style.setProperty("--swatch", template.tokens.accent);
    const previewBody = node("span", "template-preview-body");
    previewBody.append(node("span", "template-preview-line"), node("span", "template-preview-line"), node("span", "template-preview-line"));
    swatch.append(node("span", "template-preview-name"), node("span", "template-preview-meta"), previewBody);
    const title = node("div", "template-title-row");
    title.append(node("strong", "", template.name), node("span", `template-structure${template.machineReadability === "caution" ? " caution" : ""}`, template.structure === "two-column" ? "双栏" : "单栏"));
    button.append(swatch, title, node("small", "", template.description));
    grid.append(button);
  }
  if (!matches.length) grid.append(node("p", "template-empty", "没有匹配模板"));
}

function renderTemplatePanel(doc) {
  const root = $("#template-list");
  root.replaceChildren();
  const tools = node("div", "template-tools");
  const search = node("label", "template-search");
  const searchIcon = node("i"); searchIcon.dataset.lucide = "search";
  const searchInput = node("input");
  searchInput.id = "template-search";
  searchInput.type = "search";
  searchInput.placeholder = "搜索模板";
  searchInput.setAttribute("aria-label", "搜索模板");
  searchInput.value = templateQuery;
  search.append(searchIcon, searchInput);
  const category = node("select", "template-category");
  category.id = "template-category";
  category.setAttribute("aria-label", "模板方向");
  for (const item of TEMPLATE_CATEGORIES) {
    const option = node("option", "", item.label); option.value = item.id; category.append(option);
  }
  category.value = templateCategory;
  const count = node("span", "template-count");
  tools.append(search, category, count);
  const grid = node("div", "template-grid");
  const update = () => {
    templateQuery = searchInput.value;
    templateCategory = category.value;
    renderTemplateCards(doc, grid, count);
  };
  searchInput.addEventListener("input", update);
  category.addEventListener("change", update);
  root.append(tools, grid);
  renderTemplateCards(doc, grid, count);
}

function renderWorkspaceDocumentList() {
  const target = $("#workspace-document-list");
  const workspace = store.workspace.workspace;
  target.replaceChildren();
  const master = workspace.documents[workspace.masterDocumentId];
  const appendRecord = (record, label, meta, status = "") => {
    const button = node("button", `workspace-document${record.id === workspace.activeDocumentId ? " active" : ""}`);
    button.type = "button";
    button.dataset.documentId = record.id;
    const rail = node("span", `workspace-rail ${record.kind}`);
    const copy = node("span", "workspace-document-copy");
    copy.append(node("strong", "", label), node("small", "", meta));
    button.append(rail, copy);
    if (status) button.append(node("span", `document-status ${status}`, status === "applied" ? "已投递" : "草稿"));
    target.append(button);
  };
  appendRecord(master, master.title || "简历母版", "所有岗位版本的来源");
  for (const application of workspace.applications) {
    const record = workspace.documents[application.documentId];
    if (record) appendRecord(record, [application.company, application.role].filter(Boolean).join(" · ") || record.title, new Date(application.updatedAt).toLocaleDateString("zh-CN"), application.status);
  }
}

function renderRecommendedTemplates(doc) {
  const target = $("#recommended-templates");
  const application = store.workspace.getActiveApplication();
  target.replaceChildren();
  for (const recommendation of recommendTemplates(doc, application || {})) {
    const template = getTemplate(recommendation.templateId);
    const button = node("button", `recommended-template${doc.layout.templateId === template.id ? " active" : ""}`);
    button.type = "button";
    button.dataset.recommendedTemplateId = template.id;
    const swatch = node("span", "recommended-swatch");
    swatch.style.background = template.tokens.accent;
    const copy = node("span", "recommended-copy");
    copy.append(node("strong", "", template.name), node("small", "", recommendation.reasons.join(" · ")));
    button.append(swatch, copy);
    target.append(button);
  }
}

const MATCH_STATUS_LABELS = Object.freeze({
  evidence: "已有证据",
  expression_gap: "表达缺口",
  evidence_gap: "证据缺口",
  capability_gap: "真实能力缺口",
  unknown: "无法判断",
});

function renderJobPanel() {
  const application = store.workspace.getActiveApplication();
  $("#job-empty").hidden = Boolean(application);
  $("#job-workspace").hidden = !application;
  if (!application) return;
  $("#job-company").value = application.company;
  $("#job-role").value = application.role;
  $("#job-language").value = application.language;
  $("#job-source-note").value = application.sourceNote;
  $("#job-jd").value = application.jdText;
  $("#job-jd-count").textContent = `${application.jdText.length.toLocaleString("zh-CN")} 字`;
  $("#job-status").textContent = application.status === "applied" ? "已投递" : application.status === "ready" ? "可投递" : "草稿";

  const evidenceList = $("#evidence-list");
  evidenceList.replaceChildren();
  if (!application.evidence.length) evidenceList.append(node("p", "panel-empty", "尚未添加事实证据"));
  for (const evidence of application.evidence) {
    const item = node("article", "evidence-item");
    const title = node("div", "evidence-title");
    title.append(node("strong", "", evidence.action || "未填写行动"), node("span", `evidence-state ${evidence.verification}`, evidence.verification === "verified" ? "已核实" : evidence.verification === "not-applicable" ? "无需核实" : "待核实"));
    const detail = [evidence.result, evidence.scope].filter(Boolean).join(" · ");
    const action = node("button", "evidence-draft-button", "生成 Bullet");
    action.type = "button";
    action.dataset.evidenceId = evidence.id;
    item.append(title, node("p", "", detail || "等待补充结果"), action);
    evidenceList.append(item);
  }

  const requirementList = $("#requirement-list");
  requirementList.replaceChildren();
  if (!application.requirementMatches.length) requirementList.append(node("p", "panel-empty", "粘贴 JD 后运行本地分析"));
  for (const requirement of application.requirementMatches) {
    const item = node("article", `requirement-item ${requirement.status}`);
    const meta = node("div", "requirement-meta");
    meta.append(node("span", "", requirement.category), node("span", "", requirement.importance === "required" ? "必要" : "优先"));
    const select = node("select", "requirement-status");
    select.dataset.requirementId = requirement.id;
    for (const [value, label] of Object.entries(MATCH_STATUS_LABELS)) {
      const option = node("option", "", label); option.value = value; select.append(option);
    }
    select.value = requirement.status;
    item.append(meta, node("strong", "", requirement.excerpt), node("p", "", requirement.explanation), select);
    requirementList.append(item);
  }
}

function renderSidebar(doc) {
  renderWorkspaceDocumentList();
  const nav = $("#section-nav");
  nav.replaceChildren();
  const summary = node("button", "section-nav-item", "个人摘要");
  summary.type = "button";
  summary.dataset.scrollPath = "summary";
  const icon = node("i"); icon.dataset.lucide = "align-left"; summary.prepend(icon);
  nav.append(summary);
  for (const section of doc.sections) {
    const button = node("button", "section-nav-item", section.title);
    button.type = "button";
    button.dataset.sectionId = section.id;
    const sectionIcon = node("i");
    sectionIcon.dataset.lucide = section.type === "experience" ? "briefcase-business" : section.type === "education" ? "graduation-cap" : section.type === "projects" ? "folder-kanban" : "list";
    button.prepend(sectionIcon);
    nav.append(button);
  }

  renderTemplatePanel(doc);

  const versionList = $("#version-list");
  versionList.replaceChildren();
  const versions = store.listVersions();
  if (!versions.length) versionList.append(node("p", "panel-empty", "暂无保存版本"));
  for (const version of versions) {
    const button = node("button", "version-item");
    button.type = "button";
    button.dataset.versionId = version.id;
    button.append(node("strong", "", version.name), node("span", "", new Date(version.createdAt).toLocaleString("zh-CN")));
    versionList.append(button);
  }
}

function renderChecks(doc) {
  const target = $("#readability-checks");
  target.replaceChildren();
  currentChecks = runResumeChecks(doc, {
    overflow: { ...overflowState, overflowMm: overflowState.overflowPx * 25.4 / 96 },
    application: store.workspace.getActiveApplication(),
  });
  const blockerCount = currentChecks.filter((item) => item.severity === "blocker").length;
  const warningCount = currentChecks.filter((item) => item.severity === "warning").length;
  const summary = $("#check-summary");
  summary.textContent = blockerCount ? `${blockerCount} 项阻断` : warningCount ? `${warningCount} 项警告` : "可以投递";
  summary.className = `connection-badge ${blockerCount ? "blocked" : warningCount ? "warning" : "connected"}`;
  for (const check of currentChecks) {
    const severity = CHECK_SEVERITIES[check.severity];
    const item = node("div", `check-item ${check.severity}`);
    const title = node("div", "check-title");
    const icon = node("i"); icon.dataset.lucide = severity.icon;
    title.append(icon, node("span", "", check.title), node("small", "", severity.label));
    item.append(title, node("p", "", check.detail));
    if (check.fieldPath) item.dataset.path = check.fieldPath;
    target.append(item);
  }
}

function syncControls(doc) {
  const layout = resolveLayout(doc);
  const values = {
    "font-size": [layout.tokens.fontSize, `${layout.tokens.fontSize.toFixed(1)} pt`],
    "line-height": [layout.tokens.lineHeight, layout.tokens.lineHeight.toFixed(2)],
    "section-gap": [layout.tokens.sectionGap, `${layout.tokens.sectionGap.toFixed(1)} mm`],
  };
  for (const [id, [value, label]] of Object.entries(values)) {
    $(`#${id}`).value = value;
    $(`#${id}-value`).value = label;
    $(`#${id}-value`).textContent = label;
  }
  $("#photo-toggle").checked = layout.showPhoto;
  $("#photo-toggle").disabled = !layout.template.supportsPhoto;
  for (const button of $$('[data-paper]')) button.classList.toggle("active", button.dataset.paper === layout.paper);
  $("#save-status").textContent = store.dirty ? "有未保存更改" : "已保存在本机";
  $("#btn-undo").disabled = store.undoStack.length === 0;
  $("#btn-redo").disabled = store.redoStack.length === 0;
  const connected = aiConfig.testStatus === "passed";
  const badge = $("#ai-status-badge");
  badge.textContent = connected ? `${AI_PROVIDERS[aiConfig.provider].name} 已连接` : "未配置";
  badge.classList.toggle("connected", connected);
}

function scheduleDiagnostics() {
  cancelAnimationFrame(renderFrame);
  renderFrame = requestAnimationFrame(() => {
    overflowState = locateOverflow($("#resume-paper"));
    const status = $("#overflow-status");
    status.dataset.status = overflowState.overflow ? "overflow" : "ok";
    status.querySelector("span").textContent = overflowState.overflow
      ? `超出约 ${(overflowState.overflowPx * 25.4 / 96).toFixed(1)} mm`
      : "单页内";
    const statusIcon = status.querySelector("svg");
    if (statusIcon) statusIcon.outerHTML = `<i data-lucide="${overflowState.overflow ? "triangle-alert" : "circle-check"}"></i>`;
    $("#btn-auto-fit").hidden = !overflowState.overflow;
    renderChecks(store.document);
    refreshIcons();
  });
}

function renderAll(doc = store.document) {
  renderDocument(doc, $("#resume-paper"));
  renderMobileEditor(doc, $("#mobile-editor"));
  renderSidebar(doc);
  renderRecommendedTemplates(doc);
  renderJobPanel();
  renderChecks(doc);
  syncControls(doc);
  refreshIcons();
  scheduleDiagnostics();
}

function updatePath(path, value, reason = "编辑文字") {
  if (String(getByPath(store.document, path) ?? "") === value) return;
  store.transact(reason, (doc) => setByPath(doc, path, value));
}

function editableText(element) {
  return element.textContent.replace(/\u00a0/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

function handlePaperInput(event) {
  const target = event.target.closest("[data-edit-path]");
  if (!target) return;
  target.dataset.empty = target.textContent.trim() ? "false" : "true";
}

function handlePaperBlur(event) {
  const target = event.target.closest("[data-edit-path]");
  if (!target) return;
  updatePath(target.dataset.editPath, editableText(target));
}

function findSection(sectionId) { return store.document.sections.find((item) => item.id === sectionId); }
function findEntry(section, entryId) { return section?.entries.find((item) => item.id === entryId); }

function handlePaperAction(event) {
  const action = event.target.closest("[data-action]");
  if (!action) return;
  const { sectionId, entryId, bulletId } = action.dataset;
  if (action.dataset.action === "photo-upload") return openPhotoDialog();
  if (action.dataset.action === "add-entry") {
    store.transact("添加条目", (doc) => doc.sections.find((item) => item.id === sectionId)?.entries.push(createEmptyEntry()));
  }
  if (action.dataset.action === "delete-section") {
    store.transact("删除栏目", (doc) => { doc.sections = doc.sections.filter((item) => item.id !== sectionId); });
  }
  if (action.dataset.action === "delete-entry") {
    store.transact("删除条目", (doc) => {
      const section = doc.sections.find((item) => item.id === sectionId);
      section.entries = section.entries.filter((item) => item.id !== entryId);
    });
  }
  if (action.dataset.action === "add-bullet") {
    store.transact("添加项目符号", (doc) => {
      const entry = findEntry(doc.sections.find((item) => item.id === sectionId), entryId);
      entry.bullets.push({ id: createId("bullet"), text: "新的成果描述" });
    });
  }
  if (action.dataset.action === "delete-bullet") {
    store.transact("删除项目符号", (doc) => {
      const entry = findEntry(doc.sections.find((item) => item.id === sectionId), entryId);
      entry.bullets = entry.bullets.filter((item) => item.id !== bulletId);
    });
  }
}

function selectionOffsets(target, range) {
  const before = range.cloneRange();
  before.selectNodeContents(target);
  before.setEnd(range.startContainer, range.startOffset);
  const start = before.toString().length;
  return { start, end: start + range.toString().length };
}

async function captureSelection() {
  const selection = window.getSelection();
  const toolbar = $("#selection-toolbar");
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    toolbar.hidden = true;
    return;
  }
  const range = selection.getRangeAt(0);
  const container = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement;
  const target = container?.closest?.("[data-edit-path]");
  if (!target || !$("#resume-paper").contains(target)) {
    toolbar.hidden = true;
    return;
  }
  const offsets = selectionOffsets(target, range);
  if (offsets.end <= offsets.start) return;
  const section = target.closest(".resume-section");
  activeSelection = await createSelectionReference({
    fieldPath: target.dataset.editPath,
    text: target.textContent,
    start: offsets.start,
    end: offsets.end,
    sectionTitle: section?.querySelector(".section-heading")?.textContent || "",
    bulletId: target.closest(".bullet-row")?.dataset.bulletId || "",
  });
  const rect = range.getBoundingClientRect();
  toolbar.hidden = false;
  toolbar.style.left = `${Math.min(window.innerWidth - toolbar.offsetWidth - 8, Math.max(8, rect.left + rect.width / 2 - toolbar.offsetWidth / 2))}px`;
  toolbar.style.top = `${Math.max(8, rect.top - toolbar.offsetHeight - 8)}px`;
}

function loadingModal(title) {
  const modal = openModal(title, { dismissible: false });
  const row = node("div", "loading-row");
  row.append(node("div", "spinner"), node("span", "", "正在等待提供商返回..."));
  modal.body.append(row);
  return modal;
}

async function handleRewrite(mode) {
  if (!activeSelection) return toast("请先在简历中选择文字。", "error");
  let current;
  try {
    current = getByPath(store.document, activeSelection.fieldPath);
    if (!await selectionIsCurrent(activeSelection, current)) throw new Error("文字已发生变化，请重新选择后再改写。");
  } catch (error) { return toast(error.message, "error"); }
  const wait = loadingModal(`${REWRITE_MODES[mode]}建议`);
  try {
    const result = await rewriteSelection(aiConfig, { reference: activeSelection, mode });
    wait.close();
    showRewriteResult(result);
  } catch (error) {
    wait.close();
    toast(error.message, "error");
  }
}

function showRewriteResult(result) {
  const modal = openModal("改写建议", { wide: true });
  const preview = node("div", "diff-preview");
  for (const part of diffWords(result.reference.originalText, result.suggestion)) {
    preview.append(node(part.type === "remove" ? "del" : part.type === "add" ? "ins" : "span", "", part.text));
  }
  modal.body.append(preview);
  if (result.reason) modal.body.append(node("p", "modal-explanation", result.reason));
  let confirmation = null;
  if (result.requiresConfirmation) {
    const warning = node("div", "fact-warning", result.factWarnings.message);
    confirmation = node("label", "fact-confirm");
    const checkbox = node("input"); checkbox.type = "checkbox";
    confirmation.append(checkbox, node("span", "", "我已核对并确认这些事实变化"));
    warning.append(confirmation);
    modal.body.append(warning);
  }
  modal.footer.append(modalButton("丢弃", "", modal.close));
  const apply = modalButton("应用建议", "primary", async () => {
    if (result.requiresConfirmation && !confirmation.querySelector("input").checked) return;
    const current = getByPath(store.document, result.reference.fieldPath);
    if (!await selectionIsCurrent(result.reference, current)) {
      modal.close();
      return toast("原文已变化，已拒绝覆盖。", "error");
    }
    const next = current.slice(0, result.reference.start) + result.suggestion + current.slice(result.reference.end);
    store.transact("应用 AI 改写", (doc) => setByPath(doc, result.reference.fieldPath, next));
    modal.close();
    activeSelection = null;
    $("#selection-toolbar").hidden = true;
    toast("建议已应用，可通过撤销恢复。", "success");
  });
  if (result.requiresConfirmation) {
    apply.disabled = true;
    confirmation.querySelector("input").addEventListener("change", (event) => { apply.disabled = !event.target.checked; });
  }
  modal.footer.append(apply);
}

function openAISettings() {
  const modal = openModal("AI 提供商设置");
  const grid = node("div", "form-grid");
  const provider = node("select");
  for (const [id, item] of Object.entries(AI_PROVIDERS)) {
    const option = node("option", "", item.name); option.value = id; provider.append(option);
  }
  const baseUrl = node("input"); baseUrl.type = "url";
  const model = node("input"); model.placeholder = "输入模型 ID"; model.autocomplete = "off";
  const modelList = node("datalist"); modelList.id = "ai-model-options"; model.setAttribute("list", modelList.id);
  const modelStatus = node("p", "field-help"); modelStatus.hidden = true;
  const apiKey = node("input"); apiKey.type = "password"; apiKey.autocomplete = "off"; apiKey.dataset.sensitive = "true";
  const remember = node("input"); remember.type = "checkbox";
  const rememberLabel = node("label", "remember-control"); rememberLabel.append(remember, node("span", "", "记住到本机"));
  const modelsButton = modalButton("读取可用模型", "", async () => {
    const candidate = normalizeAIConfig({ provider: provider.value, baseUrl: baseUrl.value, model: model.value, apiKey: apiKey.value, remember: remember.checked });
    modelsButton.disabled = true;
    modelsButton.textContent = "读取中...";
    modelStatus.hidden = true;
    try {
      const result = await listAvailableModels(candidate);
      modelList.replaceChildren(...result.models.map((id) => {
        const option = node("option"); option.value = id; return option;
      }));
      if (!model.value.trim() && result.models.length === 1) model.value = result.models[0];
      modelStatus.textContent = `已读取 ${result.models.length} 个当前令牌可用模型，请在模型框中选择或输入。`;
      modelStatus.hidden = false;
      model.focus();
    } catch (error) {
      toast(error.message, "error");
    } finally {
      modelsButton.disabled = false;
      modelsButton.textContent = "读取可用模型";
    }
  });
  const fill = (config) => {
    provider.value = config.provider;
    baseUrl.value = config.baseUrl;
    model.value = config.model;
    apiKey.value = config.apiKey;
    remember.checked = config.remember;
    modelList.replaceChildren();
    modelStatus.hidden = true;
    modelsButton.hidden = !AI_PROVIDERS[config.provider].supportsModelDiscovery;
  };
  fill(aiConfig);
  provider.addEventListener("change", () => fill(normalizeAIConfig({ provider: provider.value, remember: remember.checked })));
  grid.append(
    formField("提供商", provider),
    formField("模型", model),
    formField("Base URL", baseUrl, true),
    formField("API Key", apiKey, true),
    formField("凭据保存", rememberLabel, true),
  );
  modal.body.append(grid, modelList, modelStatus, node("div", "risk-notice", "浏览器直连意味着密钥会存在于当前页面运行环境。默认仅写入 sessionStorage，关闭标签页后失效；选择“记住到本机”会以明文写入 localStorage。密钥不会进入简历、HTML、Markdown 或 JSON 导出。"));
  modal.footer.append(modelsButton);
  modal.footer.append(modalButton("取消", "", modal.close));
  const testButton = modalButton("测试连接并保存", "primary", async () => {
    const candidate = normalizeAIConfig({ provider: provider.value, baseUrl: baseUrl.value, model: model.value, apiKey: apiKey.value, remember: remember.checked });
    testButton.disabled = true;
    testButton.textContent = "测试中...";
    try {
      aiConfig = saveAIConfig(await testConnection(candidate));
      modal.close();
      syncControls(store.document);
      toast("连接测试通过，配置已保存。", "success");
    } catch (error) {
      testButton.disabled = false;
      testButton.textContent = "测试连接并保存";
      toast(error.message, "error");
    }
  });
  modal.footer.append(testButton);
}

async function handleFullReview() {
  const wait = loadingModal("全文审阅");
  try {
    const result = await reviewResume(aiConfig, store.document);
    wait.close();
    showInspectorTab("checks");
    const target = $("#ai-results");
    target.replaceChildren();
    if (!result.issues.length) target.append(node("p", "panel-empty", "没有返回具体问题。"));
    for (const issue of result.issues) {
      const item = node("div", "ai-result-item");
      const meta = node("div", "ai-result-meta");
      meta.append(node("span", "", issue.severity), node("span", "", issue.fieldPath || "未定位"));
      item.append(meta, node("strong", "", issue.title), node("p", "", `${issue.detail} ${issue.suggestion}`.trim()));
      target.append(item);
    }
    document.body.classList.add("inspector-open");
  } catch (error) { wait.close(); toast(error.message, "error"); }
}

async function openJDCompare() {
  const application = store.workspace.getActiveApplication();
  if (!application?.jdText.trim()) return toast("请先在岗位面板填写 JD。", "error");
  const wait = loadingModal("AI 补充对照");
  try {
    const result = await compareWithJD(aiConfig, store.document, application.jdText);
    wait.close();
    renderJDResults(result);
  } catch (error) { wait.close(); toast(error.message, "error"); }
}

function renderJDResults(result) {
  const modal = openModal("AI 岗位对照", { wide: true });
  const target = node("div", "ai-results modal-results");
  const keywordItem = node("div", "ai-result-item");
  keywordItem.append(node("strong", "", "确定性关键词结果"));
  const matched = result.keywords.filter((item) => item.matched).map((item) => item.keyword).join("、") || "无";
  const missing = result.keywords.filter((item) => !item.matched).map((item) => item.keyword).join("、") || "无";
  keywordItem.append(node("p", "", `命中：${matched}\n未命中：${missing}`));
  target.append(keywordItem);
  for (const suggestion of result.suggestions) {
    const item = node("div", "ai-result-item");
    item.append(node("strong", "", suggestion.requirement), node("p", "", `已有证据：${suggestion.evidence || "无"}\n建议：${suggestion.recommendation}`));
    target.append(item);
  }
  modal.body.append(node("div", "risk-notice", "以下 AI 建议与本地要求匹配分开显示，不会自动写入简历或能力状态。"), target);
  modal.footer.append(modalButton("关闭", "primary", modal.close));
}

function openCreateApplication() {
  const modal = openModal("创建岗位版本");
  const grid = node("div", "form-grid");
  const company = node("input"); company.placeholder = "示例科技";
  const role = node("input"); role.placeholder = "高级产品经理";
  const language = node("select");
  for (const [value, label] of [["zh-CN", "中文"], ["en", "English"]]) {
    const option = node("option", "", label); option.value = value; language.append(option);
  }
  grid.append(formField("公司", company), formField("岗位", role), formField("简历语言", language, true));
  modal.body.append(grid, node("p", "field-help", "新版本复制当前母版并保存创建基线，之后独立编辑，不会被母版自动覆盖。"));
  modal.footer.append(modalButton("取消", "", modal.close), modalButton("创建", "primary", () => {
    if (!company.value.trim() && !role.value.trim()) return toast("请至少填写公司或岗位。", "error");
    store.createApplication({ company: company.value.trim(), role: role.value.trim(), language: language.value });
    modal.close();
    showInspectorTab("job");
    setInspectorOpen(true);
    toast("岗位版本已创建。", "success");
  }));
}

function updateActiveApplication(changes) {
  const application = store.workspace.getActiveApplication();
  if (!application) return;
  store.workspace.updateApplication(application.id, changes);
  renderSidebar(store.document);
}

function analyzeActiveJD() {
  const application = store.workspace.getActiveApplication();
  if (!application) return;
  if ($("#job-jd").value !== application.jdText) store.workspace.updateApplication(application.id, { jdText: $("#job-jd").value });
  const current = store.workspace.getActiveApplication();
  if (!current.jdText.trim()) return toast("请先粘贴岗位描述。", "error");
  const requirements = extractJDRequirements(current.jdText);
  const matches = matchRequirements(store.document, current.evidence, requirements);
  store.workspace.updateApplication(current.id, { requirementMatches: matches });
  renderJobPanel();
  renderRecommendedTemplates(store.document);
  refreshIcons();
  toast(`已本地提取 ${matches.length} 条要求。`, "success");
}

function bulletTargets() {
  const targets = [{ path: "summary", label: "个人摘要" }];
  for (const section of store.document.sections || []) {
    for (const entry of section.entries || []) {
      for (const bullet of entry.bullets || []) {
        targets.push({
          path: `sections.${section.id}.entries.${entry.id}.bullets.${bullet.id}.text`,
          label: `${section.title} · ${entry.name || entry.role || "条目"} · ${bullet.text.slice(0, 24) || "空 Bullet"}`,
        });
      }
    }
  }
  return targets;
}

function openEvidenceDialog() {
  const application = store.workspace.getActiveApplication();
  if (!application) return openCreateApplication();
  const modal = openModal("添加事实证据", { wide: true });
  const grid = node("div", "form-grid");
  const fields = {};
  for (const [key, label, placeholder] of [
    ["context", "背景", "业务、团队或问题背景"],
    ["task", "任务", "你需要完成什么"],
    ["action", "个人行动", "明确写你亲自采取的行动"],
    ["scope", "范围", "团队、用户、地区或项目规模；未知可留空"],
    ["result", "结果", "实际结果；未知时填写“待补充”"],
    ["source", "证明来源", "数据看板、项目记录或可核实联系人"],
  ]) {
    const control = key === "context" || key === "action" || key === "result" ? node("textarea") : node("input");
    control.placeholder = placeholder;
    fields[key] = control;
    grid.append(formField(label, control, ["context", "action", "result"].includes(key)));
  }
  const verification = node("select");
  for (const [value, label] of [["unverified", "待核实"], ["verified", "已核实"], ["not-applicable", "无需核实"]]) {
    const option = node("option", "", label); option.value = value; verification.append(option);
  }
  const target = node("select");
  for (const item of bulletTargets()) { const option = node("option", "", item.label); option.value = item.path; target.append(option); }
  grid.append(formField("核实状态", verification), formField("关联简历字段", target));
  modal.body.append(grid);
  modal.footer.append(modalButton("取消", "", modal.close), modalButton("保存证据", "primary", () => {
    try {
      store.workspace.addEvidence(application.id, {
        ...Object.fromEntries(Object.entries(fields).map(([key, control]) => [key, control.value.trim()])),
        verification: verification.value,
        fieldPath: target.value,
      });
      modal.close();
      renderAll();
      toast("证据已保存在当前岗位。", "success");
    } catch (error) { toast(error.message, "error"); }
  }));
}

function showEvidenceDraft(result, reference) {
  const modal = openModal("证据生成建议", { wide: true });
  const preview = node("div", "diff-preview");
  for (const part of diffWords(reference.originalText, result.suggestion)) {
    preview.append(node(part.type === "remove" ? "del" : part.type === "add" ? "ins" : "span", "", part.text));
  }
  modal.body.append(preview);
  for (const warning of result.warnings) modal.body.append(node("div", "warning-notice", warning));
  if (result.factWarnings.changed) modal.body.append(node("div", "fact-warning", result.factWarnings.message));
  let confirmation = null;
  if (result.requiresConfirmation) {
    confirmation = node("label", "fact-confirm");
    const input = node("input"); input.type = "checkbox";
    confirmation.append(input, node("span", "", "我已核对证据、数字与待核实项"));
    modal.body.append(confirmation);
  }
  modal.footer.append(modalButton("丢弃", "", modal.close));
  const apply = modalButton("应用建议", "primary", async () => {
    const current = String(getByPath(store.document, reference.fieldPath) ?? "");
    if (!await selectionIsCurrent(reference, current)) { modal.close(); return toast("目标字段已变化，已拒绝覆盖。", "error"); }
    store.transact("应用证据生成建议", (doc) => setByPath(doc, reference.fieldPath, result.suggestion));
    modal.close();
    toast("建议已应用，可通过撤销恢复。", "success");
  });
  if (confirmation) {
    apply.disabled = true;
    confirmation.querySelector("input").addEventListener("change", (event) => { apply.disabled = !event.target.checked; });
  }
  modal.footer.append(apply);
}

async function generateEvidenceDraft(evidenceId) {
  const application = store.workspace.getActiveApplication();
  const evidence = application?.evidence.find((item) => item.id === evidenceId);
  if (!evidence) return;
  const modal = openModal("生成简历 Bullet");
  const target = node("select");
  for (const item of bulletTargets()) { const option = node("option", "", item.label); option.value = item.path; target.append(option); }
  target.value = bulletTargets().some((item) => item.path === evidence.fieldPath) ? evidence.fieldPath : target.value;
  const requirement = node("select");
  const none = node("option", "", "不关联具体要求"); none.value = ""; requirement.append(none);
  for (const item of application.requirementMatches) { const option = node("option", "", item.excerpt.slice(0, 80)); option.value = item.id; requirement.append(option); }
  modal.body.append(formField("目标字段", target, true), formField("明确选择的 JD 要求", requirement, true));
  modal.footer.append(modalButton("取消", "", modal.close), modalButton("生成建议", "primary", async () => {
    const original = String(getByPath(store.document, target.value) ?? "");
    const reference = await createSelectionReference({ fieldPath: target.value, text: original, start: 0, end: original.length });
    const selectedRequirement = application.requirementMatches.find((item) => item.id === requirement.value) || null;
    modal.close();
    const wait = loadingModal("证据生成建议");
    try {
      const result = await draftBulletFromEvidence(aiConfig, { evidence: [evidence], targetFieldPath: target.value, requirement: selectedRequirement });
      wait.close();
      showEvidenceDraft(result, reference);
    } catch (error) { wait.close(); toast(error.message, "error"); }
  }));
}

function showInspectorTab(tab) {
  setActive($$("[data-inspector-tab]"), tab, "inspectorTab");
  for (const panel of $$(".inspector-panel")) panel.classList.toggle("active", panel.id === `inspector-${tab}`);
}

function setInspectorOpen(open) {
  document.body.classList.toggle("inspector-open", open);
  $("#inspector-handle").setAttribute("aria-expanded", String(open));
}

function wireInspectorDrag() {
  const inspector = $("#inspector");
  const handle = $("#inspector-handle");
  let drag = null;
  let suppressClickUntil = 0;

  const finishDrag = (event, cancelled = false) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const shouldOpen = cancelled ? drag.wasOpen : drag.offset < drag.maxOffset / 2;
    if (drag.moved) suppressClickUntil = performance.now() + 400;
    inspector.classList.remove("inspector-dragging");
    inspector.style.removeProperty("transform");
    setInspectorOpen(shouldOpen);
    if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
    drag = null;
  };

  handle.addEventListener("pointerdown", (event) => {
    if (!matchMedia("(max-width: 900px)").matches || (event.pointerType === "mouse" && event.button !== 0)) return;
    const wasOpen = document.body.classList.contains("inspector-open");
    const maxOffset = Math.max(0, inspector.getBoundingClientRect().height - 51);
    drag = {
      pointerId: event.pointerId,
      startY: event.clientY,
      offset: wasOpen ? 0 : maxOffset,
      maxOffset,
      wasOpen,
      moved: false,
    };
    inspector.classList.add("inspector-dragging");
    handle.setPointerCapture(event.pointerId);
  });
  handle.addEventListener("pointermove", (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const delta = event.clientY - drag.startY;
    drag.moved ||= Math.abs(delta) > 4;
    drag.offset = Math.min(drag.maxOffset, Math.max(0, (drag.wasOpen ? 0 : drag.maxOffset) + delta));
    inspector.style.transform = `translateY(${drag.offset}px)`;
  });
  handle.addEventListener("pointerup", (event) => finishDrag(event));
  handle.addEventListener("pointercancel", (event) => finishDrag(event, true));
  handle.addEventListener("click", () => {
    if (performance.now() < suppressClickUntil) return;
    setInspectorOpen(!document.body.classList.contains("inspector-open"));
  });
}

function showSidebarTab(tab) {
  setActive($$("[data-sidebar-tab]"), tab, "sidebarTab");
  $("#sidebar-document").classList.toggle("active", tab === "document");
  $("#sidebar-templates").classList.toggle("active", tab === "templates");
}

function openImportReview(result) {
  const modal = openModal("确认导入", { wide: true });
  const summary = node("div", "import-summary");
  const values = [
    [result.document.sections.length, "检测栏目"],
    [result.unmapped.length, "未映射片段"],
    [result.confidence === "high" ? "高" : result.confidence === "medium" ? "中" : "低", "映射置信度"],
  ];
  for (const [value, label] of values) {
    const stat = node("div", "import-stat"); stat.append(node("strong", "", value), node("span", "", label)); summary.append(stat);
  }
  modal.body.append(summary);
  for (const warning of result.warnings) modal.body.append(node("div", "warning-notice", warning.message));
  if (result.unmapped.length) {
    modal.body.append(node("h3", "modal-subheading", "未映射内容"));
    const list = node("div", "unmapped-list");
    for (const item of result.unmapped.slice(0, 100)) {
      const row = node("div", "unmapped-item");
      row.append(node("strong", "", item.reason), node("p", "", item.text)); list.append(row);
    }
    modal.body.append(list);
  }
  modal.footer.append(modalButton("取消", "", modal.close), modalButton("确认导入", "primary", () => {
    store.replace(result.document, "导入简历");
    modal.close();
    toast("导入完成，请核对栏目与未映射内容。", "success");
  }));
}

async function handleResumeFile(file) {
  if (!file) return;
  const wait = loadingModal("本地解析文件");
  try {
    const result = await importResumeFile(file);
    wait.close();
    openImportReview(result);
  } catch (error) { wait.close(); toast(error.message, "error"); }
}

function openAddSection() {
  const modal = openModal("添加栏目");
  const select = node("select");
  for (const definition of SECTION_DEFINITIONS.filter((item) => item.type !== "summary")) {
    const option = node("option", "", definition.title); option.value = definition.type; select.append(option);
  }
  const custom = node("input"); custom.placeholder = "自定义栏目名称"; custom.hidden = true;
  select.addEventListener("change", () => { custom.hidden = select.value !== "custom"; });
  modal.body.append(formField("栏目类型", select, true), formField("栏目名称", custom, true));
  modal.footer.append(modalButton("取消", "", modal.close), modalButton("添加", "primary", () => {
    const definition = SECTION_DEFINITIONS.find((item) => item.type === select.value);
    const section = createEmptySection(select.value, select.value === "custom" ? custom.value.trim() || "自定义栏目" : definition.title);
    section.entries.push(createEmptyEntry());
    store.transact("添加栏目", (doc) => doc.sections.push(section));
    modal.close();
  }));
}

function download(content, fileName, type) {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = node("a"); anchor.href = url; anchor.download = fileName; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function safeFileName(extension) {
  const base = (store.document.resumeName || store.document.profile.name || "resume").replace(/[\\/:*?"<>|]/g, "-").trim() || "resume";
  return `${base}.${extension}`;
}

function exportJson() {
  download(`${JSON.stringify(store.document, null, 2)}\n`, safeFileName("json"), "application/json;charset=utf-8");
}

function exportWorkspace() {
  store.workspace.setActiveDocument(store.document);
  const backup = store.workspace.backup();
  const modal = openModal("导出工作区备份");
  modal.body.append(
    node("div", "risk-notice", "工作区 JSON 包含完整 JD、证据、岗位版本和照片资产，可能含敏感信息。文件不会包含 API Key，但请只保存在可信位置。"),
    node("p", "field-help", `将导出 ${backup.workspace.applications.length} 个岗位任务和 ${Object.keys(backup.workspace.documents).length} 份简历文档。`),
  );
  modal.footer.append(modalButton("取消", "", modal.close), modalButton("导出备份", "primary", () => {
    const date = new Date().toISOString().slice(0, 10);
    download(`${JSON.stringify(backup, null, 2)}\n`, `resume-workspace-${date}.json`, "application/json;charset=utf-8");
    modal.close();
  }));
}

async function importWorkspaceFile(file) {
  if (!file) return;
  if (file.size > 25 * 1024 * 1024) return toast("工作区文件超过 25 MB。", "error");
  try {
    const backup = JSON.parse(await file.text());
    const source = backup.backupType === "resume-formatter-workspace" ? backup.workspace : backup;
    const applicationCount = Array.isArray(source?.applications) ? source.applications.length : 0;
    const modal = openModal("恢复工作区");
    modal.body.append(node("div", "warning-notice", `将用备份中的工作区替换当前工作区视图。旧的 v2 简历存储键不会删除。检测到 ${applicationCount} 个岗位任务。`));
    modal.footer.append(modalButton("取消", "", modal.close), modalButton("确认恢复", "primary", () => {
      try {
        store.replaceWorkspace(backup);
        modal.close();
        renderAll();
        toast("工作区已恢复，API 配置未从备份导入。", "success");
      } catch (error) { toast(error.message, "error"); }
    }));
  } catch (error) { toast(`工作区无法读取：${error.message}`, "error"); }
}

function exportMarkdown() {
  download(serializeMarkdown(store.document), safeFileName("md"), "text/markdown;charset=utf-8");
}

function exportHtml() {
  closeModal();
  const cloneDoc = document.documentElement.cloneNode(true);
  cloneDoc.querySelector("#modal-root")?.replaceChildren();
  cloneDoc.querySelector("#toast-root")?.replaceChildren();
  cloneDoc.querySelector("#selection-toolbar")?.setAttribute("hidden", "");
  cloneDoc.querySelector("#workspace-document-list")?.replaceChildren();
  cloneDoc.querySelector("#evidence-list")?.replaceChildren();
  cloneDoc.querySelector("#requirement-list")?.replaceChildren();
  cloneDoc.querySelector("#job-workspace")?.setAttribute("hidden", "");
  for (const id of ["job-company", "job-role", "job-language", "job-source-note", "job-jd"]) {
    const item = cloneDoc.querySelector(`#${id}`);
    if (item) { item.value = ""; item.textContent = ""; item.removeAttribute("value"); }
  }
  cloneDoc.querySelectorAll("[data-sensitive]").forEach((item) => { item.value = ""; item.setAttribute("value", ""); });
  const embedded = cloneDoc.querySelector("#embedded-resume-state");
  embedded.textContent = JSON.stringify(store.document).replace(/<\/script/gi, "<\\/script");
  const html = `<!doctype html>\n${cloneDoc.outerHTML}`;
  download(html, safeFileName("html"), "text/html;charset=utf-8");
}

function openExportGate() {
  renderChecks(store.document);
  const modal = openModal("投递 PDF 检查", { wide: true });
  const list = node("div", "readiness-list");
  const warnings = currentChecks.filter((item) => item.severity === "warning");
  const blockers = currentChecks.filter((item) => item.severity === "blocker");
  for (const item of [...blockers, ...warnings]) {
    const row = node("label", `readiness-item ${item.severity}`);
    const input = node("input");
    input.type = "checkbox";
    input.value = item.code;
    input.disabled = item.severity === "blocker";
    const copy = node("span", "readiness-copy");
    copy.append(node("strong", "", item.title), node("small", "", item.detail));
    row.append(input, copy);
    list.append(row);
  }
  if (!blockers.length && !warnings.length) list.append(node("div", "readiness-clear", "未发现阻断或待确认警告。"));
  modal.body.append(list);
  if (blockers.length) modal.body.prepend(node("div", "warning-notice blocker-notice", "请先修复所有阻断项。HTML、Markdown、简历 JSON 和工作区备份仍可正常导出。"));
  else if (warnings.length) modal.body.prepend(node("p", "field-help", "逐项确认可绕过的警告后继续。"));
  modal.footer.append(modalButton("返回修改", "", modal.close));
  const deliver = modalButton("打开打印对话框", "primary", () => {
    const confirmations = [...list.querySelectorAll('input[type="checkbox"]:checked')].map((input) => input.value);
    const readiness = evaluateExportReadiness(currentChecks, "pdf", confirmations);
    if (!readiness.ready) return;
    store.workspace.setActiveDocument(store.document);
    store.workspace.recordExport("pdf", { templateId: store.document.layout.templateId, paper: store.document.layout.paper, confirmedWarnings: confirmations });
    modal.close();
    window.print();
  });
  const update = () => {
    const confirmations = [...list.querySelectorAll('input[type="checkbox"]:checked')].map((input) => input.value);
    deliver.disabled = !evaluateExportReadiness(currentChecks, "pdf", confirmations).ready;
  };
  list.addEventListener("change", update);
  update();
  modal.footer.append(deliver);
}

async function compressPhoto(file) {
  if (file.size > 10 * 1024 * 1024) throw new Error("照片超过 10 MB。");
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file);
  });
  const image = await new Promise((resolve, reject) => {
    const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = dataUrl;
  });
  const max = 1200;
  const ratio = Math.min(1, max / Math.max(image.width, image.height));
  const canvas = node("canvas"); canvas.width = Math.round(image.width * ratio); canvas.height = Math.round(image.height * ratio);
  canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
  return { dataUrl: canvas.toDataURL("image/jpeg", 0.86), mimeType: "image/jpeg", width: canvas.width, height: canvas.height, scale: 1, offsetX: 0, offsetY: 0 };
}

function openPhotoDialog() {
  const modal = openModal("证件照");
  const preview = node("div", "photo-dialog-preview");
  const image = node("img");
  const working = clone(store.document.assets.photo || { dataUrl: "", scale: 1, offsetX: 0, offsetY: 0 });
  if (working.dataUrl) { image.src = working.dataUrl; preview.append(image); }
  else preview.append(node("span", "", "尚未选择照片"));
  const scale = node("input"); scale.type = "range"; scale.min = "0.7"; scale.max = "2"; scale.step = "0.01"; scale.value = working.scale || 1;
  const x = node("input"); x.type = "range"; x.min = "-35"; x.max = "35"; x.value = working.offsetX || 0;
  const y = node("input"); y.type = "range"; y.min = "-35"; y.max = "35"; y.value = working.offsetY || 0;
  const updatePreview = () => { if (image.src) image.style.transform = `translate(${x.value}%, ${y.value}%) scale(${scale.value})`; };
  for (const input of [scale, x, y]) input.addEventListener("input", updatePreview);
  modal.body.append(preview, formField("缩放", scale, true), formField("水平位置", x, true), formField("垂直位置", y, true));
  const choose = modalButton("选择照片", "", () => $("#photo-file-input").click());
  modal.footer.append(choose);
  if (working.dataUrl) modal.footer.append(modalButton("删除", "danger", () => {
    store.transact("删除照片", (doc) => { doc.assets.photo = null; doc.layout.showPhoto = false; }); modal.close();
  }));
  modal.footer.append(modalButton("取消", "", modal.close), modalButton("应用", "primary", () => {
    if (working.dataUrl) {
      working.scale = Number(scale.value); working.offsetX = Number(x.value); working.offsetY = Number(y.value);
      store.transact("调整照片", (doc) => { doc.assets.photo = working; doc.layout.showPhoto = true; });
    }
    modal.close();
  }));
  $("#photo-file-input").onchange = async (event) => {
    try {
      Object.assign(working, await compressPhoto(event.target.files[0]));
      image.src = working.dataUrl;
      preview.replaceChildren(image);
      updatePreview();
    } catch (error) { toast(error.message, "error"); }
    event.target.value = "";
  };
}

function autoFit() {
  if (!overflowState.overflow) return;
  const layout = resolveLayout(store.document);
  let { fontSize, lineHeight, sectionGap } = layout.tokens;
  const paper = $("#resume-paper");
  for (let step = 0; step < 9; step += 1) {
    if (!locateOverflow(paper).overflow) break;
    if (sectionGap > 1.5) sectionGap = Math.max(1.5, sectionGap - 0.35);
    else if (lineHeight > 1.25) lineHeight = Math.max(1.25, lineHeight - 0.035);
    else fontSize = Math.max(8, fontSize - 0.2);
    paper.style.setProperty("--section-gap", `${sectionGap}mm`);
    paper.style.setProperty("--resume-line-height", lineHeight);
    paper.style.setProperty("--resume-font-size", `${fontSize}pt`);
  }
  store.transact("自动适配页面", (doc) => Object.assign(doc.layout.tokenOverrides, { fontSize, lineHeight, sectionGap }));
  toast(locateOverflow($("#resume-paper")).overflow ? "内容仍超过单页，请精简文字或改用更紧凑模板。" : "已在可读范围内压缩版式。", overflowState.overflow ? "info" : "success");
}

function wireStaticEvents() {
  store.subscribe(renderAll);
  $("#resume-paper").addEventListener("input", handlePaperInput);
  $("#resume-paper").addEventListener("focusout", handlePaperBlur);
  $("#resume-paper").addEventListener("click", handlePaperAction);
  $("#resume-paper").addEventListener("mouseup", () => setTimeout(captureSelection, 0));
  $("#mobile-editor").addEventListener("change", (event) => {
    const target = event.target.closest("[data-edit-path]"); if (target) updatePath(target.dataset.editPath, target.value);
  });
  $("#selection-toolbar").addEventListener("mousedown", (event) => event.preventDefault());
  $("#selection-toolbar").addEventListener("click", (event) => {
    const button = event.target.closest("[data-ai-rewrite]"); if (button) handleRewrite(button.dataset.aiRewrite);
  });
  $("#btn-import").addEventListener("click", () => $("#resume-file-input").click());
  $("#resume-file-input").addEventListener("change", (event) => { handleResumeFile(event.target.files[0]); event.target.value = ""; });
  $("#workspace-file-input").addEventListener("change", (event) => { importWorkspaceFile(event.target.files[0]); event.target.value = ""; });
  $("#btn-save").addEventListener("click", () => { store.save(); toast("草稿已保存在本机。", "success"); });
  $("#btn-undo").addEventListener("click", () => store.undo());
  $("#btn-redo").addEventListener("click", () => store.redo());
  $("#btn-export-menu").addEventListener("click", () => { $("#export-menu").hidden = !$("#export-menu").hidden; });
  $("#btn-export-html").addEventListener("click", exportHtml);
  $("#btn-export-markdown").addEventListener("click", exportMarkdown);
  $("#btn-export-json").addEventListener("click", exportJson);
  $("#btn-import-workspace").addEventListener("click", () => $("#workspace-file-input").click());
  $("#btn-export-workspace").addEventListener("click", exportWorkspace);
  $("#btn-print").addEventListener("click", openExportGate);
  $("#btn-ai-settings").addEventListener("click", openAISettings);
  $("#btn-review-resume").addEventListener("click", handleFullReview);
  $("#btn-jd-compare").addEventListener("click", openJDCompare);
  $("#btn-new-application").addEventListener("click", openCreateApplication);
  $("#btn-create-job-empty").addEventListener("click", openCreateApplication);
  $("#btn-add-evidence").addEventListener("click", openEvidenceDialog);
  $("#btn-analyze-jd").addEventListener("click", analyzeActiveJD);
  $("#btn-all-templates").addEventListener("click", () => showSidebarTab("templates"));
  $("#btn-add-section").addEventListener("click", openAddSection);
  $("#btn-photo").addEventListener("click", openPhotoDialog);
  $("#photo-toggle").addEventListener("change", (event) => store.transact("切换照片", (doc) => { doc.layout.showPhoto = event.target.checked; }));
  $("#btn-auto-fit").addEventListener("click", autoFit);
  $("#btn-save-version").addEventListener("click", () => { store.saveVersion(store.document.resumeName); renderSidebar(store.document); refreshIcons(); toast("已保存本地版本。", "success"); });
  $("#section-nav").addEventListener("click", (event) => {
    const button = event.target.closest("button"); if (!button) return;
    const target = button.dataset.sectionId ? $(`[data-section-id="${button.dataset.sectionId}"]`) : $('[data-edit-path="summary"]');
    target?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
  });
  $("#version-list").addEventListener("click", (event) => {
    const button = event.target.closest("[data-version-id]");
    const version = store.listVersions().find((item) => item.id === button?.dataset.versionId);
    if (version) store.replace(version.document, "恢复版本");
  });
  $("#workspace-document-list").addEventListener("click", (event) => {
    const button = event.target.closest("[data-document-id]");
    if (button && button.dataset.documentId !== store.workspace.workspace.activeDocumentId) store.activateDocument(button.dataset.documentId);
  });
  $("#recommended-templates").addEventListener("click", (event) => {
    const button = event.target.closest("[data-recommended-template-id]");
    if (button) store.transact("应用推荐模板", (doc) => { doc.layout.templateId = button.dataset.recommendedTemplateId; });
  });
  for (const [id, key] of [["job-company", "company"], ["job-role", "role"], ["job-language", "language"], ["job-source-note", "sourceNote"], ["job-jd", "jdText"]]) {
    $(`#${id}`).addEventListener("change", (event) => updateActiveApplication({ [key]: event.target.value }));
  }
  $("#job-jd").addEventListener("input", (event) => { $("#job-jd-count").textContent = `${event.target.value.length.toLocaleString("zh-CN")} 字`; });
  $("#evidence-list").addEventListener("click", (event) => {
    const button = event.target.closest("[data-evidence-id]");
    if (button) generateEvidenceDraft(button.dataset.evidenceId);
  });
  $("#requirement-list").addEventListener("change", (event) => {
    const select = event.target.closest("[data-requirement-id]");
    const application = store.workspace.getActiveApplication();
    if (select && application) {
      store.workspace.setRequirementStatus(application.id, select.dataset.requirementId, select.value);
      renderChecks(store.document);
      refreshIcons();
    }
  });
  $("#template-list").addEventListener("click", (event) => {
    const button = event.target.closest("[data-template-id]");
    if (button) store.transact("切换模板", (doc) => { doc.layout.templateId = button.dataset.templateId; });
  });
  for (const button of $$("[data-sidebar-tab]")) button.addEventListener("click", () => showSidebarTab(button.dataset.sidebarTab));
  for (const button of $$("[data-inspector-tab]")) button.addEventListener("click", () => { showInspectorTab(button.dataset.inspectorTab); setInspectorOpen(true); });
  for (const button of $$("[data-paper]")) button.addEventListener("click", () => store.transact("切换纸张", (doc) => { doc.layout.paper = button.dataset.paper; }));
  for (const id of ["font-size", "line-height", "section-gap"]) {
    $(`#${id}`).addEventListener("change", (event) => store.transact("调整版式", (doc) => { doc.layout.tokenOverrides[id === "font-size" ? "fontSize" : id === "line-height" ? "lineHeight" : "sectionGap"] = Number(event.target.value); }));
  }
  $("#zoom-slider").addEventListener("input", (event) => {
    const zoom = Number(event.target.value); document.documentElement.style.setProperty("--preview-scale", zoom / 100); $("#zoom-value").textContent = `${zoom}%`;
  });
  for (const button of $$("[data-mobile-view]")) button.addEventListener("click", () => {
    document.body.dataset.mobileView = button.dataset.mobileView;
    setActive($$("[data-mobile-view]"), button.dataset.mobileView, "mobileView");
    if (button.dataset.mobileView === "preview" && window.innerWidth <= 560) {
      const scale = Math.min(0.5, (window.innerWidth - 20) / (210 * 96 / 25.4));
      document.documentElement.style.setProperty("--preview-scale", scale);
    }
  });
  wireInspectorDrag();
  document.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") { event.preventDefault(); event.shiftKey ? store.redo() : store.undo(); }
    if (event.key === "Escape") { closeModal(); $("#selection-toolbar").hidden = true; }
  });
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".command-menu")) $("#export-menu").hidden = true;
  });
}

function loadEmbeddedDocument() {
  const raw = $("#embedded-resume-state")?.textContent?.trim();
  if (!raw || raw === "{}") return;
  try {
    const embedded = migrateDocument(JSON.parse(raw));
    store.replaceWorkspace(createWorkspaceFromLegacy(embedded));
  } catch (error) { toast(`内嵌简历无法读取：${error.message}`, "error"); }
}

function init() {
  loadEmbeddedDocument();
  const issues = validateDocument(store.document);
  if (issues.some((item) => item.level === "error")) store.document = migrateDocument(store.document);
  wireStaticEvents();
  document.body.dataset.mobileView = "content";
  renderAll();
}

init();
