/**
 * Main application entry point.
 * Initializes state, wires up toolbar buttons, manages import/export lifecycle.
 */

/** @type {string} */
const APP_STATE_KEY = "resume-formatter:app-state-v1";

document.addEventListener("DOMContentLoaded", () => {
  const initialState = loadInitialState();
  setState(initialState);

  if (initialState.sections && initialState.sections.length > 0) {
    renderResume(initialState);
  } else if (typeof DEFAULT_RESUME_MD !== "undefined") {
    // Auto-load the baked-in sample resume on first open
    const parseResult = parseMarkdown(DEFAULT_RESUME_MD);
    const validation  = validateAndBuildState(parseResult, DEFAULT_RESUME_FILENAME || "sample-resume.md");
    if (validation.state) {
      setState(validation.state);
      renderResume(validation.state);
    }
  } else {
    updateStatusInfo(initialState);
  }

  initOverflowDetection();
  initEditor();
  initPhoto();

  // Wire up toolbar buttons
  wireToolbar();
  initThemeSwitcher();
  initResumeListPanel();
});

/**
 * Wire up toolbar button event listeners.
 */
function wireToolbar() {
  const btnImport = document.getElementById("btn-import-md");
  const btnSaveHtml = document.getElementById("btn-save-html");
  const btnExportPdf = document.getElementById("btn-export-pdf");
  const btnCheckA4 = document.getElementById("btn-check-a4");
  const btnRestoreImport = document.getElementById("btn-restore-import");
  const fileInput = document.getElementById("file-input-md");

  // Import MD
  if (btnImport && fileInput) {
    btnImport.addEventListener("click", () => {
      fileInput.click();
    });

    fileInput.addEventListener("change", (e) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;
      handleImport(files[0], fileInput);
    });
  }

  // Fix overflow button
  const btnFix = document.getElementById("btn-fix-overflow");
  if (btnFix) {
    btnFix.addEventListener("click", () => autoFixOverflow());
  }

  // Font-size slider
  const fsSlider = document.getElementById("font-size-slider");
  const fsValue  = document.getElementById("font-size-value");
  if (fsSlider) {
    fsSlider.addEventListener("input", () => {
      const pt = parseFloat(fsSlider.value);
      if (fsValue) fsValue.textContent = pt + "pt";
      applyFontSize(pt);
      const state = getState();
      if (!state.layout) state.layout = {};
      state.layout.fontSize = pt;
      markDirty();
      requestAnimationFrame(() => updateA4Status());
    });
  }
  const lhSlider = document.getElementById("line-height-slider");
  const lhValue  = document.getElementById("line-height-value");
  if (lhSlider) {
    lhSlider.addEventListener("input", () => {
      const lh = parseFloat(lhSlider.value);
      if (lhValue) lhValue.textContent = lh.toFixed(2);
      const content = document.getElementById("resume-content");
      if (content) content.style.lineHeight = lh;
      const state = getState();
      if (!state.layout) state.layout = {};
      state.layout.lineHeight = lh;
      markDirty();
      requestAnimationFrame(() => updateA4Status());
    });
  }

  // Restore import
  if (btnRestoreImport) {
    btnRestoreImport.addEventListener("click", () => {
      handleRestoreImport();
    });
  }

  // New resume template
  const btnNew = document.getElementById("btn-new-resume");
  if (btnNew) {
    btnNew.addEventListener("click", handleNewResume);
  }
  const btnSave = document.getElementById("btn-save");
  if (btnSave) btnSave.addEventListener("click", () => handleSave());

  const btnSaveAs = document.getElementById("btn-save-as");
  if (btnSaveAs) btnSaveAs.addEventListener("click", () => handleSaveAs());

  // Export PDF
  if (btnExportPdf) {
    btnExportPdf.addEventListener("click", () => {
      handleExportPdf();
    });
  }
}

/**
 * Handle Markdown file import.
 * @param {File} file
 * @param {HTMLInputElement} fileInput
 */
