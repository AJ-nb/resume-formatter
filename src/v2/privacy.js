export const STORAGE_PREFIX = "resume-formatter:";

const SENSITIVE_FIELD_NAMES = new Set([
  "apikey", "secret", "clientsecret", "password", "credential", "credentials", "authorization",
  "accesstoken", "refreshtoken", "authtoken", "bearertoken", "privatekey",
]);
const GENERIC_SECRET_PATTERNS = [
  /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi,
  /\bsk-[A-Za-z0-9_-]{16,}\b/g,
  /\bAIza[A-Za-z0-9_-]{20,}\b/g,
  /((?:api[-_ ]?key|access[-_ ]?token|refresh[-_ ]?token|authorization|password|secret)\s*[=:]\s*["']?)[^"',\s}]+/gi,
  /([?&](?:key|api_key|apikey|access_token)=)[^&#\s]+/gi,
  /https?:\/\/[^\s/@:]+:[^\s/@]+@/gi,
];

function replaceAllLiteral(source, value) {
  if (!value || value.length < 4) return source;
  return source.split(value).join("[REDACTED]");
}

function isSensitiveField(key) {
  const normalized = String(key || "").replace(/[^a-z0-9]/gi, "").toLowerCase();
  return SENSITIVE_FIELD_NAMES.has(normalized)
    || /(?:password|secret|credential)$/.test(normalized)
    || /^(?:access|refresh|auth|bearer)?token$/.test(normalized);
}

export function redactSensitiveText(value, secrets = []) {
  let result = String(value ?? "");
  for (const secret of secrets) result = replaceAllLiteral(result, String(secret || ""));
  for (const pattern of GENERIC_SECRET_PATTERNS) {
    result = result.replace(pattern, (match, prefix) => prefix ? `${prefix}[REDACTED]` : "[REDACTED]");
  }
  return result;
}

export function stripSensitiveData(value, { secrets = [] } = {}) {
  if (typeof value === "string") return redactSensitiveText(value, secrets);
  if (Array.isArray(value)) return value.map((item) => stripSensitiveData(item, { secrets }));
  if (!value || typeof value !== "object") return value;
  const result = {};
  for (const [key, child] of Object.entries(value)) {
    if (!isSensitiveField(key)) result[key] = stripSensitiveData(child, { secrets });
  }
  return result;
}

function storageKeys(storage) {
  const keys = [];
  if (!storage) return keys;
  for (let index = 0; index < Number(storage.length || 0); index += 1) {
    const key = storage.key(index);
    if (key) keys.push(key);
  }
  return keys;
}

export function clearResumeFormatterStorage(local = globalThis.localStorage, session = globalThis.sessionStorage) {
  const removed = { local: [], session: [] };
  for (const [storage, target] of [[local, removed.local], [session, removed.session]]) {
    try {
      for (const key of storageKeys(storage)) {
        if (key.startsWith(STORAGE_PREFIX)) {
          storage.removeItem(key);
          target.push(key);
        }
      }
    } catch { /* storage can be unavailable under file:// */ }
  }
  return removed;
}

export function createLocalDataInventory(workspace, versions = [], aiConfig = {}) {
  const documents = Object.values(workspace?.documents || {});
  const applications = Array.isArray(workspace?.applications) ? workspace.applications : [];
  const versionIds = new Set();
  for (const [source, items] of [["local", versions], ["master", workspace?.masterHistory]]) {
    if (!Array.isArray(items)) continue;
    items.forEach((item, index) => versionIds.add(item?.id ? String(item.id) : `${source}:${index}`));
  }
  return {
    documents: documents.length,
    applications: applications.length,
    assets: Object.keys(workspace?.assets || {}).length,
    versions: versionIds.size,
    jdCharacters: applications.reduce((sum, item) => sum + String(item.jdText || "").length, 0),
    evidence: applications.reduce((sum, item) => sum + (Array.isArray(item.evidence) ? item.evidence.length : 0), 0),
    hasCredential: Boolean(aiConfig?.apiKey),
  };
}
