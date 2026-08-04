/**
 * Renderer module.
 * Renders Resume State into DOM. Pure rendering — no mutation of state.
 */

/**
 * Render the full resume page from state.
 * @param {object} state
 */
function renderResume(state) {
  renderHeader(state);
  renderSections(state);
  updateStatusInfo(state);
}

/**
 * Get current theme from #resume-page data-theme attribute.
 * @returns {"a"|"b"|"c"|"d"}
 */
function getTheme() {
  const page = document.getElementById("resume-page");
  const t = page && page.dataset.theme;
  return (t === "b" || t === "c" || t === "d") ? t : "a";
}

/**
 * Render header — behaviour differs by theme.
 * @param {object} state
 */
function renderHeader(state) {
  const { profile } = state;
  const theme = getTheme();

  const nameEl = document.getElementById("profile-name");
  if (nameEl) {
    nameEl.textContent = profile.name;
    nameEl.dataset.empty = profile.name ? "false" : "true";
    nameEl.dataset.profileField = "name";
    nameEl.contentEditable = "plaintext-only";
  }

  const headlineEl = document.getElementById("profile-headline");
  if (headlineEl) {
    headlineEl.textContent = profile.headline || "";
    headlineEl.dataset.empty = profile.headline ? "false" : "true";
    headlineEl.dataset.profileField = "headline";
    headlineEl.contentEditable = "plaintext-only";
  }

  const contactEl = document.getElementById("contact-info");
  if (contactEl) {
    contactEl.innerHTML = "";
    const items = theme === "a"
      ? [
          profile.phone    && { field: "phone",     text: `联系电话：${profile.phone}` },
          profile.email    && { field: "email",     text: `电子邮箱：${profile.email}` },
          profile.location && { field: "location",  text: profile.location },
          profile.website  && { field: "website",   text: profile.website },
          profile.github   && { field: "github",    text: profile.github },
          profile.portfolio&& { field: "portfolio", text: profile.portfolio },
        ].filter(Boolean)
      : [
          profile.phone    && { field: "phone",     text: profile.phone },
          profile.email    && { field: "email",     text: profile.email },
          profile.location && { field: "location",  text: profile.location },
          profile.website  && { field: "website",   text: profile.website },
          profile.github   && { field: "github",    text: profile.github },
          profile.portfolio&& { field: "portfolio", text: profile.portfolio },
        ].filter(Boolean);

    items.forEach(({ field, text }) => {
      const span = document.createElement("span");
      span.className = "contact-item";
      span.textContent = text;
      span.dataset.profileField = field;
      span.contentEditable = "plaintext-only";
      contactEl.appendChild(span);
    });
  }

  renderPhoto(state);
}

/**
 * Render all sections with spacing handles between them.
 * @param {object} state
 */
function renderSections(state) {
  const container = document.getElementById("resume-sections");
  if (!container) return;
  container.innerHTML = "";

  state.sections.forEach((section) => {
    const handle = document.createElement("div");
    handle.className = "spacing-handle no-print";
    handle.dataset.sectionId = section.id;
    const line = document.createElement("div");
    line.className = "spacing-handle-line";
    const tip = document.createElement("span");
    tip.className = "spacing-tooltip";
    const currentMm = (section.spacingBefore !== undefined) ? section.spacingBefore : 2;
    tip.textContent = currentMm.toFixed(1) + " mm";
    handle.appendChild(line);
    handle.appendChild(tip);
    container.appendChild(handle);

    const sectionEl = renderSection(section);
    if (section.spacingBefore !== undefined) {
      sectionEl.style.marginTop = section.spacingBefore + "mm";
    }
    container.appendChild(sectionEl);
  });

  // Update side gutter after layout settles
  requestAnimationFrame(() => updateAddGutter(state));
}

/**
 * Render a single section.
 * @param {object} section
 * @returns {HTMLElement}
 */
