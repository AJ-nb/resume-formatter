import { getTemplate, validateDocument } from "./contracts.js";

function check(code, severity, title, detail, fieldPath = "", fixAction = null, bypassable = severity !== "blocker") {
  return { code, severity, title, detail, fieldPath, fixAction, bypassable };
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
  const bullets = (document.sections || []).flatMap((section) => (section.entries || []).flatMap((entry) => (entry.bullets || []).map((bullet) => ({ bullet, section, entry }))));
  const long = bullets.filter(({ bullet }) => bullet.text.trim().length > 180);
  if (long.length) {
    const first = long[0];
    checks.push(check("CONTENT_BULLET_LONG", "warning", "项目符号过长", `${long.length} 条超过 180 字，建议拆分或精炼。`, `sections.${first.section.id}.entries.${first.entry.id}.bullets.${first.bullet.id}.text`));
  }
  const missingDates = (document.sections || []).filter((section) => ["experience", "education", "projects"].includes(section.type))
    .flatMap((section) => (section.entries || []).filter((entry) => !entry.date?.trim()).map((entry) => ({ section, entry })));
  if (missingDates.length) {
    const first = missingDates[0];
    checks.push(check("CONTENT_DATE_MISSING", "warning", "经历缺少日期", `${missingDates.length} 个经历条目缺少日期。`, `sections.${first.section.id}.entries.${first.entry.id}.date`));
  }
  if (!(document.sections || []).some((section) => section.type === "experience")) {
    checks.push(check("CONTENT_EXPERIENCE_MISSING", "warning", "未识别工作经历", "社招岗位通常需要明确的工作经历栏目。"));
  }
  const unverified = context.application?.evidence?.filter((item) => item.verification === "unverified" && /\d/.test(`${item.scope} ${item.result}`)) || [];
  if (unverified.length) {
    checks.push(check("EVIDENCE_NUMBER_UNVERIFIED", "warning", "数字尚未核实", `${unverified.length} 条证据包含未核实数字，投递前请确认来源。`, `evidence.${unverified[0].id}`));
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
