export const FILTER_PERMIT_DEFAULT_MS = 60_000;

const permitByUser = new Map();

export function normalizePermitTarget(value) {
  return String(value || "")
    .trim()
    .replace(/^@+/, "")
    .replace(/[^a-z0-9_]/gi, "")
    .toLowerCase();
}

export function setTemporaryFilterPermit(username, ms = FILTER_PERMIT_DEFAULT_MS) {
  const normalized = normalizePermitTarget(username);
  if (!normalized) return 0;

  const expiresAt = Date.now() + Math.max(0, Number(ms) || 0);
  permitByUser.set(normalized, expiresAt);
  return expiresAt;
}

export function hasTemporaryFilterPermit(username, now = Date.now()) {
  const normalized = normalizePermitTarget(username);
  if (!normalized) return false;

  const expiresAt = Number(permitByUser.get(normalized) || 0);
  if (!expiresAt) return false;
  if (expiresAt <= now) {
    permitByUser.delete(normalized);
    return false;
  }
  return true;
}

export function clearTemporaryFilterPermit(username) {
  const normalized = normalizePermitTarget(username);
  if (!normalized) return false;
  return permitByUser.delete(normalized);
}

export function getTemporaryFilterPermitRemainingMs(username, now = Date.now()) {
  const normalized = normalizePermitTarget(username);
  if (!normalized) return 0;
  const expiresAt = Number(permitByUser.get(normalized) || 0);
  if (!expiresAt) return 0;
  return Math.max(0, expiresAt - now);
}

