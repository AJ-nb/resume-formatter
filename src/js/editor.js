/**
 * Editor module.
 * Handles inline contenteditable editing, state sync, bullet/entry add/delete.
 */

let _dirty = false;
let _formatTarget = null;
let _formatRange = null;
let _formatOffsets = null;
let _formatBulletIds = [];
const _undoStack = [];
const UNDO_LIMIT = 100;
let _lastInputHistory = null;

function isDirty() { return _dirty; }

function markDirty() {
  _dirty = true;
  const btn = document.getElementById("btn-save");
  if (btn) btn.classList.add("toolbar-btn-dirty");
}

function clearDirty() {
  _dirty = false;
  const btn = document.getElementById("btn-save");
  if (btn) btn.classList.remove("toolbar-btn-dirty");
}

/**
 * Initialize editor: event delegation on #resume-content.
 */
function initEditor() {
  const content = document.getElementById("resume-content");
  if (!content) return;

  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "z" && !e.shiftKey) {
      if (e.target.matches("input, textarea, select") && !e.target.closest("#resume-content")) return;
      e.preventDefault();
      undoEditorChange();
    }
  }, true);

  content.addEventListener("beforeinput", (e) => {
    if (!e.target.closest("[contenteditable]") || e.inputType === "historyUndo") return;
    const now = Date.now();
    const key = e.target.dataset.bulletId || e.target.dataset.profileField || e.target.dataset.entryField || "editor";
    const canMerge = _lastInputHistory && _lastInputHistory.key === key
      && _lastInputHistory.type === e.inputType && now - _lastInputHistory.time < 800;
    if (!canMerge) pushUndoState();
    _lastInputHistory = { key, type: e.inputType, time: now };
  });

  // Enter key: single-line fields blur; bullet Enter = new bullet below
  content.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    const el = e.target;
    if (el.classList.contains("bullet-item")) {
      e.preventDefault();
      addBulletAfter(el);
      return;
    }
    e.preventDefault();
    el.blur();
  });

  // Paste: plain text only
  content.addEventListener("paste", (e) => {
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData).getData("text/plain");
    document.execCommand("insertText", false, text);
  });

  // Sync on blur
  content.addEventListener("blur", (e) => {
    syncElementToState(e.target);
  }, true);

  // Keep state current while typing so selection formatting never uses stale text.
  content.addEventListener("input", (e) => {
    syncElementToState(e.target);
    markDirty();
  });

  content.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    if (btn.classList.contains("btn-del-bullet"))  { e.stopPropagation(); deleteBullet(btn.dataset.bulletId); }
    else if (btn.classList.contains("btn-add-bullet"))  { e.stopPropagation(); addBullet(btn.dataset.entryId); }
    else if (btn.classList.contains("btn-del-entry"))   { e.stopPropagation(); deleteEntry(btn.dataset.entryId); }
    else if (btn.classList.contains("btn-add-entry"))   { e.stopPropagation(); addEntry(btn.dataset.sectionId); }
  });

  initSpacingHandles();
  initHeaderPositionDrag();
  initSelectionFormatting();
}

function initSelectionFormatting() {
  const buttons = {
    bold: document.getElementById("btn-selection-bold"),
    italic: document.getElementById("btn-selection-italic"),
    smaller: document.getElementById("btn-selection-smaller"),
    larger: document.getElementById("btn-selection-larger"),
    reset: document.getElementById("btn-selection-reset"),
  };
  const bulletStyle = document.getElementById("selection-bullet-style");

  document.addEventListener("selectionchange", () => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    const node = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
      ? range.commonAncestorContainer
      : range.commonAncestorContainer.parentElement;
    const target = node && node.closest && node.closest("#resume-content [contenteditable]");
    const resume = document.getElementById("resume-content");
    if (!resume || !resume.contains(range.commonAncestorContainer)) return;
    const selectedBullets = Array.from(resume.querySelectorAll(".bullet-item[data-bullet-id]"))
      .filter((item) => range.intersectsNode(item));
    _formatBulletIds = selectedBullets.map((item) => item.dataset.bulletId);
    if (bulletStyle) {
      bulletStyle.disabled = _formatBulletIds.length === 0;
      updateBulletStyleControl(bulletStyle);
    }
    if (!target || !target.contains(range.startContainer) || !target.contains(range.endContainer)) return;
    _formatTarget = target;
    _formatRange = range.cloneRange();
    _formatOffsets = getSelectionOffsets(target, range);
    Object.values(buttons).forEach((button) => { if (button) button.disabled = false; });
    updateBoldButtonState(buttons.bold);
    updateItalicButtonState(buttons.italic);
  });

  Object.values(buttons).forEach((button) => {
    if (button) button.addEventListener("mousedown", (event) => event.preventDefault());
  });
  if (buttons.bold) buttons.bold.addEventListener("click", () => applySelectionFormat("bold"));
  if (buttons.italic) buttons.italic.addEventListener("click", () => applySelectionFormat("italic"));
  if (buttons.smaller) buttons.smaller.addEventListener("click", () => applySelectionFormat("size", -0.5));
  if (buttons.larger) buttons.larger.addEventListener("click", () => applySelectionFormat("size", 0.5));
  if (buttons.reset) buttons.reset.addEventListener("click", () => applySelectionFormat("reset"));
  if (bulletStyle) bulletStyle.addEventListener("change", () => applyBulletStyle(bulletStyle.value));
}

