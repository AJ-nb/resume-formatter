/**
 * Editor module.
 * Handles inline contenteditable editing, state sync, bullet/entry add/delete.
 */

let _dirty = false;

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

  // Mark dirty on input
  content.addEventListener("input", () => markDirty());

  content.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    if (btn.classList.contains("btn-del-bullet"))  { e.stopPropagation(); deleteBullet(btn.dataset.bulletId); }
    else if (btn.classList.contains("btn-add-bullet"))  { e.stopPropagation(); addBullet(btn.dataset.entryId); }
    else if (btn.classList.contains("btn-del-entry"))   { e.stopPropagation(); deleteEntry(btn.dataset.entryId); }
    else if (btn.classList.contains("btn-add-entry"))   { e.stopPropagation(); addEntry(btn.dataset.sectionId); }
  });

  initSpacingHandles();
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
      entry.bullets.splice(idx + 1, 0, newBullet);

      // Re-render the bullets list
      const listEl = document.querySelector(
        `[data-entry-id="${entry.id}"].entry-bullets, [data-entry-id="${entry.id}"].skills-list`
      );
      if (listEl) {
        listEl.innerHTML = "";
        for (const b of entry.bullets) listEl.appendChild(renderBulletRow(b));
        listEl.appendChild(renderAddBulletRow(entry.id));
        // Focus new bullet
        const newSpan = listEl.querySelector(`[data-bullet-id="${newBullet.id}"]`);
        if (newSpan) newSpan.focus();
      }

      markDirty();
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
      entry.bullets.splice(idx, 1);
      const li = document.querySelector(`li[data-bullet-id="${bulletId}"]`);
      if (li) li.remove();
      markDirty();
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
            section.entries.splice(idx, 1);
            const el = document.querySelector(`[data-entry-id="${entryId}"].resume-entry`);
            if (el) el.remove();
            markDirty();
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
            bullet.content = [{ type: "text", value: raw }];
            return;
          }
        }
      }
    }
  }
}

/** ========================
 *  Section spacing handles
 *  ======================== */

const SNAP_GRID_MM   = 0.5;
const SNAP_RADIUS_PX = 6;
const SPACING_MIN_MM = 0;
const SPACING_MAX_MM = 20;

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
  const values = state.sections.map(s => s.spacingBefore !== undefined ? s.spacingBefore : 2);
  const grid = [0, 0.5, 1, 1.5, 2, 2.5, 3, 4, 5];
  return [...new Set([...values, ...grid])].sort((a, b) => a - b);
}

function snapMm(rawMm, targets, pxPerMm) {
  let snapped = Math.round(rawMm / SNAP_GRID_MM) * SNAP_GRID_MM;
  snapped = Math.max(SPACING_MIN_MM, Math.min(SPACING_MAX_MM, snapped));
  const snapRadiusMm = SNAP_RADIUS_PX / pxPerMm;
  for (const target of targets) {
    if (Math.abs(rawMm - target) <= snapRadiusMm) return target;
  }
  return snapped;
}

function initSpacingHandles() {
  const container = document.getElementById("resume-sections");
  if (!container) return;

  let dragging = false, startY = 0, startMm = 2, activeSectionId = null, activeHandle = null, pxPerMm = getPxPerMm();

  container.addEventListener("pointerdown", (e) => {
    const handle = e.target.closest(".spacing-handle");
    if (!handle) return;
    e.preventDefault();
    e.stopPropagation();
    dragging = true;
    startY = e.clientY;
    activeSectionId = handle.dataset.sectionId;
    activeHandle = handle;
    pxPerMm = getPxPerMm();
    const state = getState();
    const section = state.sections.find(s => s.id === activeSectionId);
    startMm = (section && section.spacingBefore !== undefined) ? section.spacingBefore : 2;
    handle.classList.add("dragging");
    handle.setPointerCapture(e.pointerId);
  });

  container.addEventListener("pointermove", (e) => {
    if (!dragging || !activeSectionId) return;
    const rawMm = startMm + (e.clientY - startY) / pxPerMm;
    const snapped = snapMm(rawMm, collectSnapTargets(), pxPerMm);
    const sectionEl = container.querySelector(`section[data-section-id="${activeSectionId}"]`);
    if (sectionEl) sectionEl.style.marginTop = snapped + "mm";
    const tip = activeHandle && activeHandle.querySelector(".spacing-tooltip");
    if (tip) tip.textContent = snapped.toFixed(1) + " mm";
    if (activeHandle) {
      const isSnapped = collectSnapTargets().some(t => t !== startMm && Math.abs(snapped - t) < 0.01);
      activeHandle.classList.toggle("snapped", isSnapped);
    }
  });

  container.addEventListener("pointerup", (e) => {
    if (!dragging || !activeSectionId) return;
    const rawMm = startMm + (e.clientY - startY) / pxPerMm;
    const snapped = snapMm(rawMm, collectSnapTargets(), pxPerMm);
    const state = getState();
    const section = state.sections.find(s => s.id === activeSectionId);
    if (section) section.spacingBefore = snapped;
    if (activeHandle) activeHandle.classList.remove("dragging", "snapped");
    dragging = false; activeSectionId = null; activeHandle = null;
    markDirty();
    updateA4Status();
  });
}