function handleImport(file, fileInput) {
  const reader = new FileReader();

  reader.onload = (e) => {
    const raw = e.target.result;
    const parseResult = parseMarkdown(raw);
    const validation = validateAndBuildState(parseResult, file.name);

    if (validation.state) {
      // Import successful
      setState(validation.state);
      renderResume(validation.state);
      updateA4Status();
      clearDirty();

      const infoMsg = validation.errors.find((err) => err.level === "info");
      if (infoMsg) {
        showToast(infoMsg.message, "success");
      }
    } else {
      // Import had errors
      const errorMsgs = validation.errors
        .filter((err) => err.level === "error")
        .map((err) => err.message);

      showDialog({
        title: "导入失败",
        message: errorMsgs.join("\n") || "无法解析该 Markdown 文件。",
        buttons: [{ text: "好的", primary: true }],
      });
    }

    // Reset file input so same file can be re-imported
    fileInput.value = "";
  };

  reader.onerror = () => {
    showToast("文件读取失败，请重试。", "error");
  };

  reader.readAsText(file);
}

/**
 * Apply a base font size by scaling all font-size CSS variables proportionally.
 * Baseline is 9pt. All other sizes scale with the same ratio.
 * @param {number} pt
 */
function applyFontSize(pt) {
  const page = document.getElementById("resume-page");
  if (!page) return;
  const r = pt / 9; // ratio relative to 9pt baseline
  page.style.setProperty("--font-size-body",          pt + "pt");
  page.style.setProperty("--font-size-small",          (pt * 0.944).toFixed(2) + "pt");
  page.style.setProperty("--font-size-entry-name",     (pt * 1.056).toFixed(2) + "pt");
  page.style.setProperty("--font-size-section-title",  (pt * 1.167).toFixed(2) + "pt");
  page.style.setProperty("--font-size-contact",        pt + "pt");
  page.style.setProperty("--font-size-headline",       (pt * 1.444).toFixed(2) + "pt");
  page.style.setProperty("--font-size-name",           (pt * 1.889).toFixed(2) + "pt");
}

/**
 * Download a blank Schema v1 MD template.
 */