function applyBulletStyle(markerStyle) {
  if (_formatBulletIds.length === 0) return;
  pushUndoState();
  _formatBulletIds.forEach((id) => {
    const bullet = findBulletById(id);
    const element = document.querySelector(`.bullet-item[data-bullet-id="${CSS.escape(id)}"]`);
    if (!bullet || !element) return;
    if (markerStyle === "default") delete bullet.markerStyle;
    else bullet.markerStyle = markerStyle;
    if (markerStyle === "default") delete element.dataset.bulletMarker;
    else element.dataset.bulletMarker = markerStyle;
  });
  markDirty();
  requestAnimationFrame(() => updateA4Status());
}

function updateBulletStyleControl(control) {
  const styles = _formatBulletIds.map((id) => findBulletById(id)?.markerStyle || "default");
  control.value = styles.length > 0 && styles.every((style) => style === styles[0]) ? styles[0] : "default";
}

function pushUndoState() {
  _undoStack.push(deepClone(getState()));
  if (_undoStack.length > UNDO_LIMIT) _undoStack.shift();
}

function undoEditorChange() {
  const previous = _undoStack.pop();
  if (!previous) {
    showToast("没有可撤回的操作。", "info");
    return;
  }
  setState(previous);
  renderResume(previous);
  markDirty();
  _formatTarget = null;
  _formatRange = null;
  _formatOffsets = null;
  _formatBulletIds = [];
  _lastInputHistory = null;
  requestAnimationFrame(() => updateA4Status());
}

function applySelectionFormat(action, amount = 0) {
  const target = _formatTarget;
  if (!target || !document.contains(target)) return;
  syncElementToState(target);
  pushUndoState();

  if (target.dataset.bulletId) {
    const bullet = findBulletById(target.dataset.bulletId);
    if (!bullet) return;
    const offsets = _formatOffsets || getSelectionOffsets(target, _formatRange);
    const start = offsets && offsets.start !== offsets.end ? offsets.start : 0;
    const end = offsets && offsets.start !== offsets.end ? offsets.end : target.textContent.length;
    const selected = splitTokensForRange(bullet.content, start, end);

    if (action === "bold") {
      const shouldUnbold = selected.some((part) => part.selected)
        && selected.filter((part) => part.selected).every((part) => part.token.type === "strong");
      selected.forEach((part) => {
        if (part.selected) part.token.type = shouldUnbold ? "text" : "strong";
      });
    } else if (action === "italic") {
      const shouldUnitalic = selected.some((part) => part.selected)
        && selected.filter((part) => part.selected).every((part) => part.token.italic);
      selected.forEach((part) => {
        if (part.selected) part.token.italic = !shouldUnitalic;
      });
    } else if (action === "size") {
      selected.forEach((part) => {
        if (part.selected) part.token.fontSizeDelta = clampFontDelta((part.token.fontSizeDelta || 0) + amount);
      });
    } else if (action === "reset") {
      selected.forEach((part) => {
        if (part.selected) delete part.token.fontSizeDelta;
      });
    }

    bullet.content = mergeInlineTokens(selected.map((part) => part.token));
    target.replaceChildren(renderInlineContent(bullet.content));
  } else {
    if (action === "bold" || action === "italic") {
      showToast("加粗和斜体适用于正文要点；姓名、公司和岗位保持模板样式。", "info");
      return;
    }
    const key = getBlockFormatKey(target);
    if (!key) return;
    const state = getState();
    if (!state.layout) state.layout = {};
    if (!state.layout.blockFontSizeDelta) state.layout.blockFontSizeDelta = {};
    if (action === "reset") {
      delete state.layout.blockFontSizeDelta[key];
    } else {
      state.layout.blockFontSizeDelta[key] = clampFontDelta((state.layout.blockFontSizeDelta[key] || 0) + amount);
    }
    applyLocalFormatting(state);
  }

  markDirty();
  updateBoldButtonState(document.getElementById("btn-selection-bold"));
  updateItalicButtonState(document.getElementById("btn-selection-italic"));
  requestAnimationFrame(() => updateA4Status());
}

