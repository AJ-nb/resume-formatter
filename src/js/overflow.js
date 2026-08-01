/**
 * A4 Overflow Detection module.
 * Detects whether resume content exceeds single A4 page.
 */

const OVERFLOW_TOLERANCE_PX = 2;

/**
 * Measure 297mm in pixels at current zoom/DPI by injecting a temporary ruler.
 * @returns {number}
 */
function getA4HeightPx() {
  const ruler = document.createElement("div");
  ruler.style.cssText =
    "position:fixed;top:0;left:-9999px;width:1px;height:297mm;" +
    "visibility:hidden;pointer-events:none;";
  document.body.appendChild(ruler);
  const h = ruler.offsetHeight;
  ruler.remove();
  return h;
}

/**
 * Check if resume content overflows the A4 page.
 * @returns {{ overflow: boolean, pxBeyond: number, mmBeyond: number, firstOverflowSection: string|null }}
 */
function checkOverflow() {
  const contentEl = document.getElementById("resume-content");
  if (!contentEl) return { overflow: false, pxBeyond: 0, mmBeyond: 0, firstOverflowSection: null };

  const a4Px      = getA4HeightPx();
  const contentPx = contentEl.offsetHeight;
  const overflowPx = Math.max(0, contentPx - a4Px);
  const overflow   = overflowPx > OVERFLOW_TOLERANCE_PX;

  let firstOverflowSection = null;

  if (overflow) {
    // Find first section that extends below the A4 boundary
    const pageRect  = contentEl.getBoundingClientRect();
    const a4Bottom  = pageRect.top + a4Px;

    const sections = contentEl.querySelectorAll(".resume-section");
    for (const section of sections) {
      const rect = section.getBoundingClientRect();
      if (rect.bottom > a4Bottom + OVERFLOW_TOLERANCE_PX) {
        firstOverflowSection =
          section.dataset.sectionType ||
          section.querySelector(".section-title")?.textContent ||
          null;
        break;
      }
    }
  }

  return { overflow, pxBeyond: overflowPx, mmBeyond: pxToMm(overflowPx), firstOverflowSection };
}

/**
 * Update A4 status display and fix button label.
 */
function updateA4Status() {
  const statusEl  = document.getElementById("a4-status");
  const btnLabel  = document.getElementById("btn-fix-label");
  const fixBtn    = document.getElementById("btn-fix-overflow");
  const result    = checkOverflow();

  if (result.overflow) {
    const msg = `⚠️ 超出 A4 约 ${result.mmBeyond.toFixed(1)} mm`;
    if (statusEl)  { statusEl.textContent = msg; statusEl.style.color = "#dc2626"; }
    if (btnLabel)  btnLabel.textContent = "修复溢出";
    if (fixBtn)    fixBtn.classList.add("toolbar-btn-warn");
  } else {
    if (statusEl)  { statusEl.textContent = "✅ A4 排版正常"; statusEl.style.color = "#16a34a"; }
    if (btnLabel)  btnLabel.textContent = "✅ A4 正常";
    if (fixBtn)    fixBtn.classList.remove("toolbar-btn-warn");
  }
}

/**
 * Auto-fix overflow by progressively reducing section spacings,
 * then line-height if spacings are exhausted.
 * Forces layout reflow between iterations to get accurate measurements.
 */
function autoFixOverflow() {
  let result = checkOverflow();

  if (!result.overflow) {
    showToast("A4 排版正常，无需修复。", "success");
    return;
  }

  const state = getState();
  const DEFAULT_SPACING = 2;
  const MAX_ITER = 8;

  for (let i = 0; i < MAX_ITER && result.overflow; i++) {
    const sections = state.sections;
    const totalSpacing = sections.reduce((sum, s) =>
      sum + (s.spacingBefore !== undefined ? s.spacingBefore : DEFAULT_SPACING), 0);

    if (totalSpacing > 0.1) {
      // Reduce section spacings proportionally (with 15% buffer)
      const target = Math.max(0, totalSpacing - result.mmBeyond * 1.15);
      const factor = target / totalSpacing;
      sections.forEach(s => {
        const cur = s.spacingBefore !== undefined ? s.spacingBefore : DEFAULT_SPACING;
        s.spacingBefore = Math.max(0, Math.round(cur * factor * 10) / 10);
      });
    } else {
      // Spacings exhausted — shrink line-height stored in state.layout
      if (!state.layout) state.layout = {};
      const curLH = state.layout.lineHeight || 1.4;
      state.layout.lineHeight = Math.max(1.15, curLH - 0.05);
      const contentEl = document.getElementById("resume-content");
      if (contentEl) contentEl.style.lineHeight = state.layout.lineHeight;
    }

    // Re-render sections to apply new spacingBefore values
    renderSections(state);

    // Force reflow then re-measure
    document.getElementById("resume-content").offsetHeight; // eslint-disable-line no-unused-expressions
    result = checkOverflow();
  }

  updateA4Status();

  if (result.overflow) {
    showToast(`仍超出约 ${result.mmBeyond.toFixed(1)} mm，建议手动删减内容。`, "warning");
  } else {
    showToast("已自动修复，A4 排版正常。", "success");
    if (typeof markDirty === "function") markDirty();
  }
}

/**
 * Initialize overflow detection via ResizeObserver.
 */
function initOverflowDetection() {
  const contentEl = document.getElementById("resume-content");
  if (!contentEl) return;

  if (typeof ResizeObserver !== "undefined") {
    const observer = new ResizeObserver(() => {
      requestAnimationFrame(updateA4Status);
    });
    observer.observe(contentEl);
  }

  updateA4Status();
}
