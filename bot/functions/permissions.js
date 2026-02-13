// Centralized permission helpers for chat moderation/admin checks
function normalizeLogin(value) {
  const raw = String(value ?? "")
    .trim()
    .replace(/^[@#]+/, "")
    .toLowerCase();
  if (!raw) return "";
  // Twitch logins are [a-z0-9_], but be tolerant.
  return raw.replace(/[^a-z0-9_]/g, "");
}

function parseLoginList(value) {
  return String(value ?? "")
    .split(/[,\s]+/)
    .map((s) => normalizeLogin(s))
    .filter(Boolean);
}

function envOwnerUserId() {
  return String(process.env.WEB_OWNER_USER_ID || process.env.ADMIN_ID || "").trim();
}

function envOwnerLogin() {
  return normalizeLogin(process.env.WEB_OWNER_LOGIN || "");
}

function envAllowedUsers() {
  return new Set(parseLoginList(process.env.WEB_ALLOWED_USERS || ""));
}

export function getChatPerms(userstate, { channelLogin = "" } = {}) {
  const login = normalizeLogin(userstate?.username || userstate?.login || "");
  const userId = String(userstate?.["user-id"] || userstate?.userId || "").trim();

  const ownerUserId = envOwnerUserId();
  const ownerLogin = envOwnerLogin();
  const allowed = envAllowedUsers();

  const isMod = userstate?.mod === true || userstate?.mod === 1 || userstate?.mod === "1";

  const badgeBroadcaster = userstate?.badges?.broadcaster === "1";
  const byChannelLogin = normalizeLogin(channelLogin) && login === normalizeLogin(channelLogin);
  const isBroadcaster = Boolean(badgeBroadcaster || byChannelLogin);

  const isAdmin =
    (ownerUserId && userId && userId === ownerUserId) ||
    (ownerLogin && login && login === ownerLogin);

  const isAllowed = Boolean(login && allowed.size > 0 && allowed.has(login));
  const isPermitted = Boolean(isAdmin || isAllowed || isMod || isBroadcaster);

  return {
    login,
    userId,
    isAdmin,
    isAllowed,
    isMod,
    isBroadcaster,
    isPermitted,
  };
}

export { normalizeLogin };
