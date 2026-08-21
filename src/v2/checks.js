import { getTemplate, validateDocument } from "./contracts.js";

function check(code, severity, title, detail, fieldPath = "", fixAction = null, bypassable = severity !== "blocker") {
  return { code, severity, title, detail, fieldPath, fixAction, bypassable };
}

function bulletPath(section, entry, bullet) {
  return `sections.${section.id}.entries.${entry.id}.bullets.${bullet.id}.text`;
}

function collectBullets(document) {
  return (document.sections || []).flatMap((section) => (section.entries || []).flatMap((entry) => (entry.bullets || []).map((bullet) => ({
    bullet,
    section,
    entry,
    path: bulletPath(section, entry, bullet),
    text: bullet.text.trim(),
  }))));
}

function normalizeText(value) {
  return String(value || "").toLowerCase().replace(/[\s，。；、,.;:：()（）【】\[\]_-]+/g, "");
}

function firstActionVerb(value) {
  const text = String(value || "").trim();
  const chinese = text.match(/^(主导|负责|推动|参与|协助|设计|建立|优化|实现|完成|管理|组织|搭建|开发|分析|制定|带领|交付|支持|策划|统筹)/)?.[1];
  if (chinese) return chinese;
  return text.match(/^(led|managed|built|developed|designed|created|implemented|improved|optimized|delivered|launched|owned|supported|analyzed)\b/i)?.[1]?.toLowerCase() || "";
}

function hasOutcomeSignal(value) {
  return /\d|提升|提高|降低|减少|增长|节省|缩短|完成|上线|落地|交付|覆盖|达到|获得|获奖|转化|留存|收入|成本|效率|through|result|increase|decrease|reduce|save|launch|deliver|revenue|cost|conversion/i.test(String(value || ""));
}

function languageMixed(value) {
  const text = String(value || "");
  const chineseCount = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  const englishWords = text.match(/\b[a-z]{2,}\b/gi) || [];
  return chineseCount >= 8 && englishWords.length >= 5;
}

function dateStyle(value) {
  const text = String(value || "");
  if (/\d{4}年/.test(text)) return "中文年月";
  if (/\d{4}\.\d{1,2}/.test(text)) return "点分年月";
  if (/\d{4}\/\d{1,2}/.test(text)) return "斜杠年月";
  if (/\d{4}-\d{1,2}/.test(text)) return "短横线年月";
  if (/\b\d{4}\b/.test(text)) return "年份";
  return "";
}

function parseDateRange(value) {
  const text = String(value || "").trim();
  const matches = [...text.matchAll(/((?:19|20)\d{2})(?:[./年-](\d{1,2}))?/g)];
  if (!matches.length || (!matches[1] && !/(至今|现在|present|current)/i.test(text))) return null;
  const point = (match) => Number(match[1]) * 12 + Math.min(12, Math.max(1, Number(match[2] || 1))) - 1;
  const start = point(matches[0]);
  const end = /(至今|现在|present|current)/i.test(text)
    ? new Date().getFullYear() * 12 + new Date().getMonth()
    : point(matches[1] || matches[0]);
  return start <= end ? { start, end } : null;
}