function getSelectionOffsets(target, range) {
  if (!range || !target.contains(range.startContainer) || !target.contains(range.endContainer)) return null;
  const beforeStart = document.createRange();
  beforeStart.selectNodeContents(target);
  beforeStart.setEnd(range.startContainer, range.startOffset);
  const beforeEnd = document.createRange();
  beforeEnd.selectNodeContents(target);
  beforeEnd.setEnd(range.endContainer, range.endOffset);
  return { start: beforeStart.toString().length, end: beforeEnd.toString().length };
}

function splitTokensForRange(tokens, start, end) {
  const result = [];
  let offset = 0;
  (tokens || []).forEach((token) => {
    const value = token.value || "";
    const tokenStart = offset;
    const tokenEnd = offset + value.length;
    const cuts = [0, Math.max(0, start - tokenStart), Math.min(value.length, end - tokenStart), value.length]
      .filter((cut, index, values) => cut >= 0 && cut <= value.length && values.indexOf(cut) === index)
      .sort((a, b) => a - b);
    for (let i = 0; i < cuts.length - 1; i++) {
      const from = cuts[i];
      const to = cuts[i + 1];
      if (from === to) continue;
      result.push({
        token: { ...token, value: value.slice(from, to) },
        selected: tokenStart + from < end && tokenStart + to > start,
      });
    }
    offset = tokenEnd;
  });
  return result;
}

function mergeInlineTokens(tokens) {
  return tokens.reduce((merged, token) => {
    if (!token.value) return merged;
    const previous = merged[merged.length - 1];
    if (previous && previous.type === token.type && !!previous.italic === !!token.italic
      && (previous.fontSizeDelta || 0) === (token.fontSizeDelta || 0)) {
      previous.value += token.value;
    } else {
      merged.push({ ...token });
    }
    return merged;
  }, []);
}

function clampFontDelta(value) {
  return Math.max(-2, Math.min(3, Math.round(value * 2) / 2));
}

function findBulletById(bulletId) {
  for (const section of getState().sections) {
    for (const entry of section.entries) {
      const bullet = entry.bullets.find((item) => item.id === bulletId);
      if (bullet) return bullet;
    }
  }
  return null;
}

function getBlockFormatKey(target) {
  if (target.dataset.profileField) return `profile:${target.dataset.profileField}`;
  if (target.dataset.entryField) {
    const entry = target.closest("[data-entry-id]");
    return entry ? `entry:${entry.dataset.entryId}:${target.dataset.entryField}` : null;
  }
  return null;
}

function applyLocalFormatting(state) {
  document.querySelectorAll("#resume-content [data-profile-field], #resume-content [data-entry-field]").forEach((element) => {
    element.style.removeProperty("font-size");
  });
  const overrides = state.layout && state.layout.blockFontSizeDelta;
  if (!overrides) return;
  Object.entries(overrides).forEach(([key, delta]) => {
    const [kind, id, field] = key.split(":");
    const selector = kind === "profile"
      ? `[data-profile-field="${CSS.escape(id)}"]`
      : `[data-entry-id="${CSS.escape(id)}"] [data-entry-field="${CSS.escape(field)}"]`;
    document.querySelectorAll(`#resume-content ${selector}`).forEach((element) => {
      element.style.fontSize = `calc(1em + ${delta}pt)`;
    });
  });
}

/** ========================
 *  Header position handle
 *  ======================== */

