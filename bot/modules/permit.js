import {
  FILTER_PERMIT_DEFAULT_MS,
  normalizePermitTarget,
  setTemporaryFilterPermit,
} from "../functions/filterPermit.js";

export function tryHandlePermitCommand({ message, reply } = {}) {
  const raw = String(message || "").trim();
  const lower = raw.toLowerCase();
  if (!lower.startsWith("!permit")) return false;

  const rawTarget = raw
    .slice("!permit".length)
    .trim()
    .split(/\s+/)[0];
  const target = normalizePermitTarget(rawTarget);
  if (!target) {
    reply?.("Usage: !permit <username>");
    return true;
  }

  const expiresAt = setTemporaryFilterPermit(target, FILTER_PERMIT_DEFAULT_MS);
  const seconds = Math.max(1, Math.ceil((expiresAt - Date.now()) / 1000));
  reply?.(`@${target} is exempt from filters for ${seconds}s.`);
  return true;
}