function validLink(value) {
  const text = String(value || "").trim();
  return !text || /^(?:https?:\/\/)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?:[/:?#][^\s]*)?$/i.test(text);
}

function skillTokens(document) {
  return (document.sections || [])
    .filter((section) => section.type === "skills")
    .flatMap((section) => section.entries || [])
    .flatMap((entry) => entry.bullets || [])
    .flatMap((bullet) => bullet.text.split(/[、,，;；|/]/))
    .map((item) => item.replace(/^(熟悉|掌握|精通|了解)\s*/, "").trim())
    .filter((item) => item.length >= 2 && item.length <= 32);
}

function duplicateBullets(bullets) {
  const seen = new Map();
  const duplicates = [];
  for (const item of bullets) {
    const normalized = normalizeText(item.text);
    if (normalized.length < 8) continue;
    if (seen.has(normalized)) duplicates.push({ first: seen.get(normalized), duplicate: item });
    else seen.set(normalized, item);
  }
  return duplicates;
}

export function buildQuickScan(document, application = {}) {
  const bullets = collectBullets(document);
  const outcomeCandidates = [...bullets.filter((item) => hasOutcomeSignal(item.text)), ...bullets.filter((item) => !hasOutcomeSignal(item.text))];
  const outcomes = [];
  for (const item of outcomeCandidates) {
    if (!outcomes.some((existing) => existing.path === item.path)) outcomes.push({ path: item.path, text: item.text, section: item.section.title });
    if (outcomes.length === 3) break;
  }
  const quantified = [];
  for (const item of bullets) {
    const values = item.text.match(/(?:\d+(?:[.,]\d+)?%?|\d+\s*(?:万|亿|人|次|项|个|天|周|月|年|小时|分钟))/g) || [];
    for (const value of values) quantified.push({ value, path: item.path, text: item.text });
  }
  return {
    name: String(document.profile?.name || ""),
    targetRole: String(application.role || document.profile?.headline || ""),
    contact: [document.profile?.phone, document.profile?.email, document.profile?.location, document.profile?.website].filter(Boolean).map(String),
    readingOrder: [
      { label: "姓名与求职方向", path: "profile.name" },
      { label: "联系方式", path: "profile.email" },
      ...(document.summary?.trim() ? [{ label: "个人摘要", path: "summary" }] : []),
      ...(document.sections || []).map((section) => ({ label: section.title, path: `sections.${section.id}` })),
    ],
    outcomes,
    quantified: quantified.slice(0, 12),
  };
}

export function runResumeChecks(document, context = {}) {
  const checks = [];
  const validation = validateDocument(document);
  for (const issue of validation) {
    checks.push(check(`SCHEMA_${issue.code}`, "blocker", "简历结构无效", issue.message, issue.code === "MISSING_NAME" ? "profile.name" : ""));
  }
  if (!document.profile?.name?.trim() && !checks.some((item) => item.fieldPath === "profile.name")) {
    checks.push(check("PROFILE_NAME_MISSING", "blocker", "缺少姓名", "投递 PDF 前需要填写姓名。", "profile.name"));
  }
  if (!document.profile?.email?.trim() && !document.profile?.phone?.trim()) {
    checks.push(check("PROFILE_CONTACT_MISSING", "blocker", "缺少联系方式", "至少填写邮箱或电话。", "profile.email"));
  }
  if (context.overflow?.overflow) {
    checks.push(check("LAYOUT_OVERFLOW", "blocker", "内容超出纸张", `内容超出约 ${Number(context.overflow.overflowMm || 0).toFixed(1)} mm。`, context.overflow.firstPath || "", { type: "auto-fit" }, false));
  }
  const template = getTemplate(document.layout?.templateId);
  if (template.machineReadability === "caution") {
    checks.push(check("LAYOUT_TWO_COLUMN", "warning", "双栏阅读顺序风险", template.readabilityNote, "layout.templateId", { type: "choose-template" }));
  }
  const bullets = collectBullets(document);
  const long = bullets.filter(({ text }) => text.length > (/[^\x00-\xff]/.test(text) ? 140 : 220));
  if (long.length) {
    const first = long[0];
    checks.push(check("CONTENT_BULLET_LONG", "warning", "项目符号过长", `${long.length} 条超过当前语言的快速阅读阈值，建议拆分或精炼。`, first.path));
  }
  const repeatedVerbs = new Map();
  for (const item of bullets) {
    const verb = firstActionVerb(item.text);
    if (verb) repeatedVerbs.set(verb, [...(repeatedVerbs.get(verb) || []), item]);
  }
  const repeated = [...repeatedVerbs.entries()].filter(([, items]) => items.length >= 3).sort((left, right) => right[1].length - left[1].length);
  if (repeated.length) {
    const [verb, items] = repeated[0];
    checks.push(check("CONTENT_REPEATED_VERB", "warning", "开头动词重复", `“${verb}”连续用于 ${items.length} 条 Bullet，建议按实际动作区分。`, items[0].path));
  }
  const vague = bullets.filter(({ text }) => /^(?:负责|参与|协助|熟悉|了解|相关工作|responsible for\b|helped\b|assisted\b)/i.test(text));
  if (vague.length) checks.push(check("CONTENT_VAGUE_WORDING", "warning", "表达较空泛", `${vague.length} 条 Bullet 以职责或弱动作开头，建议说明个人行动。`, vague[0].path));
  const responsibilityOnly = vague.filter(({ text }) => !hasOutcomeSignal(text));
  if (responsibilityOnly.length) checks.push(check("CONTENT_RESPONSIBILITY_ONLY", "warning", "职责尚未转化为成果", `${responsibilityOnly.length} 条内容缺少可验证的交付、影响或结果。`, responsibilityOnly[0].path));
  const mixed = bullets.find(({ text }) => languageMixed(text));
  if (mixed) checks.push(check("CONTENT_LANGUAGE_MIXED", "info", "单条内容语言混用", "该 Bullet 同时包含较多中英文词语，请确认术语是否必要且风格一致。", mixed.path));
  const duplicates = duplicateBullets(bullets);
  if (duplicates.length) checks.push(check("CONTENT_DUPLICATE", "warning", "内容重复", `${duplicates.length} 条 Bullet 与其他内容完全重复。`, duplicates[0].duplicate.path));
  const missingDates = (document.sections || []).filter((section) => ["experience", "education", "projects"].includes(section.type))
    .flatMap((section) => (section.entries || []).filter((entry) => !entry.date?.trim()).map((entry) => ({ section, entry })));
  if (missingDates.length) {
    const first = missingDates[0];
    checks.push(check("CONTENT_DATE_MISSING", "warning", "经历缺少日期", `${missingDates.length} 个经历条目缺少日期。`, `sections.${first.section.id}.entries.${first.entry.id}.date`));
  }
  const datedEntries = (document.sections || []).filter((section) => ["experience", "education", "projects"].includes(section.type))
    .flatMap((section) => (section.entries || []).filter((entry) => entry.date?.trim()).map((entry) => ({ section, entry, range: parseDateRange(entry.date), style: dateStyle(entry.date) })));
  const invalidDate = datedEntries.find((item) => !item.range);
  if (invalidDate) checks.push(check("CONTENT_DATE_INVALID", "warning", "日期格式无法识别", `“${invalidDate.entry.date}”无法解析为明确起止时间。`, `sections.${invalidDate.section.id}.entries.${invalidDate.entry.id}.date`));
  const dateStyles = [...new Set(datedEntries.map((item) => item.style).filter(Boolean))];
  if (dateStyles.length > 1) checks.push(check("CONTENT_DATE_STYLE_MIXED", "info", "日期格式不一致", `当前同时使用${dateStyles.join("、")}。`, `sections.${datedEntries[0].section.id}.entries.${datedEntries[0].entry.id}.date`));
  const experienceRanges = datedEntries.filter((item) => item.section.type === "experience" && item.range);
  let overlap = null;
  for (let left = 0; left < experienceRanges.length && !overlap; left += 1) {
    for (let right = left + 1; right < experienceRanges.length; right += 1) {
      const a = experienceRanges[left];
      const b = experienceRanges[right];
      if (a.range.start <= b.range.end && b.range.start <= a.range.end) { overlap = [a, b]; break; }
    }
  }
  if (overlap) checks.push(check("CONTENT_DATE_OVERLAP", "info", "工作时间存在重叠", `“${overlap[0].entry.name || "经历一"}”与“${overlap[1].entry.name || "经历二"}”时间重叠，请确认是否为并行经历。`, `sections.${overlap[1].section.id}.entries.${overlap[1].entry.id}.date`));
  if (document.profile?.email?.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(document.profile.email.trim())) {
    checks.push(check("PROFILE_EMAIL_INVALID", "warning", "邮箱格式无效", "邮箱缺少有效的用户名、@ 或域名。", "profile.email"));
  }
  const invalidLink = ["website", "github"].find((key) => !validLink(document.profile?.[key]));
  if (invalidLink) checks.push(check("PROFILE_LINK_INVALID", "warning", "链接格式无效", `${invalidLink === "website" ? "个人网站" : "GitHub"}不是可识别的 HTTP(S) 或域名地址。`, `profile.${invalidLink}`));
  const evidenceText = (document.sections || []).filter((section) => ["experience", "projects"].includes(section.type))
    .flatMap((section) => section.entries || [])
    .flatMap((entry) => [entry.name, entry.role, entry.summary, ...(entry.bullets || []).map((bullet) => bullet.text)])
    .join(" ").toLowerCase();
  const unsupportedSkills = [...new Set(skillTokens(document))].filter((skill) => !evidenceText.includes(skill.toLowerCase()));
  if (unsupportedSkills.length) {
    checks.push(check("CONTENT_SKILL_UNSUPPORTED", "info", "技能缺少经历证据", `${unsupportedSkills.slice(0, 6).join("、")}尚未在工作或项目经历中直接出现。`, (document.sections || []).find((section) => section.type === "skills") ? `sections.${document.sections.find((section) => section.type === "skills").id}` : ""));
  }
  if (!(document.sections || []).some((section) => section.type === "experience")) {
    checks.push(check("CONTENT_EXPERIENCE_MISSING", "warning", "未识别工作经历", "社招岗位通常需要明确的工作经历栏目。"));
  }
  const unverified = context.application?.evidence?.filter((item) => item.verification === "unverified" && /\d/.test(`${item.scope} ${item.result}`)) || [];
  if (unverified.length) {
    checks.push(check("EVIDENCE_NUMBER_UNVERIFIED", "warning", "数字尚未核实", `${unverified.length} 条证据包含未核实数字，投递前请确认来源。`, `evidence.${unverified[0].id}`));
  }
  if (bullets.length && !bullets.some(({ text }) => hasOutcomeSignal(text))) {
    checks.push(check("CONTENT_OUTCOME_SIGNAL_MISSING", "info", "缺少明确成果信号", "当前 Bullet 未识别到数字、交付或影响表达，请核对是否只描述了过程。", bullets[0].path));
  }
  if (!checks.length) checks.push(check("READINESS_CLEAR", "info", "未发现阻断项", "当前确定性规则未发现硬错误。", "", null, true));
  return checks;
}

export function evaluateExportReadiness(checks, target = "pdf", confirmations = []) {
  const list = Array.isArray(checks) ? checks : [];
  const blockers = list.filter((item) => item.severity === "blocker");
  const warnings = list.filter((item) => item.severity === "warning");
  const confirmed = new Set(confirmations);
  const pendingWarnings = warnings.filter((item) => !confirmed.has(item.code));
  const enforced = target === "pdf";
  return {
    target,
    enforced,
    blockers,
    warnings,
    pendingWarnings,
    confirmations: [...confirmed],
    ready: !enforced || (blockers.length === 0 && pendingWarnings.length === 0),
  };
}

export const CHECK_SEVERITIES = Object.freeze({
  blocker: { label: "阻断", icon: "octagon-alert" },
  warning: { label: "警告", icon: "triangle-alert" },
  info: { label: "提示", icon: "circle-check" },
});
