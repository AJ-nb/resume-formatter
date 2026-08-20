import { createIcons, icons } from "lucide";
import {
  AI_PROVIDERS,
  REWRITE_MODES,
  compareWithJD,
  createSelectionReference,
  listAvailableModels,
  loadAIConfig,
  normalizeAIConfig,
  reviewResume,
  rewriteSelection,
  saveAIConfig,
  selectionIsCurrent,
  testConnection,
} from "./ai.js";
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
  checkMachineReadability,
  diffWords,
  getByPath,
  locateOverflow,
  renderDocument,
  renderMobileEditor,
  setByPath,
} from "./renderer.js";
import { ResumeStore } from "./store.js";

const store = new ResumeStore();
let aiConfig = loadAIConfig();
let activeSelection = null;
let overflowState = { overflow: false, overflowPx: 0, firstPath: "" };
let renderFrame = 0;
let templateQuery = "";
let templateCategory = "all";

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

function renderSidebar(doc) {
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
  for (const check of checkMachineReadability(doc)) {
    const item = node("div", `check-item ${check.status}`);
    const title = node("div", "check-title");
    const icon = node("i"); icon.dataset.lucide = check.status === "pass" ? "circle-check" : "triangle-alert";
    title.append(icon, node("span", "", check.title));
    item.append(title, node("p", "", check.detail));
    if (check.path) item.dataset.path = check.path;
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
  $("#quick-template").value = layout.template.id;
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
    refreshIcons();
  });
}

function renderAll(doc = store.document) {
  renderDocument(doc, $("#resume-paper"));
  renderMobileEditor(doc, $("#mobile-editor"));
  renderSidebar(doc);
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
    showInspectorTab("ai");
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

function openJDCompare() {
  const modal = openModal("JD 对照", { wide: true });
  const textarea = node("textarea"); textarea.placeholder = "粘贴岗位描述"; textarea.rows = 10;
  modal.body.append(formField("岗位描述", textarea, true));
  modal.footer.append(modalButton("取消", "", modal.close));
  modal.footer.append(modalButton("开始对照", "primary", async () => {
    if (!textarea.value.trim()) return toast("请先粘贴岗位描述。", "error");
    modal.close();
    const wait = loadingModal("JD 对照");
    try {
      const result = await compareWithJD(aiConfig, store.document, textarea.value);
      wait.close();
      renderJDResults(result);
    } catch (error) { wait.close(); toast(error.message, "error"); }
  }));
}

function renderJDResults(result) {
  showInspectorTab("ai");
  const target = $("#ai-results");
  target.replaceChildren();
  const keywordItem = node("div", "ai-result-item");
  keywordItem.append(node("strong", "", "本地关键词命中"));
  const matched = result.keywords.filter((item) => item.matched).map((item) => item.keyword).join("、") || "无";
  const missing = result.keywords.filter((item) => !item.matched).map((item) => item.keyword).join("、") || "无";
  keywordItem.append(node("p", "", `命中：${matched}\n未命中：${missing}`));
  target.append(keywordItem);
  for (const suggestion of result.suggestions) {
    const item = node("div", "ai-result-item");
    item.append(node("strong", "", suggestion.requirement), node("p", "", `已有证据：${suggestion.evidence || "无"}\n建议：${suggestion.recommendation}`));
    target.append(item);
  }
  document.body.classList.add("inspector-open");
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

function exportMarkdown() {
  download(serializeMarkdown(store.document), safeFileName("md"), "text/markdown;charset=utf-8");
}

function exportHtml() {
  closeModal();
  const cloneDoc = document.documentElement.cloneNode(true);
  cloneDoc.querySelector("#modal-root")?.replaceChildren();
  cloneDoc.querySelector("#toast-root")?.replaceChildren();
  cloneDoc.querySelector("#selection-toolbar")?.setAttribute("hidden", "");
  cloneDoc.querySelectorAll("[data-sensitive]").forEach((item) => { item.value = ""; item.setAttribute("value", ""); });
  const embedded = cloneDoc.querySelector("#embedded-resume-state");
  embedded.textContent = JSON.stringify(store.document).replace(/<\/script/gi, "<\\/script");
  const html = `<!doctype html>\n${cloneDoc.outerHTML}`;
  download(html, safeFileName("html"), "text/html;charset=utf-8");
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
  const quickTemplate = $("#quick-template");
  quickTemplate.replaceChildren(...TEMPLATES.map((template) => {
    const option = node("option", "", template.name); option.value = template.id; return option;
  }));
  quickTemplate.addEventListener("change", (event) => store.transact("切换模板", (doc) => { doc.layout.templateId = event.target.value; }));
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
  $("#btn-save").addEventListener("click", () => { store.save(); toast("草稿已保存在本机。", "success"); });
  $("#btn-undo").addEventListener("click", () => store.undo());
  $("#btn-redo").addEventListener("click", () => store.redo());
  $("#btn-export-menu").addEventListener("click", () => { $("#export-menu").hidden = !$("#export-menu").hidden; });
  $("#btn-export-html").addEventListener("click", exportHtml);
  $("#btn-export-markdown").addEventListener("click", exportMarkdown);
  $("#btn-export-json").addEventListener("click", exportJson);
  $("#btn-print").addEventListener("click", () => window.print());
  $("#btn-ai-settings").addEventListener("click", openAISettings);
  $("#btn-review-resume").addEventListener("click", handleFullReview);
  $("#btn-jd-compare").addEventListener("click", openJDCompare);
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
    store.document = embedded;
    store.dirty = false;
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
