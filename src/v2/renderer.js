import { getTemplate, resolveLayout } from "./contracts.js";

export function getByPath(document, path) {
  if (!path) return undefined;
  const parts = path.split(".");
  let current = document;
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];
    if (part === "sections") {
      current = current.sections?.find((item) => item.id === parts[++index]);
    } else if (part === "entries") {
      current = current.entries?.find((item) => item.id === parts[++index]);
    } else if (part === "bullets") {
      current = current.bullets?.find((item) => item.id === parts[++index]);
    } else {
      current = current?.[part];
    }
    if (current == null) return current;
  }
  return current;
}

export function setByPath(document, path, value) {
  const parts = path.split(".");
  let current = document;
  for (let index = 0; index < parts.length - 1; index += 1) {
    const part = parts[index];
    if (part === "sections") current = current.sections.find((item) => item.id === parts[++index]);
    else if (part === "entries") current = current.entries.find((item) => item.id === parts[++index]);
    else if (part === "bullets") current = current.bullets.find((item) => item.id === parts[++index]);
    else current = current[part];
    if (!current) throw new Error(`字段路径不存在：${path}`);
  }
  current[parts.at(-1)] = value;
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function editable(tag, className, value, path, placeholder) {
  const node = element(tag, className, value);
  node.contentEditable = "plaintext-only";
  node.spellcheck = true;
  node.dataset.editPath = path;
  node.dataset.placeholder = placeholder || "点击编辑";
  node.setAttribute("role", "textbox");
  node.setAttribute("aria-label", placeholder || "可编辑文字");
  if (!value) node.dataset.empty = "true";
  return node;
}

function iconButton(action, icon, label, dataset = {}) {
  const button = element("button", "icon-button no-print");
  button.type = "button";
  button.dataset.action = action;
  button.dataset.icon = icon;
  Object.assign(button.dataset, dataset);
  button.title = label;
  button.setAttribute("aria-label", label);
  return button;
}

function contactValue(profile, key) {
  const value = profile[key];
  if (!value) return null;
  return { key, value, path: `profile.${key}` };
}

function renderHeader(doc, layout) {
  const header = element("header", "resume-header");
  const identity = element("div", "resume-identity");
  identity.append(
    editable("h1", "resume-name", doc.profile.name, "profile.name", "姓名"),
    editable("p", "resume-headline", doc.profile.headline, "profile.headline", "求职方向"),
  );
  const contacts = element("div", "resume-contacts");
  for (const item of [
    contactValue(doc.profile, "phone"),
    contactValue(doc.profile, "email"),
    contactValue(doc.profile, "location"),
    contactValue(doc.profile, "website"),
    contactValue(doc.profile, "github"),
  ].filter(Boolean)) {
    contacts.append(editable("span", `contact contact-${item.key}`, item.value, item.path, item.key));
  }
  identity.append(contacts);
  header.append(identity);

  if (layout.showPhoto) {
    const photo = element("div", `resume-photo${doc.assets?.photo?.dataUrl ? "" : " empty"}`);
    photo.dataset.action = "photo-upload";
    photo.title = "调整证件照";
    if (doc.assets?.photo?.dataUrl) {
      const image = element("img");
      image.alt = "证件照";
      image.src = doc.assets.photo.dataUrl;
      image.style.setProperty("--photo-scale", doc.assets.photo.scale || 1);
      image.style.setProperty("--photo-x", `${doc.assets.photo.offsetX || 0}%`);
      image.style.setProperty("--photo-y", `${doc.assets.photo.offsetY || 0}%`);
      photo.append(image);
    } else {
      photo.append(element("span", "photo-placeholder", "照片"));
    }
    header.append(photo);
  }
  return header;
}

function renderEntry(section, entry) {
  const node = element("article", "resume-entry");
  node.dataset.entryId = entry.id;
  const path = `sections.${section.id}.entries.${entry.id}`;
  const hasMetadata = [entry.name, entry.role, entry.date, entry.location].some((value) => value?.trim());
  if (hasMetadata || !(entry.bullets || []).length) {
    const top = element("div", "entry-topline");
    const left = element("div", "entry-primary");
    left.append(
      editable("h3", "entry-name", entry.name, `${path}.name`, "单位或项目名称"),
      editable("span", "entry-role", entry.role, `${path}.role`, "角色或专业"),
    );
    const right = element("div", "entry-meta");
    right.append(
      editable("span", "entry-date", entry.date, `${path}.date`, "日期"),
      editable("span", "entry-location", entry.location, `${path}.location`, "地点"),
    );
    top.append(left, right, iconButton("delete-entry", "trash-2", "删除条目", { sectionId: section.id, entryId: entry.id }));
    node.append(top);
  }
  if (entry.summary) node.append(editable("p", "entry-summary", entry.summary, `${path}.summary`, "补充说明"));

  const bullets = element("ul", "entry-bullets");
  for (const bullet of entry.bullets || []) {
    const row = element("li", "bullet-row");
    row.dataset.bulletId = bullet.id;
    row.append(
      editable("span", "bullet-text", bullet.text, `${path}.bullets.${bullet.id}.text`, "成果描述"),
      iconButton("delete-bullet", "x", "删除此条", { sectionId: section.id, entryId: entry.id, bulletId: bullet.id }),
    );
    bullets.append(row);
  }
  node.append(bullets, iconButton("add-bullet", "plus", "添加项目符号", { sectionId: section.id, entryId: entry.id }));
  return node;
}

function renderSection(section) {
  const node = element("section", `resume-section section-${section.type}`);
  node.dataset.sectionId = section.id;
  node.dataset.sectionType = section.type;
  const heading = element("div", "section-heading-row");
  heading.append(
    editable("h2", "section-heading", section.title, `sections.${section.id}.title`, "栏目名称"),
    iconButton("add-entry", "plus", "添加条目", { sectionId: section.id }),
    iconButton("delete-section", "trash-2", "删除栏目", { sectionId: section.id }),
  );
  node.append(heading);
  const body = element("div", "section-body");
  for (const entry of section.entries || []) body.append(renderEntry(section, entry));
  node.append(body);
  return node;
}

export function renderDocument(doc, paper) {
  const layout = resolveLayout(doc);
  paper.replaceChildren();
  paper.dataset.template = layout.template.id;
  paper.dataset.paper = layout.paper.toLowerCase();
  paper.style.setProperty("--resume-font-size", `${layout.tokens.fontSize}pt`);
  paper.style.setProperty("--resume-line-height", layout.tokens.lineHeight);
  paper.style.setProperty("--section-gap", `${layout.tokens.sectionGap}mm`);
  paper.style.setProperty("--page-margin-x", `${layout.tokens.pageMarginX}mm`);
  paper.style.setProperty("--page-margin-y", `${layout.tokens.pageMarginY}mm`);
  paper.style.setProperty("--resume-accent", layout.tokens.accent);

  const content = element("div", "paper-content");
  content.append(renderHeader(doc, layout));
  if (doc.summary) {
    const summary = element("section", "resume-summary");
    summary.append(editable("p", "summary-text", doc.summary, "summary", "个人摘要"));
    content.append(summary);
  }
  const sections = element("div", `resume-sections${layout.template.id === "visual-two-column" ? " two-column" : ""}`);
  if (layout.template.id === "visual-two-column") {
    const side = element("div", "resume-column side");
    const main = element("div", "resume-column main");
    const sideTypes = new Set(["education", "skills", "certifications", "awards", "languages"]);
    for (const section of doc.sections || []) (sideTypes.has(section.type) ? side : main).append(renderSection(section));
    sections.append(side, main);
  } else {
    for (const section of doc.sections || []) sections.append(renderSection(section));
  }
  content.append(sections);
  paper.append(content);
  return layout;
}

function mobileInput(label, value, path, multiline = false) {
  const wrapper = element("label", "mobile-field");
  wrapper.append(element("span", "mobile-field-label", label));
  const input = element(multiline ? "textarea" : "input", "mobile-field-control");
  input.value = value || "";
  input.dataset.editPath = path;
  if (multiline) input.rows = 3;
  wrapper.append(input);
  return wrapper;
}

export function renderMobileEditor(doc, target) {
  target.replaceChildren();
  const profile = element("section", "mobile-editor-section");
  profile.append(
    element("h2", "mobile-editor-heading", "基本资料"),
    mobileInput("姓名", doc.profile.name, "profile.name"),
    mobileInput("求职方向", doc.profile.headline, "profile.headline"),
    mobileInput("邮箱", doc.profile.email, "profile.email"),
    mobileInput("电话", doc.profile.phone, "profile.phone"),
    mobileInput("个人摘要", doc.summary, "summary", true),
  );
  target.append(profile);
  for (const section of doc.sections) {
    const block = element("section", "mobile-editor-section");
    block.append(element("h2", "mobile-editor-heading", section.title));
    for (const entry of section.entries) {
      const entryNode = element("div", "mobile-entry");
      const prefix = `sections.${section.id}.entries.${entry.id}`;
      entryNode.append(
        mobileInput("名称", entry.name, `${prefix}.name`),
        mobileInput("角色", entry.role, `${prefix}.role`),
        mobileInput("日期", entry.date, `${prefix}.date`),
      );
      for (const bullet of entry.bullets) {
        entryNode.append(mobileInput("项目符号", bullet.text, `${prefix}.bullets.${bullet.id}.text`, true));
      }
      block.append(entryNode);
    }
    target.append(block);
  }
}

export function checkMachineReadability(doc) {
  const checks = [];
  const add = (status, code, title, detail, path = "") => checks.push({ status, code, title, detail, path });
  add(doc.profile.name?.trim() ? "pass" : "warning", "NAME", "姓名", doc.profile.name?.trim() ? "存在明确姓名。" : "缺少姓名。", "profile.name");
  add(doc.profile.email?.trim() || doc.profile.phone?.trim() ? "pass" : "warning", "CONTACT", "联系方式", doc.profile.email || doc.profile.phone ? "至少提供了一项联系方式。" : "缺少邮箱或电话。", "profile.email");
  const template = getTemplate(doc.layout.templateId);
  add(template.machineReadability === "caution" ? "warning" : "pass", "LAYOUT", "版式结构", template.machineReadability === "caution" ? "两栏阅读顺序可能因解析器而异。" : "当前模板为单栏顺序结构。", "layout.templateId");
  const bullets = doc.sections.flatMap((section) => section.entries.flatMap((entry) => entry.bullets));
  const long = bullets.filter((bullet) => bullet.text.length > 180);
  add(long.length ? "warning" : "pass", "BULLET_LENGTH", "项目符号长度", long.length ? `${long.length} 条超过 180 字，可能影响扫描阅读。` : "项目符号长度未见明显异常。");
  const emptyDates = doc.sections.filter((section) => ["experience", "education", "projects"].includes(section.type))
    .flatMap((section) => section.entries).filter((entry) => !entry.date.trim());
  add(emptyDates.length ? "warning" : "pass", "DATES", "日期信息", emptyDates.length ? `${emptyDates.length} 个经历条目缺少日期。` : "经历条目包含日期。" );
  add(doc.sections.some((section) => section.type === "experience") ? "pass" : "warning", "EXPERIENCE", "工作经历", doc.sections.some((section) => section.type === "experience") ? "存在工作经历栏目。" : "未识别到工作经历栏目。");
  return checks;
}

export function locateOverflow(paper) {
  const previous = paper.querySelector(".overflow-start");
  previous?.classList.remove("overflow-start");
  const content = paper.querySelector(".paper-content");
  if (!content) return { overflow: false, overflowPx: 0, firstPath: "" };
  const paperRect = paper.getBoundingClientRect();
  const boundary = paperRect.bottom - 1;
  const candidates = [...content.querySelectorAll(".resume-entry, .bullet-row, .resume-section")];
  const first = candidates.find((node) => node.getBoundingClientRect().bottom > boundary);
  if (first) first.classList.add("overflow-start");
  const overflowPx = Math.max(0, content.scrollHeight - content.clientHeight);
  return {
    overflow: overflowPx > 2,
    overflowPx,
    firstPath: first?.querySelector("[data-edit-path]")?.dataset.editPath || first?.dataset.sectionId || "",
  };
}

export function diffWords(before, after) {
  const left = String(before).split(/(\s+|(?=[，。；、,.!?;:：]))/).filter(Boolean);
  const right = String(after).split(/(\s+|(?=[，。；、,.!?;:：]))/).filter(Boolean);
  const rows = Array(left.length + 1).fill(null).map(() => Array(right.length + 1).fill(0));
  for (let i = 1; i <= left.length; i += 1) {
    for (let j = 1; j <= right.length; j += 1) {
      rows[i][j] = left[i - 1] === right[j - 1] ? rows[i - 1][j - 1] + 1 : Math.max(rows[i - 1][j], rows[i][j - 1]);
    }
  }
  const result = [];
  let i = left.length;
  let j = right.length;
  while (i || j) {
    if (i && j && left[i - 1] === right[j - 1]) {
      result.unshift({ type: "same", text: left[--i] });
      j -= 1;
    } else if (j && (!i || rows[i][j - 1] >= rows[i - 1][j])) {
      result.unshift({ type: "add", text: right[--j] });
    } else {
      result.unshift({ type: "remove", text: left[--i] });
    }
  }
  return result;
}