const HEADER_OFFSET_MIN_MM = -8;
const HEADER_OFFSET_MAX_MM = 8;
const HEADER_OFFSET_STEP_MM = 0.5;

function normalizeHeaderOffset(value) {
  const numeric = Number(value) || 0;
  const snapped = Math.round(numeric / HEADER_OFFSET_STEP_MM) * HEADER_OFFSET_STEP_MM;
  return Math.max(HEADER_OFFSET_MIN_MM, Math.min(HEADER_OFFSET_MAX_MM, snapped));
}

function setHeaderOffsetPreview(offsetMm) {
  const header = document.getElementById("header-info");
  const handle = document.getElementById("header-position-handle");
  const value = handle && handle.querySelector(".header-position-value");
  if (header) header.style.setProperty("--header-offset-y", `${offsetMm}mm`);
  if (value) value.textContent = `${offsetMm.toFixed(1)} mm`;
  if (handle) {
    handle.setAttribute("aria-valuenow", String(offsetMm));
    handle.setAttribute("aria-valuetext", offsetMm === 0 ? "居中" : `${Math.abs(offsetMm).toFixed(1)} 毫米${offsetMm < 0 ? "向上" : "向下"}`);
  }
}

function applyHeaderPosition(state) {
  const offset = normalizeHeaderOffset(state.layout && state.layout.headerOffsetY);
  setHeaderOffsetPreview(offset);
}

function commitHeaderOffset(offsetMm) {
  const state = getState();
  if (!state.layout) state.layout = {};
  state.layout.headerOffsetY = normalizeHeaderOffset(offsetMm);
  setHeaderOffsetPreview(state.layout.headerOffsetY);
  markDirty();
}

function initHeaderPositionDrag() {
  const handle = document.getElementById("header-position-handle");
  if (!handle) return;

  handle.setAttribute("role", "slider");
  handle.setAttribute("aria-valuemin", String(HEADER_OFFSET_MIN_MM));
  handle.setAttribute("aria-valuemax", String(HEADER_OFFSET_MAX_MM));
  handle.setAttribute("aria-orientation", "vertical");
  applyHeaderPosition(getState());

  let dragging = false;
  let changed = false;
  let startY = 0;
  let startOffset = 0;
  let pxPerMm = getPxPerMm();

  handle.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    dragging = true;
    changed = false;
    startY = event.clientY;
    startOffset = normalizeHeaderOffset(getState().layout && getState().layout.headerOffsetY);
    pxPerMm = getPxPerMm();
    handle.classList.add("dragging");
    const header = document.getElementById("header-info");
    if (header) header.classList.add("header-dragging");
    handle.setPointerCapture(event.pointerId);
  });

  handle.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    const nextOffset = normalizeHeaderOffset(startOffset + (event.clientY - startY) / pxPerMm);
    if (!changed && nextOffset !== startOffset) {
      pushUndoState();
      changed = true;
    }
    setHeaderOffsetPreview(nextOffset);
  });

  handle.addEventListener("pointerup", (event) => {
    if (!dragging) return;
    const nextOffset = normalizeHeaderOffset(startOffset + (event.clientY - startY) / pxPerMm);
    if (changed) commitHeaderOffset(nextOffset);
    else setHeaderOffsetPreview(startOffset);
    dragging = false;
    handle.classList.remove("dragging");
    const header = document.getElementById("header-info");
    if (header) header.classList.remove("header-dragging");
  });

  handle.addEventListener("pointercancel", () => {
    if (!dragging) return;
    setHeaderOffsetPreview(startOffset);
    dragging = false;
    handle.classList.remove("dragging");
    const header = document.getElementById("header-info");
    if (header) header.classList.remove("header-dragging");
  });

  handle.addEventListener("dblclick", (event) => {
    event.preventDefault();
    const current = normalizeHeaderOffset(getState().layout && getState().layout.headerOffsetY);
    if (current === 0) return;
    pushUndoState();
    commitHeaderOffset(0);
  });

  handle.addEventListener("keydown", (event) => {
    if (!["ArrowUp", "ArrowDown", "Home"].includes(event.key)) return;
    event.preventDefault();
    const current = normalizeHeaderOffset(getState().layout && getState().layout.headerOffsetY);
    const amount = event.shiftKey ? 1 : HEADER_OFFSET_STEP_MM;
    const next = event.key === "Home" ? 0 : current + (event.key === "ArrowUp" ? -amount : amount);
    if (normalizeHeaderOffset(next) === current) return;
    pushUndoState();
    commitHeaderOffset(next);
  });
}