function handleNewResume() {
  const template = `---
schema_version: 1
resume_name: 公司名-岗位
name: 姓名
headline: 求职方向
location: 城市
phone: 手机号
email: 邮箱
---

## 教育经历

### 学校名称
role: 专业｜学历
date: 2020.09–2024.06
location: 城市

- 描述

## 实习经历

### 公司名称｜部门
role: 岗位
date: 2024.07–2024.09
location: 城市

- 描述

## 项目经历

### 项目名称
role: 角色
date: 2024.01–2024.03

- 描述

## 技能

- 技能类别：具体内容
`;

  const blob = new Blob([template], { type: "text/plain;charset=utf-8" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = "新简历-模板.md";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast("已下载模板，用文本编辑器填写后导入即可。", "success");
}

/**
 * 保存 — 直接用当前文件名下载，无弹窗。
 */
function handleSave() {
  const state = getState();
  if (!state.profile.name && (!state.sections || state.sections.length === 0)) {
    showToast("请先导入简历。", "warning");
    return;
  }
  const fileName = sanitizeFileName(
    state.resumeName || state.source.fileName.replace(/\.md$/, "") || "resume"
  );
  try {
    exportAsHtml(state, fileName);
    clearDirty();
    showToast(`已保存：${fileName}.html`, "success");
  } catch (e) {
    console.error("Save failed:", e);
    showToast("保存失败，请重试。", "error");
  }
}

/**
 * 另存为 — 弹输入框让用户指定新文件名，再下载。
 */
function handleSaveAs() {
  const state = getState();
  if (!state.profile.name && (!state.sections || state.sections.length === 0)) {
    showToast("请先导入简历。", "warning");
    return;
  }
  const defaultName = sanitizeFileName(
    state.resumeName || state.source.fileName.replace(/\.md$/, "") || "resume"
  );
  showInputDialog({
    title: "另存为",
    message: "输入文件名：",
    defaultValue: defaultName,
    confirmText: "保存",
    onSubmit: (fileName) => {
      try {
        exportAsHtml(state, fileName);
        clearDirty();
        showToast(`已保存：${fileName}.html`, "success");
      } catch (e) {
        console.error("Save As failed:", e);
        showToast("保存失败，请重试。", "error");
      }
    },
  });
}

/**
 * Handle "Restore Import Content" button.
 */
function handleRestoreImport() {
  const state = getState();

  if (!state.importSnapshot) {
    showToast("没有可恢复的导入内容。", "warning");
    return;
  }

  showDialog({
    title: "恢复导入内容",
    message: "当前页面中的修改将被清除，是否恢复为最近一次导入的内容？",
    buttons: [
      {
        text: "取消",
      },
      {
        text: "恢复",
        primary: true,
        action: () => {
          restoreImportSnapshot(state, state.importSnapshot);
          renderResume(state);
          updateA4Status();
          showToast("已恢复为最近一次导入的内容。", "success");
        },
      },
    ],
  });
}

/**
 * Handle "Export PDF" button.
 */
function handleExportPdf() {
  const state = getState();

  if (!state.profile.name) {
    showToast("请先导入 Markdown 简历。", "warning");
    return;
  }

  // Check overflow
  const { overflow } = checkOverflow();
  if (overflow) {
    showDialog({
      title: "内容溢出",
      message: "当前内容超出单页 A4。导出 PDF 可能出现分页或截断。是否仍然打印？",
      buttons: [
        { text: "返回修改" },
        { text: "仍然打印", primary: true, action: () => exportPdf() },
      ],
    });
  } else {
    exportPdf();
  }
}

/**
 * Show a simple confirmation/info dialog.
 * @param {object} opts
 * @param {string} opts.title
 * @param {string} opts.message
 * @param {{ text: string, primary?: boolean, action?: Function }[]} opts.buttons
 */
function showDialog({ title, message, buttons }) {
  const root = document.getElementById("dialog-root");
  if (!root) return;

  root.innerHTML = "";
  root.classList.add("active");

  const backdrop = document.createElement("div");
  backdrop.className = "dialog-backdrop";
  backdrop.addEventListener("click", closeDialog);
  root.appendChild(backdrop);

  const box = document.createElement("div");
  box.className = "dialog-box";

  const titleEl = document.createElement("h3");
  titleEl.className = "dialog-title";
  titleEl.textContent = title;
  box.appendChild(titleEl);

  const msgEl = document.createElement("p");
  msgEl.className = "dialog-message";
  msgEl.style.whiteSpace = "pre-line";
  msgEl.textContent = message;
  box.appendChild(msgEl);

  const actions = document.createElement("div");
  actions.className = "dialog-actions";

  for (const btn of (buttons || [{ text: "确定", primary: true }])) {
    const btnEl = document.createElement("button");
    btnEl.className = "dialog-btn";
    if (btn.primary) btnEl.classList.add("dialog-btn-primary");
    if (btn.text.includes("删除") || btn.text.includes("恢复")) btnEl.classList.add("dialog-btn-danger");
    btnEl.textContent = btn.text;
    btnEl.addEventListener("click", () => {
      closeDialog();
      if (btn.action) btn.action();
    });
    actions.appendChild(btnEl);
  }

  box.appendChild(actions);
  root.appendChild(box);
}

/**
 * Show an input dialog.
 * @param {object} opts
 * @param {string} opts.title
 * @param {string} opts.message
 * @param {string} opts.defaultValue
 * @param {string} opts.confirmText
 * @param {Function} opts.onSubmit
 */
function showInputDialog({ title, message, defaultValue, confirmText, onSubmit }) {
  const root = document.getElementById("dialog-root");
  if (!root) return;

  root.innerHTML = "";
  root.classList.add("active");

  const backdrop = document.createElement("div");
  backdrop.className = "dialog-backdrop";
  backdrop.addEventListener("click", closeDialog);
  root.appendChild(backdrop);

  const box = document.createElement("div");
  box.className = "dialog-box";

  const titleEl = document.createElement("h3");
  titleEl.className = "dialog-title";
  titleEl.textContent = title;
  box.appendChild(titleEl);

  if (message) {
    const msgEl = document.createElement("p");
    msgEl.className = "dialog-message";
    msgEl.textContent = message;
    box.appendChild(msgEl);
  }

  const input = document.createElement("input");
  input.className = "dialog-input";
  input.type = "text";
  input.value = defaultValue || "";
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && input.value.trim()) {
      closeDialog();
      onSubmit(input.value.trim());
    }
  });
  box.appendChild(input);

  const actions = document.createElement("div");
  actions.className = "dialog-actions";

  const cancelBtn = document.createElement("button");
  cancelBtn.className = "dialog-btn";
  cancelBtn.textContent = "取消";
  cancelBtn.addEventListener("click", closeDialog);
  actions.appendChild(cancelBtn);

  const confirmBtn = document.createElement("button");
  confirmBtn.className = "dialog-btn dialog-btn-primary";
  confirmBtn.textContent = confirmText || "确认";
  confirmBtn.addEventListener("click", () => {
    if (!input.value.trim()) return;
    closeDialog();
    onSubmit(input.value.trim());
  });
  actions.appendChild(confirmBtn);

  box.appendChild(actions);
  root.appendChild(box);

  // Focus input
  setTimeout(() => input.focus(), 50);
}

