import {
  SECTION_DEFINITIONS,
  createEmptyEntry,
  createEmptySection,
  createId,
  migrateDocument,
} from "./contracts.js";
import { parseMarkdownV2 } from "./markdown.js";

const headingLookup = new Map();
for (const definition of SECTION_DEFINITIONS) {
  for (const name of [definition.title, definition.type, ...definition.aliases]) {
    headingLookup.set(name.toLowerCase().replace(/[\s:：]/g, ""), definition.type);
  }
}

export function sanitizePlainText(value, maxLength = 100_000) {
  return String(value ?? "")
    .replace(/\u0000/g, "")
    .replace(/\r\n?/g, "\n")
    .slice(0, maxLength);
}

export function importJsonObject(data, fileName = "resume.json") {
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("JSON 根节点必须是对象。");
  if (data.basics || data.work || data.education || data.skills) return importJsonResume(data, fileName);
  const document = migrateDocument(data);
  return {
    document,
    confidence: "high",
    unmapped: [],
    warnings: [],
    source: { type: "json", fileName },
  };
}

function dateRange(start, end) {
  return [start, end].filter(Boolean).join(" - ");
}

export function importJsonResume(data, fileName = "resume.json") {
  const basics = data.basics || {};
  const sections = [];
  const unmapped = [];
  const addSection = (type, values, mapEntry) => {
    if (!Array.isArray(values) || !values.length) return;
    const definition = SECTION_DEFINITIONS.find((item) => item.type === type);
    const section = createEmptySection(type, definition?.title);
    section.entries = values.map(mapEntry);
    sections.push(section);
  };

  addSection("experience", data.work, (item) => createEmptyEntry({
    name: item.name || "",
    role: item.position || "",
    date: dateRange(item.startDate, item.endDate),
    location: item.location || "",
    summary: item.summary || "",
    bullets: (item.highlights || []).map((text) => ({ id: createId("bullet"), text: String(text) })),
  }));
  addSection("education", data.education, (item) => createEmptyEntry({
    name: item.institution || "",
    role: [item.studyType, item.area].filter(Boolean).join(" · "),
    date: dateRange(item.startDate, item.endDate),
    summary: item.score ? `成绩：${item.score}` : "",
    bullets: (item.courses || []).map((text) => ({ id: createId("bullet"), text: String(text) })),
  }));
  addSection("projects", data.projects, (item) => createEmptyEntry({
    name: item.name || "",
    role: Array.isArray(item.roles) ? item.roles.join("、") : "",
    date: dateRange(item.startDate, item.endDate),
    summary: item.description || "",
    bullets: (item.highlights || []).map((text) => ({ id: createId("bullet"), text: String(text) })),
  }));
  addSection("skills", data.skills, (item) => createEmptyEntry({
    name: item.name || "",
    role: item.level || "",
    bullets: [{ id: createId("bullet"), text: (item.keywords || []).join("、") }].filter((item) => item.text),
  }));
  addSection("certifications", data.certificates, (item) => createEmptyEntry({
    name: item.name || "",
    role: item.issuer || "",
    date: item.date || "",
  }));
  addSection("awards", data.awards, (item) => createEmptyEntry({
    name: item.title || "",
    role: item.awarder || "",
    date: item.date || "",
    summary: item.summary || "",
  }));
  addSection("languages", data.languages, (item) => createEmptyEntry({ name: item.language || "", role: item.fluency || "" }));
  addSection("publications", data.publications, (item) => createEmptyEntry({
    name: item.name || "",
    role: item.publisher || "",
    date: item.releaseDate || "",
    summary: item.summary || "",
  }));

  const known = new Set(["basics", "work", "volunteer", "education", "awards", "certificates", "publications", "skills", "languages", "interests", "references", "projects", "meta"]);
  for (const [key, value] of Object.entries(data)) {
    if (!known.has(key)) unmapped.push({ key, text: JSON.stringify(value), reason: "JSON Resume 扩展字段未映射" });
  }

  const document = migrateDocument({
    schemaVersion: 2,
    resumeName: basics.name ? `${basics.name}的简历` : fileName.replace(/\.json$/i, ""),
    profile: {
      name: basics.name || "",
      headline: basics.label || "",
      location: [basics.location?.city, basics.location?.region].filter(Boolean).join("，"),
      phone: basics.phone || "",
      email: basics.email || "",
      website: basics.url || "",
      github: (basics.profiles || []).find((item) => /github/i.test(item.network))?.url || "",
    },
    summary: basics.summary || "",
    sections,
  });
  return {
    document,
    confidence: unmapped.length ? "medium" : "high",
    unmapped,
    warnings: data.volunteer?.length || data.references?.length || data.interests?.length
      ? [{ code: "JSON_RESUME_OPTIONAL", message: "志愿、推荐人或兴趣字段未自动加入版面，请在导入确认中检查。" }]
      : [],
    source: { type: "json-resume", fileName },
  };
}

