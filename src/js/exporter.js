/**
 * Exporter module.
 * Handles "Save as HTML" and PDF export.
 */

/**
 * Export current resume as a standalone HTML file.
 * @param {object} state
 * @param {string} [customFileName]
 */
function exportAsHtml(state, customFileName) {
  const fileName = customFileName || sanitizeFileName(state.resumeName || "resume");
  const fullName = fileName.endsWith(".html") ? fileName : `${fileName}.html`;

  const clonedDoc = cloneDocumentForExport(state);
  const html = serializeDocument(clonedDoc);

  downloadFile(html, fullName, "text/html");
}

/**
 * Clone the current document for export.
 * Injects fresh state and cleans up temporary UI.
 * @param {object} state
 * @returns {Document}
 */
function cloneDocumentForExport(state) {
  const clone = document.cloneNode(true);

  // Generate new documentId for exported copy
  const exportState = deepClone(state);
  exportState.documentId = generateId();
  exportState.metadata.lastSavedAt = new Date().toISOString();

  // Inject state into clone
  const existingScript = clone.querySelector("#embedded-resume-state");
  if (existingScript) existingScript.remove();

  const scriptEl = clone.createElement("script");
  scriptEl.id = "embedded-resume-state";
  scriptEl.type = "application/json";
  scriptEl.textContent = safeJsonSerialize(exportState);

  // Insert before first script or at end of body
  const firstScript = clone.querySelector("script");
  if (firstScript && firstScript.parentNode) {
    firstScript.parentNode.insertBefore(scriptEl, firstScript);
  } else {
    clone.body.appendChild(scriptEl);
  }

  // Clean up temporary UI
  cleanupExportClone(clone);

  return clone;
}

/**
 * Clean up temporary UI states from the cloned document.
 * @param {Document} clone
 */
function cleanupExportClone(clone) {
  // Remove active focus
  if (clone.activeElement) clone.activeElement.blur();

  // Clear selections
  if (clone.getSelection) {
    const sel = clone.getSelection();
    if (sel) sel.removeAllRanges();
  }

  // Clear contenteditable backgrounds
  clone.querySelectorAll("[contenteditable]").forEach((el) => {
    el.removeAttribute("contenteditable");
  });

  // Clear file input values
  clone.querySelectorAll("input[type=file]").forEach((el) => {
    el.value = "";
  });

  // Clear status region
  const statusRegion = clone.getElementById("status-region");
  if (statusRegion) {
    statusRegion.textContent = "";
  }

  // Remove dialog root content
  const dialogRoot = clone.getElementById("dialog-root");
  if (dialogRoot) {
    dialogRoot.innerHTML = "";
    dialogRoot.classList.remove("active");
  }

  // Remove toast containers
  clone.querySelectorAll(".toast-container").forEach((el) => el.remove());
}

/**
 * Serialize a Document to HTML string.
 * @param {Document} doc
 * @returns {string}
 */
function serializeDocument(doc) {
  return "<!DOCTYPE html>\n" + doc.documentElement.outerHTML;
}

/**
 * Trigger a file download.
 * @param {string} content
 * @param {string} fileName
 * @param {string} mimeType
 */
function downloadFile(content, fileName, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Export PDF via browser print.
 */
function exportPdf() {
  window.print();
}
