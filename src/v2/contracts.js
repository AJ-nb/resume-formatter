export const APP_VERSION = "2.1.1";
export const SCHEMA_VERSION = 2;

export const SECTION_DEFINITIONS = Object.freeze([
  { type: "summary", title: "个人摘要", aliases: ["个人总结", "职业概述", "summary", "profile"] },
  { type: "experience", title: "工作经历", aliases: ["工作经验", "实习经历", "experience", "work"] },
  { type: "education", title: "教育背景", aliases: ["教育经历", "education"] },
  { type: "projects", title: "项目经历", aliases: ["项目经验", "projects", "project"] },
  { type: "skills", title: "专业技能", aliases: ["技能特长", "技能", "skills"] },
  { type: "certifications", title: "认证证书", aliases: ["证书", "资质", "certifications", "certificates"] },
  { type: "awards", title: "奖项荣誉", aliases: ["获奖经历", "荣誉", "awards"] },
  { type: "languages", title: "语言能力", aliases: ["语言", "languages"] },
  { type: "publications", title: "出版物", aliases: ["论文", "发表", "publications"] },
  { type: "custom", title: "自定义栏目", aliases: [] },
]);

const template = (id, name, description, options) => Object.freeze({
  id,
  name,
  description,
  category: "general",
  keywords: [],
  structure: "single-column",
  preview: "clean",
  paper: ["A4", "Letter"],
  supportsPhoto: true,
  machineReadability: "standard",
  readabilityNote: "当前模板为单栏顺序结构。",
  tokens: {
    fontSize: 10,
    lineHeight: 1.5,
    sectionGap: 3.4,
    pageMarginX: 15,
    pageMarginY: 13,
    accent: "#176b5b",
  },
  ...options,
});

