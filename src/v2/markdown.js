import {
  SECTION_DEFINITIONS,
  createEmptyEntry,
  createEmptySection,
  createId,
  migrateDocument,
} from "./contracts.js";

const aliases = new Map();
for (const item of SECTION_DEFINITIONS) {
  aliases.set(item.type.toLowerCase(), item.type);
  aliases.set(item.title.toLowerCase(), item.type);
  for (const alias of item.aliases) aliases.set(alias.toLowerCase(), item.type);
}

function parseFrontmatter(lines) {
  if (lines[0]?.trim() !== "---") return { values: {}, next: 0, warnings: [] };
  const values = {};
  const warnings = [];
  let index = 1;
  for (; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.trim() === "---") return { values, next: index + 1, warnings };
    if (!line.trim()) continue;
    const colon = line.indexOf(":");
    if (colon < 1) {
      warnings.push({ code: "FRONTMATTER_LINE", line: index + 1, message: `无法解析 Frontmatter：${line}` });
      continue;
    }
    const key = line.slice(0, colon).trim();
    let value = line.slice(colon + 1).trim();
    value = value.replace(/^("|')|("|')$/g, "");
    values[key] = value;
  }
  warnings.push({ code: "FRONTMATTER_UNCLOSED", line: 1, message: "Frontmatter 缺少结束标记。" });
  return { values, next: index, warnings };
}

function sectionTypeFor(title) {
  return aliases.get(String(title || "").trim().toLowerCase()) || "custom";
}

function splitMeta(value) {
  const parts = String(value || "").split("|").map((item) => item.trim());
  return { role: parts[0] || "", date: parts[1] || "", location: parts[2] || "" };
}

export function parseMarkdownV2(raw, fileName = "resume.md") {
  const lines = String(raw || "").replace(/\r\n?/g, "\n").split("\n");
  const frontmatter = parseFrontmatter(lines);
  const sections = [];
  const unmapped = [];
  let currentSection = null;
  let currentEntry = null;

  for (let index = frontmatter.next; index < lines.length; index += 1) {
    const source = lines[index];
    const line = source.trim();
    if (!line) continue;

    if (/^##\s+/.test(line)) {
      const title = line.replace(/^##\s+/, "").trim();
      currentSection = createEmptySection(sectionTypeFor(title), title);
      sections.push(currentSection);
      currentEntry = null;
      continue;
    }

    if (/^###\s+/.test(line)) {
      if (!currentSection) {
        unmapped.push({ line: index + 1, text: source, reason: "条目位于栏目之外" });
        continue;
      }
      currentEntry = createEmptyEntry({ name: line.replace(/^###\s+/, "").trim() });
      currentSection.entries.push(currentEntry);
      continue;
    }

    const field = line.match(/^(role|date|location|summary)\s*:\s*(.*)$/i);
    if (field && currentEntry) {
      currentEntry[field[1].toLowerCase()] = field[2].trim();
      continue;
    }

    if (/^[-*+]\s+/.test(line)) {
      if (!currentSection) {
        unmapped.push({ line: index + 1, text: source, reason: "项目符号位于栏目之外" });
        continue;
      }
      if (!currentEntry) {
        currentEntry = createEmptyEntry();
        currentSection.entries.push(currentEntry);
      }
      currentEntry.bullets.push({ id: createId("bullet"), text: line.replace(/^[-*+]\s+/, "").trim() });
      continue;
    }

    if (currentSection?.type === "summary") {
      if (!currentEntry) {
        currentEntry = createEmptyEntry();
        currentSection.entries.push(currentEntry);
      }
      currentEntry.summary = [currentEntry.summary, line].filter(Boolean).join("\n");
      continue;
    }

    if (currentEntry && line.includes("|") && !currentEntry.role && !currentEntry.date) {
      Object.assign(currentEntry, splitMeta(line));
      continue;
    }

    unmapped.push({ line: index + 1, text: source, reason: "未识别的 Markdown 内容" });
  }

  const summarySection = sections.find((section) => section.type === "summary");
  const filteredSections = sections.filter((section) => section !== summarySection);
  const input = {
    schemaVersion: Number(frontmatter.values.schema_version || frontmatter.values.schemaVersion || 2),
    resumeName: frontmatter.values.resume_name || frontmatter.values.resumeName || fileName.replace(/\.[^.]+$/, ""),
    locale: frontmatter.values.locale || "zh-CN",
    profile: {
      name: frontmatter.values.name || "",
      headline: frontmatter.values.headline || "",
      location: frontmatter.values.location || "",
      phone: frontmatter.values.phone || "",
      email: frontmatter.values.email || "",
      website: frontmatter.values.website || frontmatter.values.portfolio || "",
      github: frontmatter.values.github || "",
    },
    summary: summarySection?.entries?.map((entry) => entry.summary).filter(Boolean).join("\n") || frontmatter.values.summary || "",
    sections: filteredSections,
  };

  return {
    document: migrateDocument(input),
    confidence: unmapped.length ? "medium" : "high",
    unmapped,
    warnings: frontmatter.warnings,
    source: { type: "markdown", fileName },
  };
}

function yaml(value) {
  const normalized = String(value ?? "").replace(/\r?\n/g, " ");
  return /[:#"']/u.test(normalized) ? JSON.stringify(normalized) : normalized;
}

export function serializeMarkdown(document) {
  const lines = [
    "---",
    "schema_version: 2",
    `resume_name: ${yaml(document.resumeName)}`,
    `locale: ${yaml(document.locale || "zh-CN")}`,
    `name: ${yaml(document.profile.name)}`,
    `headline: ${yaml(document.profile.headline)}`,
    `location: ${yaml(document.profile.location)}`,
    `phone: ${yaml(document.profile.phone)}`,
    `email: ${yaml(document.profile.email)}`,
    `website: ${yaml(document.profile.website)}`,
    `github: ${yaml(document.profile.github)}`,
    "---",
    "",
  ];
  if (document.summary) lines.push("## 个人摘要", "", document.summary, "");
  for (const section of document.sections || []) {
    lines.push(`## ${section.title}`, "");
    for (const entry of section.entries || []) {
      if (entry.name) lines.push(`### ${entry.name}`);
      if (entry.role) lines.push(`role: ${entry.role}`);
      if (entry.date) lines.push(`date: ${entry.date}`);
      if (entry.location) lines.push(`location: ${entry.location}`);
      if (entry.summary) lines.push(`summary: ${entry.summary}`);
      for (const bullet of entry.bullets || []) lines.push(`- ${bullet.text}`);
      lines.push("");
    }
  }
  return `${lines.join("\n").trim()}\n`;
}