function updateBoldButtonState(button) {
  if (!button || !_formatTarget || !_formatTarget.dataset.bulletId) {
    if (button) button.classList.remove("toolbar-btn-active");
    return;
  }
  const bullet = findBulletById(_formatTarget.dataset.bulletId);
  const offsets = _formatOffsets || getSelectionOffsets(_formatTarget, _formatRange);
  if (!bullet || !offsets || offsets.start === offsets.end) {
    button.classList.remove("toolbar-btn-active");
    return;
  }
  const parts = splitTokensForRange(bullet.content, offsets.start, offsets.end).filter((part) => part.selected);
  button.classList.toggle("toolbar-btn-active", parts.length > 0 && parts.every((part) => part.token.type === "strong"));
}

function updateItalicButtonState(button) {
  if (!button || !_formatTarget || !_formatTarget.dataset.bulletId) {
    if (button) button.classList.remove("toolbar-btn-active");
    return;
  }
  const bullet = findBulletById(_formatTarget.dataset.bulletId);
  const offsets = _formatOffsets || getSelectionOffsets(_formatTarget, _formatRange);
  if (!bullet || !offsets || offsets.start === offsets.end) {
    button.classList.remove("toolbar-btn-active");
    return;
  }
  const parts = splitTokensForRange(bullet.content, offsets.start, offsets.end).filter((part) => part.selected);
  button.classList.toggle("toolbar-btn-active", parts.length > 0 && parts.every((part) => part.token.italic));
}

/** ========================
 *  Bullet operations
 *  ======================== */

/**
 * Add a new empty bullet after the currently focused bullet-item span.
 * @param {HTMLElement} bulletSpan
 */
function addBulletAfter(bulletSpan) {
  const bulletId = bulletSpan.dataset.bulletId;
  const state = getState();

  for (const section of state.sections) {
    for (const entry of section.entries) {
      const idx = entry.bullets.findIndex(b => b.id === bulletId);
      if (idx === -1) continue;

      const newBullet = { id: generateId(), content: [{ type: "text", value: "" }] };
      pushUndoState();
      entry.bullets.splice(idx + 1, 0, newBullet);

      // Re-render the bullets list
      const listEl = document.querySelector(
        `[data-entry-id="${entry.id}"].entry-bullets, [data-entry-id="${entry.id}"].skills-list`
      );
      if (listEl) {
        listEl.innerHTML = "";
        for (const b of entry.bullets) listEl.appendChild(renderBulletRow(b));
        // Focus new bullet
        const newSpan = listEl.querySelector(`[data-bullet-id="${newBullet.id}"]`);
        if (newSpan) newSpan.focus();
      }

      markDirty();
      requestAnimationFrame(() => updateAddGutter(state));
      return;
    }
  }
}

/**
 * Add a new empty bullet at the end of an entry.
 * @param {string} entryId
 */
function addBullet(entryId) {
  const state = getState();
  for (const section of state.sections) {
    for (const entry of section.entries) {
      if (entry.id !== entryId) continue;

      const newBullet = { id: generateId(), content: [{ type: "text", value: "" }] };
      pushUndoState();
      entry.bullets.push(newBullet);

      const listEl = document.querySelector(
        `ul[data-entry-id="${entryId}"]`
      );
      if (listEl) {
        // Insert before the add-row
        const addRow = listEl.querySelector(".bullet-add-row");
        const newLi = renderBulletRow(newBullet);
        listEl.insertBefore(newLi, addRow);
        const newSpan = newLi.querySelector(`[data-bullet-id="${newBullet.id}"]`);
        if (newSpan) newSpan.focus();
      }

      markDirty();
      requestAnimationFrame(() => updateAddGutter(state));
      return;
    }
  }
}

/**
 * Delete a bullet by ID.
 * @param {string} bulletId
 */