export const TEMPLATES = Object.freeze([
  template("zh-compact", "中文紧凑", "信息密度高，适合中文社招与校招", {
    category: "general",
    keywords: ["中文", "校招", "社招", "高密度"],
    preview: "accent-top",
    tokens: { fontSize: 9.6, lineHeight: 1.42, sectionGap: 2.8, pageMarginX: 13, pageMarginY: 12, accent: "#9e3d2f" },
  }),
  template("modern-sans", "现代无衬线", "清晰的层级与克制的强调色", {
    category: "general",
    keywords: ["通用", "产品", "设计", "现代"],
    tokens: { fontSize: 10, lineHeight: 1.5, sectionGap: 3.6, pageMarginX: 16, pageMarginY: 14, accent: "#176b5b" },
  }),
  template("classic-serif", "经典衬线", "适合咨询、法律与专业服务", {
    category: "professional",
    keywords: ["法律", "专业服务", "传统"],
    preview: "centered",
    supportsPhoto: false,
    tokens: { fontSize: 10.1, lineHeight: 1.52, sectionGap: 3.5, pageMarginX: 17, pageMarginY: 14, accent: "#693a2b" },
  }),
  template("executive-minimal", "行政简约", "高留白、低装饰的管理者版式", {
    category: "leadership",
    keywords: ["高管", "管理", "行政", "留白"],
    preview: "minimal",
    supportsPhoto: false,
    tokens: { fontSize: 9.9, lineHeight: 1.5, sectionGap: 4.2, pageMarginX: 18, pageMarginY: 15, accent: "#222222" },
  }),
  template("academic-research", "学术研究", "强化出版物、教育与研究经历", {
    category: "academic",
    keywords: ["学术", "论文", "研究", "教育"],
    preview: "research",
    supportsPhoto: false,
    tokens: { fontSize: 9.7, lineHeight: 1.46, sectionGap: 3.1, pageMarginX: 15, pageMarginY: 13, accent: "#234f83" },
  }),
  template("visual-two-column", "两栏视觉版", "视觉区分更强，机器读取存在风险", {
    category: "creative",
    keywords: ["视觉", "设计", "作品集", "双栏"],
    structure: "two-column",
    preview: "dark-split",
    machineReadability: "caution",
    readabilityNote: "双栏阅读顺序可能因解析器而异。",
    tokens: { fontSize: 9.5, lineHeight: 1.45, sectionGap: 3.2, pageMarginX: 13, pageMarginY: 12, accent: "#b54632" },
  }),
  template("international-standard", "国际标准", "英文与跨国申请的单栏顺序版式", {
    category: "professional",
    keywords: ["英文", "国际", "外企", "海外", "单栏"],
    preview: "international",
    supportsPhoto: false,
    tokens: { fontSize: 9.8, lineHeight: 1.44, sectionGap: 3.2, pageMarginX: 15.5, pageMarginY: 13, accent: "#184e77" },
  }),
  template("tech-precision", "技术精密", "工程、数据与技术岗位的高密度结构", {
    category: "professional",
    keywords: ["技术", "工程", "研发", "数据", "开发"],
    preview: "technical",
    supportsPhoto: false,
    tokens: { fontSize: 9.6, lineHeight: 1.42, sectionGap: 2.9, pageMarginX: 14, pageMarginY: 12.5, accent: "#0f6b63" },
  }),
  template("consulting-brief", "咨询简报", "结论优先，适合咨询与战略岗位", {
    category: "professional",
    keywords: ["咨询", "战略", "商业分析", "专业服务"],
    preview: "brief",
    supportsPhoto: false,
    tokens: { fontSize: 9.8, lineHeight: 1.46, sectionGap: 3.3, pageMarginX: 15, pageMarginY: 13, accent: "#7a2430" },
  }),
  template("finance-ledger", "金融专业", "稳健对齐，适合金融与投研岗位", {
    category: "professional",
    keywords: ["金融", "投研", "银行", "审计", "会计"],
    preview: "ledger",
    supportsPhoto: false,
    tokens: { fontSize: 9.7, lineHeight: 1.44, sectionGap: 3, pageMarginX: 15, pageMarginY: 12.5, accent: "#205c48" },
  }),
  template("creative-studio", "创意工作室", "作品导向，适合品牌与创意岗位", {
    category: "creative",
    keywords: ["品牌", "创意", "艺术指导", "作品集", "双栏"],
    structure: "two-column",
    preview: "creative-split",
    machineReadability: "caution",
    readabilityNote: "作品导向双栏布局具有阅读顺序风险。",
    tokens: { fontSize: 9.5, lineHeight: 1.45, sectionGap: 3.2, pageMarginX: 12.5, pageMarginY: 12, accent: "#a63d57" },
  }),
  template("startup-signal", "初创敏捷", "适合产品、增长与初创团队的快速扫描", {
    category: "general",
    keywords: ["初创", "产品", "增长", "运营", "互联网"],
    preview: "signal",
    tokens: { fontSize: 9.8, lineHeight: 1.46, sectionGap: 3.1, pageMarginX: 14, pageMarginY: 12.5, accent: "#c14d32" },
  }),
]);

export const TEMPLATE_CATEGORIES = Object.freeze([
  { id: "all", label: "全部方向" },
  { id: "general", label: "通用与产品" },
  { id: "professional", label: "专业岗位" },
  { id: "leadership", label: "管理岗位" },
  { id: "academic", label: "学术研究" },
  { id: "creative", label: "创意设计" },
]);

