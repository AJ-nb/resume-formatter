/**
 * Photo module.
 * Handles upload, compression, drag, zoom, delete, reset.
 */

const PHOTO_MAX_FILE_MB = 10;
const PHOTO_MAX_EDGE_PX = 1600;
const PHOTO_TARGET_KB = 500;

/**
 * Initialize direct photo upload and delete interactions.
 */
function initPhoto() {
  const photoInput = document.getElementById("file-input-photo");
  const container = document.getElementById("photo-container");

  if (photoInput) {
    photoInput.addEventListener("change", (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      photoInput.value = "";
      handlePhotoFile(file);
    });
  }

  if (container && photoInput) {
    container.addEventListener("click", (event) => {
      if (event.target.closest(".photo-delete-btn")) {
        event.stopPropagation();
        clearPhoto();
      } else if (container.dataset.empty === "true") {
        photoInput.click();
      }
    });
    container.addEventListener("keydown", (event) => {
      if (container.dataset.empty !== "true" || (event.key !== "Enter" && event.key !== " ")) return;
      event.preventDefault();
      photoInput.click();
    });
  }

  initPhotoDrag();
}

/**
 * Handle a photo File object: validate, compress, store in state, render.
 * @param {File} file
 */
function handlePhotoFile(file) {
  const supported = ["image/jpeg", "image/png", "image/webp"];
  if (!supported.includes(file.type)) {
    showToast("不支持的图片格式，请上传 JPEG、PNG 或 WebP。", "error");
    return;
  }
  if (file.size > PHOTO_MAX_FILE_MB * 1024 * 1024) {
    showToast(`图片超过 ${PHOTO_MAX_FILE_MB}MB，请压缩后再上传。`, "error");
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    const dataUrl = e.target.result;
    compressPhoto(dataUrl, file.type, (compressed, mimeType, w, h) => {
      const state = getState();
      state.photo = { dataUrl: compressed, mimeType, originalWidth: w, originalHeight: h, scale: 1, offsetX: 0, offsetY: 0 };
      renderPhoto(state);
      markDirty();
    });
  };
  reader.onerror = () => showToast("图片读取失败。", "error");
  reader.readAsDataURL(file);
}

/**
 * Compress a photo via Canvas.
 * @param {string} dataUrl
 * @param {string} mimeType
 * @param {Function} callback (compressedDataUrl, mimeType, width, height)
 */
function compressPhoto(dataUrl, mimeType, callback) {
  const img = new Image();
  img.onload = () => {
    let { width, height } = img;
    const maxEdge = PHOTO_MAX_EDGE_PX;

    if (width > maxEdge || height > maxEdge) {
      if (width >= height) {
        height = Math.round(height * maxEdge / width);
        width = maxEdge;
      } else {
        width = Math.round(width * maxEdge / height);
        height = maxEdge;
      }
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, width, height);

    // Try JPEG first for size; fall back to original type
    const outType = mimeType === "image/png" ? "image/png" : "image/jpeg";
    const quality = 0.85;
    const compressed = canvas.toDataURL(outType, quality);
    callback(compressed, outType, width, height);
  };
  img.onerror = () => {
    showToast("图片解码失败。", "error");
  };
  img.src = dataUrl;
}

/**
 * Apply CSS transform to the photo img element from photo state.
 * @param {object} photo
 */
function applyPhotoTransform(photo) {
  const container = document.getElementById("photo-container");
  if (!container) return;
  const img = container.querySelector("img");
  if (!img) return;
  img.style.transform = `translate(${photo.offsetX}px, ${photo.offsetY}px) scale(${photo.scale})`;
}

function clearPhoto() {
  const state = getState();
  state.photo = { dataUrl: "", mimeType: "", originalWidth: 0, originalHeight: 0, scale: 1, offsetX: 0, offsetY: 0 };
  renderPhoto(state);
  markDirty();
}

/**
 * Initialize photo drag via Pointer Events.
 */
function initPhotoDrag() {
  const container = document.getElementById("photo-container");
  if (!container) return;

  let dragging = false;
  let startX = 0, startY = 0;
  let startOffsetX = 0, startOffsetY = 0;

  container.addEventListener("pointerdown", (e) => {
    if (e.target.closest(".photo-delete-btn")) return;
    const img = container.querySelector("img");
    if (!img) return;
    e.preventDefault();
    dragging = true;
    startX = e.clientX;
    startY = e.clientY;
    const state = getState();
    startOffsetX = state.photo.offsetX;
    startOffsetY = state.photo.offsetY;
    container.setPointerCapture(e.pointerId);
  });

  container.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    const state = getState();
    state.photo.offsetX = startOffsetX + dx;
    state.photo.offsetY = startOffsetY + dy;
    applyPhotoTransform(state.photo);
  });

  container.addEventListener("pointerup", () => {
    if (dragging) markDirty();
    dragging = false;
  });
  container.addEventListener("pointercancel", () => { dragging = false; });
}