/**
 * Resume list panel — File System Access API based directory browser.
 * Directory handle is persisted in IndexedDB so it survives page reloads.
 */

/** @type {FileSystemDirectoryHandle|null} */
let _dirHandle = null;

/** @type {string|null} — filename of currently active resume */
let _activeFile = null;

const IDB_NAME    = "resume-formatter";
const IDB_STORE   = "config";
const IDB_DIR_KEY = "dir-handle";

/**
 * Open (or create) the IndexedDB database.
 * @returns {Promise<IDBDatabase>}
 */
function openIDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = (e) => {
      e.target.result.createObjectStore(IDB_STORE);
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror   = (e) => reject(e.target.error);
  });
}

/**
 * Save directory handle to IndexedDB.
 * @param {FileSystemDirectoryHandle} handle
 */
async function saveDirHandle(handle) {
  try {
    const db = await openIDB();
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).put(handle, IDB_DIR_KEY);
  } catch (e) {
    console.warn("Failed to save dir handle:", e);
  }
}

/**
 * Load directory handle from IndexedDB.
 * @returns {Promise<FileSystemDirectoryHandle|null>}
 */
async function loadDirHandle() {
  try {
    const db = await openIDB();
    return new Promise((resolve) => {
      const tx  = db.transaction(IDB_STORE, "readonly");
      const req = tx.objectStore(IDB_STORE).get(IDB_DIR_KEY);
      req.onsuccess = (e) => resolve(e.target.result || null);
      req.onerror   = ()  => resolve(null);
    });
  } catch {
    return null;
  }
}

function initResumeListPanel() {
  const btnPick    = document.getElementById("btn-pick-dir");
  const btnRefresh = document.getElementById("btn-refresh-dir");

  if (btnPick) {
    btnPick.addEventListener("click", async () => {
      if (!("showDirectoryPicker" in window)) {
        showToast("当前浏览器不支持目录选择，请使用 Chrome。", "error");
        return;
      }
      try {
        _dirHandle = await window.showDirectoryPicker({ mode: "read" });
        await saveDirHandle(_dirHandle);
        await refreshResumeList();
      } catch (e) {
        // User cancelled
      }
    });
  }

  if (btnRefresh) {
    btnRefresh.addEventListener("click", async () => {
      if (_dirHandle) await refreshResumeList();
    });
  }

  // Try to restore saved handle on startup
  restoreDirHandle();
}

/**
 * Try to restore directory handle from IndexedDB on page load.
 * If permission needs re-granting, show a notice in the panel.
 */
async function restoreDirHandle() {
  const handle = await loadDirHandle();
  if (!handle) return;

  try {
    // Check current permission state
    const perm = await handle.queryPermission({ mode: "read" });

    if (perm === "granted") {
      _dirHandle = handle;
      await refreshResumeList();
    } else {
      // Needs user gesture to re-grant — show reauth button
      _dirHandle = handle;
      showReauthNotice(handle);
    }
  } catch {
    // Handle stale or inaccessible — silently ignore
  }
}

/**
 * Show "重新授权" notice in the panel when permission needs re-granting.
 * @param {FileSystemDirectoryHandle} handle
 */
function showReauthNotice(handle) {
  const empty = document.getElementById("panel-empty");
  const dirName = document.getElementById("panel-dir-name");

  if (dirName) {
    dirName.textContent = handle.name;
    dirName.title       = handle.name;
  }

  if (empty) {
    empty.classList.remove("hidden");
    empty.innerHTML = `
      <div style="margin-bottom:8px;color:#6b7280">上次目录：<br><strong>${handle.name}</strong></div>
      <button id="btn-reauth" style="
        padding:5px 10px;font-size:12px;
        background:#2563eb;color:#fff;
        border:none;border-radius:4px;cursor:pointer
      ">重新授权访问</button>
    `;
    const btnReauth = document.getElementById("btn-reauth");
    if (btnReauth) {
      btnReauth.addEventListener("click", async () => {
        try {
          const perm = await handle.requestPermission({ mode: "read" });
          if (perm === "granted") {
            _dirHandle = handle;
            await refreshResumeList();
          }
        } catch (e) {
          showToast("授权失败，请重新选择目录。", "error");
        }
      });
    }
  }

  const btnRefresh = document.getElementById("btn-refresh-dir");
  if (btnRefresh) btnRefresh.hidden = false;
}