export function createId(prefix = "id") {
  if (globalThis.crypto?.randomUUID) return `${prefix}-${globalThis.crypto.randomUUID()}`;
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

export function clone(value) {
  return globalThis.structuredClone ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

export function tokensToText(tokens) {
  if (typeof tokens === "string") return tokens;
  if (!Array.isArray(tokens)) return "";
  return tokens.map((token) => {
    const value = String(token?.value ?? "");
    return token?.href ? `[${value}](${token.href})` : value;
  }).join("");
}

export function createEmptyEntry(overrides = {}) {
  return {
    id: createId("entry"),
    name: "",
    role: "",
    date: "",
    location: "",
    summary: "",
    bullets: [],
    ...overrides,
  };
}

export function createEmptySection(type = "custom", title) {
  const definition = SECTION_DEFINITIONS.find((item) => item.type === type);
  return {
    id: createId("section"),
    type,
    title: title || definition?.title || "自定义栏目",
    entries: [],
  };
}

export function createDefaultDocument() {
  const now = new Date().toISOString();
  return {
    schemaVersion: SCHEMA_VERSION,
    appVersion: APP_VERSION,
    documentId: createId("resume"),
    resumeName: "未命名简历",
    locale: "zh-CN",
    profile: {
      name: "林知远",
      headline: "产品设计师",
      location: "上海",
      phone: "138-0000-0000",
      email: "hello@example.com",
      website: "portfolio.example.com",
      github: "",
    },
    summary: "专注复杂业务工具与设计系统，擅长将用户洞察转化为可衡量的产品改进。",
    sections: [
      {
        ...createEmptySection("experience"),
        entries: [createEmptyEntry({
          name: "星河科技",
          role: "高级产品设计师",
          date: "2022.06 - 至今",
          location: "上海",
          bullets: [
            { id: createId("bullet"), text: "重构企业工作台核心流程，将关键任务完成时间缩短 32%。" },
            { id: createId("bullet"), text: "建立跨产品设计系统，覆盖 4 条业务线并减少重复开发。" },
          ],
        })],
      },
      {
        ...createEmptySection("projects"),
        entries: [createEmptyEntry({
          name: "数据洞察平台",
          role: "设计负责人",
          date: "2023.03 - 2023.11",
          bullets: [{ id: createId("bullet"), text: "组织 18 次用户访谈，推动信息架构与关键指标体系落地。" }],
        })],
      },
      {
        ...createEmptySection("education"),
        entries: [createEmptyEntry({ name: "示例大学", role: "工业设计 · 本科", date: "2018 - 2022" })],
      },
      {
        ...createEmptySection("skills"),
        entries: [createEmptyEntry({ bullets: [{ id: createId("bullet"), text: "产品策略、用户研究、交互设计、Figma、数据分析" }] })],
      },
    ],
    assets: { photo: null },
    layout: {
      templateId: "modern-sans",
      paper: "A4",
      showPhoto: true,
      tokenOverrides: {},
    },
    versions: [],
    migration: { sourceSchemaVersion: SCHEMA_VERSION, migratedAt: null },
    metadata: { createdAt: now, updatedAt: now, lastSavedAt: null },
  };
}

function normalizeBullet(bullet) {
  if (typeof bullet === "string") return { id: createId("bullet"), text: bullet };
  return {
    id: bullet?.id || createId("bullet"),
    text: tokensToText(bullet?.text ?? bullet?.content ?? ""),
  };
}

function normalizeEntry(entry = {}) {
  return createEmptyEntry({
    id: entry.id || createId("entry"),
    name: String(entry.name ?? entry.organization ?? ""),
    role: String(entry.role ?? entry.position ?? ""),
    date: String(entry.date ?? ""),
    location: String(entry.location ?? ""),
    summary: String(entry.summary ?? ""),
    bullets: Array.isArray(entry.bullets) ? entry.bullets.map(normalizeBullet) : [],
  });
}

function normalizeSection(section = {}) {
  const known = SECTION_DEFINITIONS.find((item) => item.type === section.type);
  return {
    id: section.id || createId("section"),
    type: known ? section.type : "custom",
    title: String(section.title || known?.title || section.type || "自定义栏目"),
    entries: Array.isArray(section.entries) ? section.entries.map(normalizeEntry) : [],
  };
}

export function migrateDocument(input) {
  if (!input || typeof input !== "object") throw new Error("简历数据必须是 JSON 对象。");
  const sourceVersion = Number(input.schemaVersion ?? input.schema_version ?? 1);
  if (![1, 2].includes(sourceVersion)) throw new Error(`不支持 Schema v${sourceVersion}。`);

  const base = createDefaultDocument();
  const isV2 = sourceVersion === 2;
  const sourcePhoto = isV2 ? input.assets?.photo : input.photo;
  const result = {
    ...base,
    ...input,
    schemaVersion: SCHEMA_VERSION,
    appVersion: APP_VERSION,
    documentId: input.documentId || base.documentId,
    resumeName: String(input.resumeName ?? input.resume_name ?? base.resumeName),
    locale: input.locale || base.locale,
    profile: { ...base.profile, ...(input.profile || {}) },
    summary: String(input.summary ?? ""),
    sections: Array.isArray(input.sections) ? input.sections.map(normalizeSection) : [],
    assets: { photo: sourcePhoto ? clone(sourcePhoto) : null },
    layout: {
      ...base.layout,
      ...(input.layout || {}),
      templateId: input.layout?.templateId || input.layout?.theme || base.layout.templateId,
      tokenOverrides: { ...(input.layout?.tokenOverrides || {}) },
    },
    versions: Array.isArray(input.versions) ? clone(input.versions) : [],
    migration: isV2
      ? { sourceSchemaVersion: input.migration?.sourceSchemaVersion ?? 2, migratedAt: input.migration?.migratedAt ?? null }
      : { sourceSchemaVersion: 1, migratedAt: new Date().toISOString() },
    metadata: { ...base.metadata, ...(input.metadata || {}) },
  };

  const validTemplate = TEMPLATES.some((item) => item.id === result.layout.templateId);
  if (!validTemplate) result.layout.templateId = base.layout.templateId;
  if (!result.sections.length) result.sections = base.sections;
  return result;
}

export function getTemplate(templateId) {
  return TEMPLATES.find((item) => item.id === templateId) || TEMPLATES[1];
}

export function resolveLayout(document) {
  const selected = getTemplate(document.layout?.templateId);
  const overrides = document.layout?.tokenOverrides || {};
  const number = (key, min, max) => {
    const value = Number(overrides[key] ?? selected.tokens[key]);
    return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : selected.tokens[key];
  };
  return {
    template: selected,
    paper: document.layout?.paper === "Letter" ? "Letter" : "A4",
    showPhoto: Boolean(document.layout?.showPhoto && selected.supportsPhoto),
    tokens: {
      fontSize: number("fontSize", 7.5, 12),
      lineHeight: number("lineHeight", 1.15, 1.85),
      sectionGap: number("sectionGap", 1, 8),
      pageMarginX: number("pageMarginX", 8, 28),
      pageMarginY: number("pageMarginY", 8, 28),
      accent: /^#[0-9a-f]{6}$/i.test(overrides.accent || "") ? overrides.accent : selected.tokens.accent,
    },
  };
}

export function documentToPlainText(document) {
  const lines = [
    document.profile?.name,
    document.profile?.headline,
    document.summary,
  ].filter(Boolean);
  for (const section of document.sections || []) {
    lines.push(section.title);
    for (const entry of section.entries || []) {
      lines.push([entry.name, entry.role, entry.date, entry.location].filter(Boolean).join(" | "));
      if (entry.summary) lines.push(entry.summary);
      for (const bullet of entry.bullets || []) lines.push(`- ${bullet.text}`);
    }
  }
  return lines.join("\n");
}

export function validateDocument(document) {
  const issues = [];
  if (document?.schemaVersion !== 2) issues.push({ level: "error", code: "SCHEMA_VERSION", message: "需要 Schema v2。" });
  if (!document?.profile?.name?.trim()) issues.push({ level: "error", code: "MISSING_NAME", message: "缺少姓名。" });
  if (!Array.isArray(document?.sections)) issues.push({ level: "error", code: "INVALID_SECTIONS", message: "栏目必须是数组。" });
  return issues;
}