function normalizeHeading(line) {
  return line.toLowerCase().replace(/[\s:：|｜/\\-]/g, "");
}

function detectHeading(line) {
  const normalized = normalizeHeading(line);
  for (const [label, type] of headingLookup) {
    if (normalized === label || (normalized.length < 14 && normalized.includes(label))) return type;
  }
  return null;
}

function looksLikeContact(line) {
  return /@|(?:\+?\d[\d\s()-]{7,})|https?:\/\/|(?:github|linkedin)\.com/i.test(line);
}

function looksLikeDate(line) {
  return /(?:19|20)\d{2}|至今|present|current/i.test(line);
}

function normalizeExtractedLine(line) {
  return line
    .replace(/\s+/g, " ")
    .replace(/(\p{Script=Han}) (?=\p{Script=Han})/gu, "$1")
    .trim();
}

export function parseExtractedResumeText(raw, fileName = "resume") {
  const text = sanitizePlainText(raw);
  const lines = text.split("\n").map(normalizeExtractedLine).filter(Boolean);
  if (!lines.length) throw new Error("没有提取到可读取的文字。扫描型 PDF 需要先进行 OCR，本工具不会猜测内容。");

  const profile = { name: "", headline: "", location: "", phone: "", email: "", website: "", github: "" };
  const sections = [];
  const unmapped = [];
  let current = null;
  let currentEntry = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const type = detectHeading(line);
    if (type && type !== "summary") {
      const definition = SECTION_DEFINITIONS.find((item) => item.type === type);
      current = createEmptySection(type, definition?.title || line);
      sections.push(current);
      currentEntry = null;
      continue;
    }

    if (!current) {
      if (!profile.name && index < 3 && line.length <= 24 && !looksLikeContact(line)) profile.name = line;
      else if (!profile.headline && index < 6 && line.length <= 45 && !looksLikeContact(line)) profile.headline = line;
      else if (/@/.test(line) && !profile.email) profile.email = line.match(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/)?.[0] || "";
      else if (/(?:\+?\d[\d\s()-]{7,})/.test(line) && !profile.phone) profile.phone = line.match(/\+?\d[\d\s()-]{7,}/)?.[0] || "";
      else if (/https?:\/\//i.test(line) && !profile.website) profile.website = line.match(/https?:\/\/\S+/i)?.[0] || "";
      else unmapped.push({ line: index + 1, text: line, reason: "未能确定所属栏目" });
      continue;
    }

    const isBullet = /^[•·▪◦*-]\s*/.test(line);
    if (isBullet) {
      if (!currentEntry) {
        currentEntry = createEmptyEntry();
        current.entries.push(currentEntry);
      }
      currentEntry.bullets.push({ id: createId("bullet"), text: line.replace(/^[•·▪◦*-]\s*/, "") });
      continue;
    }

    if (!currentEntry || (looksLikeDate(line) && currentEntry.bullets.length)) {
      currentEntry = createEmptyEntry({ name: line });
      current.entries.push(currentEntry);
    } else if (looksLikeDate(line) && !currentEntry.date) {
      currentEntry.date = line;
    } else if (!currentEntry.role && line.length < 70) {
      currentEntry.role = line;
    } else {
      currentEntry.bullets.push({ id: createId("bullet"), text: line });
    }
  }

  const document = migrateDocument({
    schemaVersion: 2,
    resumeName: fileName.replace(/\.[^.]+$/, ""),
    profile,
    sections,
  });
  return {
    document,
    confidence: unmapped.length > Math.max(3, lines.length * 0.2) ? "low" : "medium",
    unmapped,
    warnings: [],
    source: { type: "extracted-text", fileName },
  };
}

export function importTextByName(raw, fileName) {
  if (/\.json$/i.test(fileName)) return importJsonObject(JSON.parse(raw), fileName);
  return parseMarkdownV2(raw, fileName);
}
