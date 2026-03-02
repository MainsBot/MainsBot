export function normalizeKeywordText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[`'’]+/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function messageContainsKeywordPhrase(message, phrase, normalizedMessage = "") {
  const rawMessage = String(message || "").toLowerCase();
  const rawPhrase = String(phrase || "").toLowerCase().trim();
  if (!rawPhrase) return false;
  if (rawMessage.includes(rawPhrase)) return true;

  const normalizedPhrase = normalizeKeywordText(rawPhrase);
  if (!normalizedPhrase) return false;
  const normalized = normalizedMessage || normalizeKeywordText(rawMessage);
  return normalized.includes(normalizedPhrase);
}