function deleteBullet(bulletId) {
  const state = getState();
  for (const section of state.sections) {
    for (const entry of section.entries) {
      const idx = entry.bullets.findIndex(b => b.id === bulletId);
      if (idx === -1) continue;
      pushUndoState();
      entry.bullets.splice(idx, 1);
      const li = document.querySelector(`li[data-bullet-id="${bulletId}"]`);
      if (li) li.remove();
      markDirty();
      requestAnimationFrame(() => updateAddGutter(state));
      return;
    }
  }
}

/** ========================
 *  Entry operations
 *  ======================== */

/**
 * Add a new empty entry to a section.
 * @param {string} sectionId
 */
function addEntry(sectionId) {
  const state = getState();
  const section = state.sections.find(s => s.id === sectionId);
  if (!section) return;
  pushUndoState();

  const newEntry = {
    id: generateId(),
    name: "",
    role: "",
    date: "",
    location: "",
    bullets: [{ id: generateId(), content: [{ type: "text", value: "" }] }],
  };
  section.entries.push(newEntry);

  const sectionEl = document.querySelector(`section[data-section-id="${sectionId}"]`);
  if (sectionEl) {
    const addRow = sectionEl.querySelector(".entry-add-row");
    sectionEl.insertBefore(renderEntry(newEntry), addRow);
    // Focus name field
    const nameSpan = sectionEl.querySelector(`[data-entry-id="${newEntry.id}"] .entry-name`);
    if (nameSpan) nameSpan.focus();
  }

  markDirty();
  requestAnimationFrame(() => updateAddGutter(state));
}

/**
 * Delete an entry by ID (with confirmation).
 * @param {string} entryId
 */
function deleteEntry(entryId) {
  const state = getState();
  for (const section of state.sections) {
    const idx = section.entries.findIndex(e => e.id === entryId);
    if (idx === -1) continue;
    const entryName = section.entries[idx].name || "该条目";

    showDialog({
      title: "删除条目",
      message: `确定要删除"${entryName}"吗？`,
      buttons: [
        { text: "取消" },
        {
          text: "删除",
          primary: false,
          action: () => {
            pushUndoState();
            section.entries.splice(idx, 1);
            const el = document.querySelector(`[data-entry-id="${entryId}"].resume-entry`);
            if (el) el.remove();
            markDirty();
            requestAnimationFrame(() => updateAddGutter(state));
          },
        },
      ],
    });
    return;
  }
}

/** ========================
 *  State sync
 *  ======================== */

/**
 * Sync a single edited DOM element back to Resume State.
 * @param {HTMLElement} el
 */
function syncElementToState(el) {
  const state = getState();
  if (!state) return;

  const raw = el.textContent.trim();

  // Profile field
  if (el.dataset.profileField) {
    const field = el.dataset.profileField;
    if (field === "headline") {
      state.profile.headline = raw;
    } else if (field === "phone") {
      state.profile.phone = raw.replace(/^联系电话：/, "").trim();
    } else if (field === "email") {
      state.profile.email = raw.replace(/^电子邮箱：/, "").trim();
    } else if (field in state.profile) {
      state.profile[field] = raw;
    }
    return;
  }

  // Entry field
  if (el.dataset.entryField) {
    const field = el.dataset.entryField;
    const entryEl = el.closest("[data-entry-id]");
    if (!entryEl) return;
    const entryId = entryEl.dataset.entryId;
    for (const section of state.sections) {
      for (const entry of section.entries) {
        if (entry.id === entryId) {
          entry[field === "date" ? "date" : field] = raw;
          return;
        }
      }
    }
    return;
  }

  // Bullet content
  if (el.dataset.bulletId) {
    const bulletId = el.dataset.bulletId;
    for (const section of state.sections) {
      for (const entry of section.entries) {
        for (const bullet of entry.bullets) {
          if (bullet.id === bulletId) {
            bullet.content = tokensFromEditableElement(el);
            if (typeof updateBulletSemanticClass === "function") {
              updateBulletSemanticClass(el, bullet.content);
            }
            return;
          }
        }
      }
    }
  }
}