function renderSection(section) {
  const sectionEl = document.createElement("section");
  sectionEl.className = "resume-section";
  sectionEl.dataset.sectionId = section.id;
  sectionEl.dataset.sectionType = section.type;

  const titleEl = document.createElement("h2");
  titleEl.className = "section-title";
  titleEl.textContent = section.title;
  sectionEl.appendChild(titleEl);

  const divider = document.createElement("div");
  divider.className = "section-divider";
  sectionEl.appendChild(divider);

  // Skills: bullets directly, no entry header, no inline add
  if (section.type === "skills") {
    const entry = section.entries[0];
    if (entry) {
      const list = document.createElement("ul");
      list.className = "skills-list";
      list.dataset.entryId = entry.id;
      for (const bullet of entry.bullets) {
        list.appendChild(renderBulletRow(bullet));
      }
      sectionEl.appendChild(list);
    }
    return sectionEl;
  }

  // Other sections — no inline add button, gutter handles it
  for (const entry of section.entries) {
    sectionEl.appendChild(renderEntry(entry));
  }

  return sectionEl;
}

/**
 * Render a single entry with delete button.
 * @param {object} entry
 * @returns {HTMLElement}
 */
function renderEntry(entry) {
  const entryEl = document.createElement("div");
  entryEl.className = "resume-entry";
  entryEl.dataset.entryId = entry.id;

  // Header
  const headerEl = document.createElement("div");
  headerEl.className = "entry-header";

  const leftEl = document.createElement("div");
  leftEl.className = "entry-left";

  const nameSpan = document.createElement("span");
  nameSpan.className = "entry-name";
  nameSpan.textContent = entry.name;
  nameSpan.contentEditable = "plaintext-only";
  nameSpan.dataset.entryField = "name";
  leftEl.appendChild(nameSpan);

  const roleSpan = document.createElement("span");
  roleSpan.className = "entry-role";
  roleSpan.textContent = entry.role || "";
  roleSpan.contentEditable = "plaintext-only";
  roleSpan.dataset.entryField = "role";
  leftEl.appendChild(roleSpan);

  headerEl.appendChild(leftEl);

  const dateLocSpan = document.createElement("span");
  dateLocSpan.className = "entry-date-location";
  dateLocSpan.textContent = [entry.location, entry.date].filter(Boolean).join("  ");
  dateLocSpan.contentEditable = "plaintext-only";
  dateLocSpan.dataset.entryField = "date";
  headerEl.appendChild(dateLocSpan);

  // Delete entry button
  const delBtn = document.createElement("button");
  delBtn.className = "btn-del-entry no-print";
  delBtn.textContent = "×";
  delBtn.title = "删除该条目";
  delBtn.dataset.entryId = entry.id;
  headerEl.appendChild(delBtn);

  entryEl.appendChild(headerEl);

  // Bullets — no inline add row, gutter handles it
  const bulletsEl = document.createElement("ul");
  bulletsEl.className = "entry-bullets";
  bulletsEl.dataset.entryId = entry.id;
  for (const bullet of entry.bullets) {
    bulletsEl.appendChild(renderBulletRow(bullet));
  }
  entryEl.appendChild(bulletsEl);

  return entryEl;
}

/**
 * Render a single bullet row with delete button.
 * @param {object} bullet
 * @returns {HTMLElement}
 */
function renderBulletRow(bullet) {
  const li = document.createElement("li");
  li.className = "bullet-row";
  li.dataset.bulletId = bullet.id;

  const span = document.createElement("span");
  span.className = "bullet-item";
  span.contentEditable = "plaintext-only";
  span.dataset.bulletId = bullet.id;
  span.appendChild(renderInlineContent(bullet.content));
  li.appendChild(span);

  const delBtn = document.createElement("button");
  delBtn.className = "btn-del-bullet no-print";
  delBtn.textContent = "×";
  delBtn.title = "删除该 Bullet";
  delBtn.dataset.bulletId = bullet.id;
  li.appendChild(delBtn);

  return li;
}

/**
 * Render "+ 新增 Bullet" row.
 * @param {string} entryId
 * @returns {HTMLElement}
 */
function renderAddBulletRow(entryId) {
  const li = document.createElement("li");
  li.className = "bullet-add-row no-print";
  const btn = document.createElement("button");
  btn.className = "btn-add-bullet";
  btn.dataset.entryId = entryId;
  btn.textContent = "+ 新增";
  li.appendChild(btn);
  return li;
}

/**
 * Render inline content tokens (text + bold) into a DocumentFragment.
 * @param {object[]} tokens
 * @returns {DocumentFragment}
 */
