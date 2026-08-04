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
  initToolbarMenus();
  initResumeListPanel();
  initJsonImport();
  initMarkdownPaste();
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

/** Save the current text state as a new local Markdown snapshot. */
function handleSave() {
  syncFocusedEditor();
  const state = getState();
  if (!state.profile.name && (!state.sections || state.sections.length === 0)) {
    showToast("请先导入简历。", "warning");
    return;
  }
  try {
    const snapshot = saveMarkdownSnapshot(state);
    clearDirty();
    showToast(`已保存 MD 快照：${snapshot.name}`, "success");
  } catch (e) {
    console.error("Save failed:", e);
    showToast("保存失败，请重试。", "error");
  }
}

/**
 * Save a named local Markdown snapshot.
 */
function handleSaveAs() {
  syncFocusedEditor();
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
        const snapshot = saveMarkdownSnapshot(state, fileName);
        clearDirty();
        showToast(`已保存 MD 快照：${snapshot.name}`, "success");
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

let _directoryFiles = [];
let _directoryName = "简历版本";
let _directoryCanRefresh = false;

const MD_SNAPSHOTS_KEY = "resume-formatter:md-snapshots-v1";

function syncFocusedEditor() {
  const active = document.activeElement;
  if (active && active.closest && active.closest("#resume-content")) active.blur();
}

function loadMarkdownSnapshots() {
  try {
    const parsed = JSON.parse(localStorage.getItem(MD_SNAPSHOTS_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error("Failed to load Markdown snapshots:", e);
    return [];
  }
}

function saveMarkdownSnapshot(state, customName) {
  const now = new Date();
  const timestamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
    "-",
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0"),
  ].join("");
  const baseName = sanitizeFileName(
    customName || state.resumeName || (state.source.fileName || "").replace(/\.md$/i, "") || "resume"
  ).replace(/\.md$/i, "");
  const snapshot = {
    id: generateId(),
    name: `${baseName}${customName ? "" : `-${timestamp}`}.md`,
    markdown: serializeStateToMarkdown(state),
    createdAt: now.toISOString(),
  };
  const snapshots = loadMarkdownSnapshots();
  snapshots.unshift(snapshot);
  localStorage.setItem(MD_SNAPSHOTS_KEY, JSON.stringify(snapshots));
  _activeFile = `snapshot:${snapshot.id}`;
  renderResumeFileList(_directoryFiles, _directoryName, _directoryCanRefresh);
  return snapshot;
}

function deleteMarkdownSnapshot(snapshotId) {
  const snapshots = loadMarkdownSnapshots().filter((snapshot) => snapshot.id !== snapshotId);
  localStorage.setItem(MD_SNAPSHOTS_KEY, JSON.stringify(snapshots));
  if (_activeFile === `snapshot:${snapshotId}`) _activeFile = null;
  renderResumeFileList(_directoryFiles, _directoryName, _directoryCanRefresh);
}

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
  const directoryInput = document.getElementById("file-input-directory");

  if (directoryInput) {
    directoryInput.addEventListener("change", () => {
      const selectedFiles = Array.from(directoryInput.files || []);
      if (selectedFiles.length === 0) return;

      _dirHandle = null;
      const rootName = selectedFiles.length === 1 ? "所选 Markdown" : `所选 Markdown（${selectedFiles.length}）`;
      const files = selectedFiles
        .filter((file) => /\.md$/i.test(file.name))
        .map((file) => ({
          name: file.name,
          handle: { getFile: async () => file },
        }));
      renderResumeFileList(files, rootName, false);
      directoryInput.value = "";
    });
  }

  if (btnPick) {
    btnPick.addEventListener("click", async () => {
      if (!("showDirectoryPicker" in window)) {
        if (directoryInput) directoryInput.click();
        return;
      }
      try {
        _dirHandle = await window.showDirectoryPicker({ mode: "read" });
        await saveDirHandle(_dirHandle);
        await refreshResumeList();
      } catch (e) {
        if (e.name === "AbortError") return;
        console.error("Failed to open resume directory:", e);
        if (directoryInput) {
          directoryInput.click();
        } else {
          showToast("无法读取该目录：" + e.message, "error");
        }
      }
    });
  }

  if (btnRefresh) {
    btnRefresh.addEventListener("click", async () => {
      if (!_dirHandle) return;
      try {
        await refreshResumeList();
      } catch (e) {
        console.error("Failed to refresh resume directory:", e);
        showToast("刷新目录失败：" + e.message, "error");
      }
    });
  }

  // Try to restore saved handle on startup
  restoreDirHandle();
  renderResumeFileList([], "简历版本", false);
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

  // Collect Markdown files recursively so versions can live in subfolders.
  const files = [];
  await collectMarkdownFiles(_dirHandle, "", files);

  renderResumeFileList(files, _dirHandle.name, true);
}

/**
 * Render collected Markdown files in the version panel.
 * @param {Array<{name:string, handle:{getFile:Function}}>} files
 * @param {string} directoryName
 * @param {boolean} canRefresh
 */
function renderResumeFileList(files, directoryName, canRefresh) {
  const list = document.getElementById("resume-list");
  const empty = document.getElementById("panel-empty");
  const dirName = document.getElementById("panel-dir-name");
  const btnRefresh = document.getElementById("btn-refresh-dir");

  _directoryFiles = files;
  _directoryName = directoryName;
  _directoryCanRefresh = canRefresh;

  if (dirName) {
    dirName.textContent = directoryName;
    dirName.title = directoryName;
  }
  if (btnRefresh) btnRefresh.hidden = !canRefresh;

  const sourceFiles = [...files].sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
  const snapshots = loadMarkdownSnapshots();

  if (list) {
    list.innerHTML = "";
    const appendHeading = (text) => {
      const heading = document.createElement("li");
      heading.className = "resume-list-heading";
      heading.textContent = text;
      list.appendChild(heading);
    };

    if (snapshots.length > 0) appendHeading("本地快照");
    for (const snapshot of snapshots) {
      const versionKey = `snapshot:${snapshot.id}`;
      const li = document.createElement("li");
      li.className = "resume-list-item resume-list-snapshot" + (versionKey === _activeFile ? " active" : "");
      li.title = snapshot.name;
      li.dataset.versionKey = versionKey;

      const label = document.createElement("span");
      label.textContent = snapshot.name.replace(/\.md$/i, "");
      li.appendChild(label);

      const deleteButton = document.createElement("button");
      deleteButton.className = "resume-list-delete";
      deleteButton.textContent = "×";
      deleteButton.title = "删除本地快照";
      deleteButton.addEventListener("click", (event) => {
        event.stopPropagation();
        showDialog({
          title: "删除 MD 快照",
          message: `确定删除“${snapshot.name}”吗？`,
          buttons: [
            { text: "取消" },
            { text: "删除", action: () => deleteMarkdownSnapshot(snapshot.id) },
          ],
        });
      });
      li.appendChild(deleteButton);

      const handle = {
        getFile: async () => new File([snapshot.markdown], snapshot.name, { type: "text/markdown" }),
      };
      li.addEventListener("click", () => loadResumeFromHandle(snapshot.name, handle, versionKey));
      list.appendChild(li);
    }

    if (sourceFiles.length > 0) appendHeading("目录文件");
    for (const { name, handle } of sourceFiles) {
      const versionKey = `source:${name}`;
      const li = document.createElement("li");
      li.className = "resume-list-item" + (versionKey === _activeFile ? " active" : "");
      li.textContent = name.replace(/\.md$/i, "");
      li.title = name;
      li.dataset.versionKey = versionKey;
      li.addEventListener("click", () => loadResumeFromHandle(name, handle, versionKey));
      list.appendChild(li);
    }
  }

  if (empty) {
    const hasVersions = sourceFiles.length > 0 || snapshots.length > 0;
    empty.textContent = hasVersions ? "" : "选择 Markdown 文件，或保存当前内容创建快照";
    empty.classList.toggle("hidden", hasVersions);
  }
}

/**
 * Recursively collect Markdown files from a directory.
 * @param {FileSystemDirectoryHandle} directory
 * @param {string} prefix
 * @param {Array<{name:string, handle:FileSystemFileHandle}>} files
 */
async function collectMarkdownFiles(directory, prefix, files) {
  for await (const [name, handle] of directory.entries()) {
    if (name.startsWith(".")) continue;
    const relativeName = prefix ? `${prefix}/${name}` : name;
    if (handle.kind === "file" && /\.md$/i.test(name)) {
      files.push({ name: relativeName, handle });
    } else if (handle.kind === "directory") {
      await collectMarkdownFiles(handle, relativeName, files);
    }
  }
}

/**
 * Load a resume .md file from a FileSystemFileHandle.
 * @param {string} name
 * @param {FileSystemFileHandle} handle
 */
async function loadResumeFromHandle(name, handle, versionKey = name) {
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
      _activeFile = versionKey;
      document.querySelectorAll(".resume-list-item").forEach((li) => {
        li.classList.toggle("active", li.dataset.versionKey === versionKey);
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
 * Initialize theme switcher.
 */
function initThemeSwitcher() {
  const btnA = document.getElementById("btn-theme-a");
  const btnB = document.getElementById("btn-theme-b");
  const btnC = document.getElementById("btn-theme-c");
  const btnD = document.getElementById("btn-theme-d");
  const themeLabel = document.getElementById("current-theme-label");
  const themeMenu = document.getElementById("theme-menu");
  const page = document.getElementById("resume-page");
  if (!btnA || !btnB || !page) return;

  function setTheme(theme) {
    page.dataset.theme = theme;
    btnA.classList.toggle("toolbar-btn-active", theme === "a");
    btnB.classList.toggle("toolbar-btn-active", theme === "b");
    if (btnC) btnC.classList.toggle("toolbar-btn-active", theme === "c");
    if (btnD) btnD.classList.toggle("toolbar-btn-active", theme === "d");
    if (themeLabel) {
      themeLabel.textContent = { a: "黑体", b: "宋体", c: "思源", d: "学术" }[theme];
    }
    if (themeMenu) themeMenu.open = false;
    // Re-render header to reflect theme-specific contact format
    const state = getState();
    if (state.sections && state.sections.length > 0) {
      renderResume(state);
    }
  }

  btnA.addEventListener("click", () => setTheme("a"));
  btnB.addEventListener("click", () => setTheme("b"));
  if (btnC) btnC.addEventListener("click", () => setTheme("c"));
  if (btnD) btnD.addEventListener("click", () => setTheme("d"));
}

function initToolbarMenus() {
  const menus = Array.from(document.querySelectorAll("#toolbar .toolbar-menu"));

  menus.forEach((menu) => {
    menu.addEventListener("toggle", () => {
      if (!menu.open) return;
      menus.forEach((other) => {
        if (other !== menu) other.open = false;
      });
    });
  });

  const moreMenu = document.getElementById("more-menu");
  if (moreMenu) {
    moreMenu.querySelectorAll("button").forEach((button) => {
      button.addEventListener("click", () => { moreMenu.open = false; });
    });
  }

  document.addEventListener("click", (event) => {
    menus.forEach((menu) => {
      if (!menu.contains(event.target)) menu.open = false;
    });
  });
}


function closeDialog() {
  const root = document.getElementById("dialog-root");
  if (!root) return;
  root.innerHTML = "";
  root.classList.remove("active");
}

/**
 * JSON import initialization.
 * Wires up JSON import buttons and file input.
 */
function initJsonImport() {
  const btnPasteJson = document.getElementById("btn-paste-json");
  const btnImportJsonFile = document.getElementById("btn-import-json-file");
  const btnShowJsonExample = document.getElementById("btn-show-json-example");
  const fileInput = document.getElementById("file-input-json");

  if (btnPasteJson) btnPasteJson.addEventListener("click", handlePasteJson);
  if (btnImportJsonFile) btnImportJsonFile.addEventListener("click", () => {
    if (fileInput) fileInput.click();
  });
  if (btnShowJsonExample) btnShowJsonExample.addEventListener("click", handleShowJsonExample);

  // 4 conversion prompt buttons
  const btnPdfToMd = document.getElementById("btn-copy-pdf-to-md");
  const btnPdfToJson = document.getElementById("btn-copy-pdf-to-json");
  const btnDocxToMd = document.getElementById("btn-copy-docx-to-md");
  const btnDocxToJson = document.getElementById("btn-copy-docx-to-json");

  if (btnPdfToMd) btnPdfToMd.addEventListener("click", () => handleCopyPrompt(PROMPT_PDF_TO_MD, "PDF 转 Markdown Prompt 已复制"));
  if (btnPdfToJson) btnPdfToJson.addEventListener("click", () => handleCopyPrompt(PROMPT_PDF_TO_JSON, "PDF 转 JSON Prompt 已复制"));
  if (btnDocxToMd) btnDocxToMd.addEventListener("click", () => handleCopyPrompt(PROMPT_DOCX_TO_MD, "DOCX 转 Markdown Prompt 已复制"));
  if (btnDocxToJson) btnDocxToJson.addEventListener("click", () => handleCopyPrompt(PROMPT_DOCX_TO_JSON, "DOCX 转 JSON Prompt 已复制"));

  if (fileInput) {
    fileInput.addEventListener("change", (e) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;
      handleImportJsonFile(files[0], fileInput);
    });
  }
}

function initMarkdownPaste() {
  const btnPasteMd = document.getElementById("btn-paste-md");
  const btnShowMdExample = document.getElementById("btn-show-md-example");

  if (btnPasteMd) btnPasteMd.addEventListener("click", handlePasteMarkdown);
  if (btnShowMdExample) btnShowMdExample.addEventListener("click", handleShowMdExample);
}

function handlePasteMarkdown() {
  _proceedWithDirtyCheck(() => {
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
    box.style.maxWidth = "600px";

    const titleEl = document.createElement("h3");
    titleEl.className = "dialog-title";
    titleEl.textContent = "粘贴 Markdown";
    box.appendChild(titleEl);

    const msgEl = document.createElement("p");
    msgEl.className = "dialog-message";
    msgEl.textContent = "将简历 Markdown 粘贴到下方文本框。";
    box.appendChild(msgEl);

    const textarea = document.createElement("textarea");
    textarea.className = "dialog-input";
    textarea.style.width = "100%";
    textarea.style.minHeight = "300px";
    textarea.style.fontFamily = "monospace";
    textarea.style.fontSize = "12px";
    textarea.placeholder = "在此粘贴 Markdown...";
    box.appendChild(textarea);

    const exampleLink = document.createElement("a");
    exampleLink.textContent = "填入示例 Markdown";
    exampleLink.href = "#";
    exampleLink.style.display = "block";
    exampleLink.style.marginTop = "6px";
    exampleLink.style.fontSize = "12px";
    exampleLink.addEventListener("click", (e) => {
      e.preventDefault();
      textarea.value = MARKDOWN_EXAMPLE;
    });
    box.appendChild(exampleLink);

    const actions = document.createElement("div");
    actions.className = "dialog-actions";

    const clearBtn = document.createElement("button");
    clearBtn.className = "dialog-btn";
    clearBtn.textContent = "清空";
    clearBtn.addEventListener("click", () => { textarea.value = ""; });
    actions.appendChild(clearBtn);

    const cancelBtn = document.createElement("button");
    cancelBtn.className = "dialog-btn";
    cancelBtn.textContent = "取消";
    cancelBtn.addEventListener("click", closeDialog);
    actions.appendChild(cancelBtn);

    const importBtn = document.createElement("button");
    importBtn.className = "dialog-btn dialog-btn-primary";
    importBtn.textContent = "导入";
    importBtn.addEventListener("click", () => {
      const raw = textarea.value.trim();
      if (!raw) {
        showToast("请先粘贴 Markdown 内容。", "warning");
        return;
      }
      const parseResult = parseMarkdown(raw);
      const validation = validateAndBuildState(parseResult, "粘贴的 Markdown");
      closeDialog();
      if (validation.state) {
        setState(validation.state);
        renderResume(validation.state);
        updateA4Status();
        clearDirty();
        const infoMsg = validation.errors.find((err) => err.level === "info");
        if (infoMsg) {
          showToast(infoMsg.message, "success");
        } else {
          showToast("已导入：粘贴的 Markdown", "success");
        }
      } else {
        const errorMsgs = validation.errors
          .filter((err) => err.level === "error")
          .map((err) => err.message);
        showDialog({
          title: "Markdown 导入失败",
          message: errorMsgs.join("\n") || "无法解析该 Markdown。",
          buttons: [{ text: "关闭", primary: true }],
        });
      }
    });
    actions.appendChild(importBtn);

    box.appendChild(actions);
    root.appendChild(box);
    setTimeout(() => textarea.focus(), 50);
  });
}

function handleShowMdExample() {
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
  box.style.maxWidth = "600px";

  const titleEl = document.createElement("h3");
  titleEl.className = "dialog-title";
  titleEl.textContent = "Markdown 示例（Schema v1）";
  box.appendChild(titleEl);

  const pre = document.createElement("pre");
  pre.style.whiteSpace = "pre-wrap";
  pre.style.wordBreak = "break-all";
  pre.style.fontFamily = "monospace";
  pre.style.fontSize = "12px";
  pre.style.maxHeight = "400px";
  pre.style.overflow = "auto";
  pre.style.background = "var(--bg-secondary, #f5f5f5)";
  pre.style.padding = "8px";
  pre.style.borderRadius = "4px";
  pre.textContent = MARKDOWN_EXAMPLE;
  box.appendChild(pre);

  const actions = document.createElement("div");
  actions.className = "dialog-actions";

  const closeBtn = document.createElement("button");
  closeBtn.className = "dialog-btn";
  closeBtn.textContent = "关闭";
  closeBtn.addEventListener("click", closeDialog);
  actions.appendChild(closeBtn);

  const copyBtn = document.createElement("button");
  copyBtn.className = "dialog-btn dialog-btn-primary";
  copyBtn.textContent = "复制示例";
  copyBtn.addEventListener("click", () => {
    if (typeof navigator === "undefined" || !navigator.clipboard) {
      showToast("当前浏览器不支持自动复制。", "warning");
      return;
    }
    navigator.clipboard.writeText(MARKDOWN_EXAMPLE).then(() => {
      showToast("Markdown 示例已复制。", "success");
      closeDialog();
    }).catch(() => {
      showToast("复制失败，请手动复制。", "error");
    });
  });
  actions.appendChild(copyBtn);

  box.appendChild(actions);
  root.appendChild(box);
}

/**
 * Check if current state is dirty and confirm before proceeding.
 * @param {Function} onProceed
 */
function _proceedWithDirtyCheck(onProceed) {
  if (!isDirty()) {
    onProceed();
    return;
  }
  showDialog({
    title: "有未保存的修改",
    message: "当前简历有未保存的修改，导入新内容将覆盖。是否继续？",
    buttons: [
      { text: "取消" },
      { text: "继续导入", primary: true, action: onProceed },
    ],
  });
}

/**
 * Handle "粘贴 JSON" button — show dialog with textarea.
 */
function handlePasteJson() {
  _proceedWithDirtyCheck(() => {
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
    box.style.maxWidth = "600px";

    const titleEl = document.createElement("h3");
    titleEl.className = "dialog-title";
    titleEl.textContent = "粘贴 JSON";
    box.appendChild(titleEl);

    const msgEl = document.createElement("p");
    msgEl.className = "dialog-message";
    msgEl.textContent = "将简历 JSON 粘贴到下方文本框，支持带 ```json 代码块标记。";
    box.appendChild(msgEl);

    const textarea = document.createElement("textarea");
    textarea.className = "dialog-input";
    textarea.style.width = "100%";
    textarea.style.minHeight = "300px";
    textarea.style.fontFamily = "monospace";
    textarea.style.fontSize = "12px";
    textarea.placeholder = "在此粘贴 JSON...";
    box.appendChild(textarea);

    const exampleLink = document.createElement("a");
    exampleLink.textContent = "填入示例 JSON";
    exampleLink.href = "#";
    exampleLink.style.display = "block";
    exampleLink.style.marginTop = "6px";
    exampleLink.style.fontSize = "12px";
    exampleLink.addEventListener("click", (e) => {
      e.preventDefault();
      textarea.value = JSON_EXAMPLE;
    });
    box.appendChild(exampleLink);

    const actions = document.createElement("div");
    actions.className = "dialog-actions";

    const clearBtn = document.createElement("button");
    clearBtn.className = "dialog-btn";
    clearBtn.textContent = "清空";
    clearBtn.addEventListener("click", () => {
      textarea.value = "";
    });
    actions.appendChild(clearBtn);

    const cancelBtn = document.createElement("button");
    cancelBtn.className = "dialog-btn";
    cancelBtn.textContent = "取消";
    cancelBtn.addEventListener("click", closeDialog);
    actions.appendChild(cancelBtn);

    const importBtn = document.createElement("button");
    importBtn.className = "dialog-btn dialog-btn-primary";
    importBtn.textContent = "导入";
    importBtn.addEventListener("click", () => {
      const raw = textarea.value.trim();
      if (!raw) {
        showToast("请先粘贴 JSON 内容。", "warning");
        return;
      }
      const result = importJsonResume(raw, "粘贴的 JSON");
      closeDialog();
      handleJsonImportResult(result, "粘贴的 JSON", raw);
    });
    actions.appendChild(importBtn);

    box.appendChild(actions);
    root.appendChild(box);
    setTimeout(() => textarea.focus(), 50);
  });
}

/**
 * Handle .json file import.
 * @param {File} file
 * @param {HTMLInputElement} fileInput
 */
function handleImportJsonFile(file, fileInput) {
  _proceedWithDirtyCheck(() => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const raw = e.target.result;
      const result = importJsonResume(raw, file.name);
      handleJsonImportResult(result, file.name, raw);
    };
    reader.onerror = () => {
      showToast("文件读取失败，请重试。", "error");
    };
    reader.readAsText(file);
    if (fileInput) fileInput.value = "";
  });
}

/**
 * Copy AI conversion prompt to clipboard.
 */
function handleCopyAiPrompt() {
  // Deprecated — replaced by handleCopyPrompt
}

function handleCopyPrompt(promptText, toastMessage) {
  if (typeof navigator === "undefined" || !navigator.clipboard) {
    showToast("当前浏览器不支持自动复制，请手动复制。", "warning");
    return;
  }
  navigator.clipboard.writeText(promptText).then(() => {
    showToast(toastMessage, "success");
  }).catch(() => {
    showToast("复制失败，请手动复制。", "error");
  });
}

/**
 * Show JSON example dialog.
 */
function handleShowJsonExample() {
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
  box.style.maxWidth = "600px";

  const titleEl = document.createElement("h3");
  titleEl.className = "dialog-title";
  titleEl.textContent = "JSON 示例";
  box.appendChild(titleEl);

  const pre = document.createElement("pre");
  pre.style.whiteSpace = "pre-wrap";
  pre.style.wordBreak = "break-all";
  pre.style.fontFamily = "monospace";
  pre.style.fontSize = "12px";
  pre.style.maxHeight = "400px";
  pre.style.overflow = "auto";
  pre.style.background = "var(--bg-secondary, #f5f5f5)";
  pre.style.padding = "8px";
  pre.style.borderRadius = "4px";
  pre.textContent = JSON_EXAMPLE;
  box.appendChild(pre);

  const actions = document.createElement("div");
  actions.className = "dialog-actions";

  const closeBtn = document.createElement("button");
  closeBtn.className = "dialog-btn";
  closeBtn.textContent = "关闭";
  closeBtn.addEventListener("click", closeDialog);
  actions.appendChild(closeBtn);

  const copyBtn = document.createElement("button");
  copyBtn.className = "dialog-btn dialog-btn-primary";
  copyBtn.textContent = "复制示例";
  copyBtn.addEventListener("click", () => {
    if (typeof navigator === "undefined" || !navigator.clipboard) {
      showToast("当前浏览器不支持自动复制。", "warning");
      return;
    }
    navigator.clipboard.writeText(JSON_EXAMPLE).then(() => {
      showToast("JSON 示例已复制。", "success");
      closeDialog();
    }).catch(() => {
      showToast("复制失败，请手动复制。", "error");
    });
  });
  actions.appendChild(copyBtn);

  box.appendChild(actions);
  root.appendChild(box);
}

/**
 * Handle JSON import result — success or failure.
 * @param {{ errors: object[], state: object|null }} result
 * @param {string} fileName
 * @param {string} [rawJson]
 */
function handleJsonImportResult(result, fileName, rawJson) {
  if (result.state) {
    setState(result.state);
    renderResume(result.state);
    updateA4Status();
    clearDirty();

    const infoMsg = result.errors.find((err) => err.level === "info");
    if (infoMsg) {
      showToast(infoMsg.message, "success");
    } else {
      showToast("已导入：" + fileName, "success");
    }
  } else {
    const errorMsgs = result.errors
      .filter((err) => err.level === "error")
      .map((err) => err.message);

    showDialog({
      title: "JSON 导入失败",
      message: errorMsgs.join("\n") || "无法解析该 JSON 文件。",
      buttons: [
        { text: "关闭" },
        {
          text: "复制修复 Prompt",
          primary: true,
          action: () => {
            const prompt = buildFixPrompt(result.errors, rawJson || "", !!rawJson);
            if (typeof navigator === "undefined" || !navigator.clipboard) {
              showToast("当前浏览器不支持自动复制。", "warning");
              return;
            }
            navigator.clipboard.writeText(prompt).then(() => {
              showToast("修复 Prompt 已复制到剪贴板。", "success");
            }).catch(() => {
              showToast("复制失败，请手动复制。", "error");
            });
          },
        },
      ],
    });
  }
}