/**
 * Read directory and populate the resume list.
 */
async function refreshResumeList() {
  if (!_dirHandle) return;

  const list    = document.getElementById("resume-list");
  const empty   = document.getElementById("panel-empty");
  const dirName = document.getElementById("panel-dir-name");
  const btnRefresh = document.getElementById("btn-refresh-dir");

  if (dirName) {
    dirName.textContent = _dirHandle.name;
    dirName.title       = _dirHandle.name;
  }
  if (btnRefresh) btnRefresh.hidden = false;

  // Collect .md files
  const files = [];
  for await (const [name, handle] of _dirHandle.entries()) {
    if (handle.kind === "file" && name.endsWith(".md")) {
      files.push({ name, handle });
    }
  }

  // Sort alphabetically
  files.sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));

  if (list) {
    list.innerHTML = "";
    for (const { name, handle } of files) {
      const li = document.createElement("li");
      li.className = "resume-list-item" + (name === _activeFile ? " active" : "");
      li.textContent = name.replace(/\.md$/, "");
      li.title       = name;
      li.addEventListener("click", () => loadResumeFromHandle(name, handle));
      list.appendChild(li);
    }
  }

  if (empty) empty.classList.toggle("hidden", files.length > 0);
}

/**
 * Load a resume .md file from a FileSystemFileHandle.
 * @param {string} name
 * @param {FileSystemFileHandle} handle
 */
async function loadResumeFromHandle(name, handle) {
  // Warn if dirty
  if (isDirty()) {
    const confirmed = await new Promise((resolve) => {
      showDialog({
        title: "有未保存的修改",
        message: "切换简历将丢失当前未保存的修改，是否继续？",
        buttons: [
          { text: "取消",    action: () => resolve(false) },
          { text: "继续切换", primary: true, action: () => resolve(true) },
        ],
      });
    });
    if (!confirmed) return;
  }

  try {
    const file = await handle.getFile();
    const text = await file.text();

    const parseResult = parseMarkdown(text);
    const validation  = validateAndBuildState(parseResult, name);

    if (validation.state) {
      setState(validation.state);
      renderResume(validation.state);
      updateA4Status();
      clearDirty();

      // Mark active
      _activeFile = name;
      document.querySelectorAll(".resume-list-item").forEach((li) => {
        li.classList.toggle("active", li.title === name);
      });

      const info = validation.errors.find((e) => e.level === "info");
      if (info) showToast(info.message, "success");
    } else {
      const errs = validation.errors
        .filter((e) => e.level === "error")
        .map((e) => e.message)
        .join("\n");
      showDialog({ title: "导入失败", message: errs, buttons: [{ text: "好的", primary: true }] });
    }
  } catch (e) {
    console.error(e);
    showToast("文件读取失败：" + e.message, "error");
  }
}

/**
 * Initialize theme switcher A/B buttons.
 */
function initThemeSwitcher() {
  const btnA = document.getElementById("btn-theme-a");
  const btnB = document.getElementById("btn-theme-b");
  const page = document.getElementById("resume-page");
  if (!btnA || !btnB || !page) return;

  function setTheme(theme) {
    page.dataset.theme = theme;
    btnA.classList.toggle("toolbar-btn-active", theme === "a");
    btnB.classList.toggle("toolbar-btn-active", theme === "b");
    // Re-render header to reflect theme-specific contact format
    const state = getState();
    if (state.sections && state.sections.length > 0) {
      renderResume(state);
    }
  }

  btnA.addEventListener("click", () => setTheme("a"));
  btnB.addEventListener("click", () => setTheme("b"));
}


function closeDialog() {
  const root = document.getElementById("dialog-root");
  if (!root) return;
  root.innerHTML = "";
  root.classList.remove("active");
}