function renderInlineContent(tokens) {
  const frag = document.createDocumentFragment();
  for (const token of tokens) {
    if (token.type === "text") {
      frag.appendChild(document.createTextNode(token.value));
    } else if (token.type === "strong") {
      const strong = document.createElement("strong");
      strong.textContent = token.value;
      frag.appendChild(strong);
    }
  }
  return frag;
}

/**
 * Render photo from state.
 * @param {object} state
 */
function renderPhoto(state) {
  const container = document.getElementById("photo-container");
  if (!container) return;
  const { photo } = state;

  const existingImg = container.querySelector("img");
  if (existingImg) existingImg.remove();

  if (!photo.dataUrl) {
    container.dataset.empty = "true";
    return;
  }

  container.dataset.empty = "false";
  const img = document.createElement("img");
  img.src = photo.dataUrl;
  img.style.width = `${container.clientWidth}px`;
  img.style.height = "auto";
  img.style.transform = `translate(${photo.offsetX}px, ${photo.offsetY}px) scale(${photo.scale})`;
  img.draggable = false;
  container.appendChild(img);
}

/**
 * Update toolbar info.
 * @param {object} state
 */
function updateStatusInfo(state) {
  const nameEl = document.getElementById("current-filename");
  if (nameEl) {
    nameEl.textContent = state.source.fileName || "未导入文件";
  }
}

/**
 * Build the LEFT-side gutter with "+" buttons for adding entries and bullets.
 * Each button is aligned vertically with its insertion point in the page.
 * @param {object} state
 */
function updateAddGutter(state) {
  const gutter = document.getElementById("add-gutter");
  const pageEl = document.getElementById("resume-page");
  if (!gutter || !pageEl) return;

  gutter.innerHTML = "";
  const gutterRect = gutter.getBoundingClientRect();

  state.sections.forEach((section) => {
    const sectionEl = document.querySelector(`section[data-section-id="${section.id}"]`);
    if (!sectionEl) return;

    if (section.type === "skills") {
      // Skills: bullet add at bottom of list
      const listEl = sectionEl.querySelector(".skills-list");
      if (listEl) {
        const rect = listEl.getBoundingClientRect();
        gutter.appendChild(makeGutterBtn(
          rect.bottom - gutterRect.top,
          "+",
          `在「${section.title}」末尾新增`,
          () => addBullet(section.entries[0]?.id)
        ));
      }
      return;
    }

    // Non-skills: entry add at bottom of section
    const sectionRect = sectionEl.getBoundingClientRect();
    gutter.appendChild(makeGutterBtn(
      sectionRect.bottom - gutterRect.top,
      "+",
      `在「${section.title}」末尾新增条目`,
      () => addEntry(section.id)
    ));

    // Bullet add at bottom of each entry's bullets list
    section.entries.forEach((entry) => {
      const bulletsEl = sectionEl.querySelector(`ul[data-entry-id="${entry.id}"]`);
      if (!bulletsEl) return;
      const bRect = bulletsEl.getBoundingClientRect();
      gutter.appendChild(makeGutterBtn(
        bRect.bottom - gutterRect.top,
        "·+",
        `为「${entry.name || "该条目"}」新增 Bullet`,
        () => addBullet(entry.id),
        true
      ));
    });
  });
}

/**
 * Create a single gutter button item.
 * @param {number} topPx - top offset in px relative to gutter
 * @param {string} label - button text
 * @param {string} title - tooltip
 * @param {Function} onClick
 * @param {boolean} [small] - smaller style for bullet-level adds
 * @returns {HTMLElement}
 */
function makeGutterBtn(topPx, label, title, onClick, small) {
  const item = document.createElement("div");
  item.className = "gutter-item" + (small ? " gutter-item-small" : "");
  item.style.top = topPx + "px";

  const guide = document.createElement("div");
  guide.className = "gutter-guide";

  const btn = document.createElement("button");
  btn.className = "gutter-add-btn" + (small ? " gutter-add-btn-small" : "");
  btn.textContent = label;
  btn.title = title;
  btn.addEventListener("click", onClick);

  item.appendChild(guide);
  item.appendChild(btn);
  return item;
}