function tokensFromEditableElement(element) {
  const tokens = [];
  const walk = (node, strong = false, italic = false, inheritedDelta = 0) => {
    if (node.nodeType === Node.TEXT_NODE) {
      if (!node.nodeValue) return;
      tokens.push({
        type: strong ? "strong" : "text",
        value: node.nodeValue,
        ...(italic ? { italic: true } : {}),
        ...(inheritedDelta ? { fontSizeDelta: inheritedDelta } : {}),
      });
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const nextStrong = strong || node.tagName === "STRONG" || node.tagName === "B";
    const nextItalic = italic || node.tagName === "EM" || node.tagName === "I";
    const nextDelta = Number(node.dataset.fontSizeDelta || inheritedDelta || 0);
    node.childNodes.forEach((child) => walk(child, nextStrong, nextItalic, nextDelta));
  };
  element.childNodes.forEach((node) => walk(node));
  return mergeInlineTokens(tokens);
}

/** ========================
 *  Section spacing handles
 *  ======================== */

const SNAP_GRID_MM   = 0.5;
const SNAP_RADIUS_PX = 6;
const SPACING_MIN_MM = -100;
const SPACING_MAX_MM = 100;
const SPACING_DEFAULT_MM = 0;

function getPxPerMm() {
  const ruler = document.createElement("div");
  ruler.style.cssText = "position:fixed;top:0;left:-999px;width:10mm;height:1px;visibility:hidden;pointer-events:none;";
  document.body.appendChild(ruler);
  const px = ruler.offsetWidth / 10;
  ruler.remove();
  return px;
}

function collectSnapTargets() {
  const state = getState();
  const values = state.sections.map(s => s.spacingBefore !== undefined ? s.spacingBefore : SPACING_DEFAULT_MM);
  const grid = [0, 0.5, 1, 1.5, 2, 2.5, 3, 4, 5];
  return [...new Set([...values, ...grid])].sort((a, b) => a - b);
}

function snapMm(rawMm, targets, pxPerMm) {
  let snapped = Math.round(rawMm / SNAP_GRID_MM) * SNAP_GRID_MM;
  snapped = Math.max(SPACING_MIN_MM, Math.min(SPACING_MAX_MM, snapped));
  const snapRadiusMm = SNAP_RADIUS_PX / pxPerMm;
  let nearestTarget = null;
  let nearestDistance = Infinity;
  for (const target of targets) {
    const distance = Math.abs(rawMm - target);
    if (distance < nearestDistance) {
      nearestTarget = target;
      nearestDistance = distance;
    }
  }
  return nearestDistance <= snapRadiusMm ? nearestTarget : snapped;
}

function updateSpacingHandleVisual(handle, spacingMm) {
  if (!handle) return;
  handle.style.setProperty("--spacing-size", `${spacingMm}mm`);
  handle.setAttribute("aria-valuenow", String(spacingMm));
  handle.setAttribute("aria-valuetext", `${spacingMm.toFixed(1)} 毫米`);
  const tip = handle.querySelector(".spacing-tooltip");
  if (tip) tip.textContent = `${spacingMm.toFixed(1)} mm`;
  const dragHandle = document.querySelector(`.section-drag-handle[data-section-id="${CSS.escape(handle.dataset.sectionId)}"]`);
  if (dragHandle) {
    dragHandle.setAttribute("aria-valuenow", String(spacingMm));
    dragHandle.setAttribute("aria-valuetext", `${spacingMm.toFixed(1)} 毫米`);
  }
}

function setSectionSpacing(sectionId, spacingMm, markAsDirty = true) {
  const state = getState();
  const section = state.sections.find((item) => item.id === sectionId);
  const sectionEl = document.querySelector(`section[data-section-id="${CSS.escape(sectionId)}"]`);
  const handle = document.querySelector(`.spacing-handle[data-section-id="${CSS.escape(sectionId)}"]`);
  if (!section) return;
  section.spacingBefore = spacingMm;
  if (sectionEl) sectionEl.style.marginTop = `${spacingMm}mm`;
  updateSpacingHandleVisual(handle, spacingMm);
  if (markAsDirty) {
    markDirty();
    updateA4Status();
  }
}

function initSpacingHandles() {
  const container = document.getElementById("resume-sections");
  if (!container) return;

  let dragging = false, changed = false, startY = 0, startMm = SPACING_DEFAULT_MM;
  let activeSectionId = null, activeHandle = null, activeSectionEl = null;
  let pxPerMm = getPxPerMm();

  container.addEventListener("pointerdown", (e) => {
    const dragHandle = e.target.closest(".section-drag-handle");
    if (!dragHandle || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    dragging = true;
    changed = false;
    startY = e.clientY;
    activeSectionId = dragHandle.dataset.sectionId;
    activeHandle = container.querySelector(`.spacing-handle[data-section-id="${CSS.escape(activeSectionId)}"]`);
    activeSectionEl = container.querySelector(`section[data-section-id="${CSS.escape(activeSectionId)}"]`);
    pxPerMm = getPxPerMm();
    const state = getState();
    const section = state.sections.find(s => s.id === activeSectionId);
    startMm = (section && section.spacingBefore !== undefined) ? section.spacingBefore : SPACING_DEFAULT_MM;
    if (activeHandle) activeHandle.classList.add("dragging");
    if (activeSectionEl) activeSectionEl.classList.add("section-dragging");
    dragHandle.setPointerCapture(e.pointerId);
  });

  container.addEventListener("pointermove", (e) => {
    if (!dragging || !activeSectionId) return;
    const rawMm = startMm + (e.clientY - startY) / pxPerMm;
    const snapped = snapMm(rawMm, collectSnapTargets(), pxPerMm);
    if (!changed && snapped !== startMm) {
      pushUndoState();
      changed = true;
    }
    const sectionEl = container.querySelector(`section[data-section-id="${activeSectionId}"]`);
    if (sectionEl) sectionEl.style.marginTop = snapped + "mm";
    updateSpacingHandleVisual(activeHandle, snapped);
    if (activeHandle) {
      const isSnapped = collectSnapTargets().some(t => t !== startMm && Math.abs(snapped - t) < 0.01);
      activeHandle.classList.toggle("snapped", isSnapped);
    }
  });

  container.addEventListener("pointerup", (e) => {
    if (!dragging || !activeSectionId) return;
    const rawMm = startMm + (e.clientY - startY) / pxPerMm;
    const snapped = snapMm(rawMm, collectSnapTargets(), pxPerMm);
    if (changed) setSectionSpacing(activeSectionId, snapped, false);
    else updateSpacingHandleVisual(activeHandle, startMm);
    if (activeHandle) activeHandle.classList.remove("dragging", "snapped");
    if (activeSectionEl) activeSectionEl.classList.remove("section-dragging");
    dragging = false; activeSectionId = null; activeHandle = null; activeSectionEl = null;
    if (changed) {
      markDirty();
      updateA4Status();
    }
  });

  container.addEventListener("pointercancel", () => {
    if (!dragging || !activeSectionId) return;
    const sectionEl = container.querySelector(`section[data-section-id="${activeSectionId}"]`);
    if (sectionEl) sectionEl.style.marginTop = startMm + "mm";
    updateSpacingHandleVisual(activeHandle, startMm);
    if (activeHandle) activeHandle.classList.remove("dragging", "snapped");
    if (activeSectionEl) activeSectionEl.classList.remove("section-dragging");
    dragging = false; activeSectionId = null; activeHandle = null; activeSectionEl = null;
  });

  container.addEventListener("dblclick", (e) => {
    const dragHandle = e.target.closest(".section-drag-handle");
    if (!dragHandle) return;
    e.preventDefault();
    const section = getState().sections.find((item) => item.id === dragHandle.dataset.sectionId);
    const current = section && section.spacingBefore !== undefined ? section.spacingBefore : SPACING_DEFAULT_MM;
    if (current === SPACING_DEFAULT_MM) return;
    pushUndoState();
    setSectionSpacing(dragHandle.dataset.sectionId, SPACING_DEFAULT_MM);
  });

  container.addEventListener("keydown", (e) => {
    const dragHandle = e.target.closest(".section-drag-handle");
    if (!dragHandle || !["ArrowUp", "ArrowDown", "Home"].includes(e.key)) return;
    e.preventDefault();
    const section = getState().sections.find((item) => item.id === dragHandle.dataset.sectionId);
    const current = section && section.spacingBefore !== undefined ? section.spacingBefore : SPACING_DEFAULT_MM;
    const amount = e.shiftKey ? 1 : SNAP_GRID_MM;
    const raw = e.key === "Home" ? SPACING_DEFAULT_MM : current + (e.key === "ArrowUp" ? -amount : amount);
    const next = snapMm(raw, [], getPxPerMm());
    if (next === current) return;
    pushUndoState();
    setSectionSpacing(dragHandle.dataset.sectionId, next);
  });
}
