// Twitch OAuth + token store helpers
import fs from "fs";
import path from "path";
import fetch from "node-fetch";

const TOKEN_ENDPOINT = "https://id.twitch.tv/oauth2/token";
const VALIDATE_ENDPOINT = "https://id.twitch.tv/oauth2/validate";
const DEFAULT_TOKEN_STORE_PATH = path.resolve(
  process.cwd(),
  "secrets",
  "twitch_tokens.json"
);

export const TWITCH_ROLES = Object.freeze({
  BOT: "bot",
  STREAMER: "streamer",
});

const DEFAULT_BOT_SCOPES = [
  "user:read:chat",
  "user:write:chat",
  "user:bot",
  "moderator:manage:banned_users",
  "moderator:manage:chat_settings",
  "moderator:manage:announcements",
];

const DEFAULT_STREAMER_SCOPES = [
  "channel:manage:broadcast",
  "channel:manage:polls",
  "channel:read:polls",
  "channel:manage:redemptions",
  "channel:read:redemptions",
  "moderator:manage:banned_users",
  "moderator:manage:chat_settings",
  "moderator:read:moderators",
  "moderator:read:vips",
  "channel:bot",
];

function normalizeRole(value) {
  const role = String(value || "").trim().toLowerCase();
  if (role === TWITCH_ROLES.BOT || role === TWITCH_ROLES.STREAMER) {
    return role;
  }
  throw new Error(`Unsupported Twitch role: ${value}`);
}

function normalizeToken(value) {
  return String(value || "")
    .trim()
    .replace(/^oauth:/i, "")
    .replace(/^bearer\s+/i, "");
}

function parseScopes(value, fallback = []) {
  const raw = String(value || "").trim();
  if (!raw) return Array.from(fallback);

  return Array.from(
    new Set(
      raw
        .split(/[,\s]+/)
        .map((s) => s.trim())
        .filter(Boolean)
    )
  );
}

function safeJsonParse(text, fallback = null) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function ensureDirFor(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function withDefaults(raw) {
  const data = raw && typeof raw === "object" ? raw : {};
  return {
    bot:
      data.bot && typeof data.bot === "object" && !Array.isArray(data.bot)
        ? data.bot
        : {},
    streamer:
      data.streamer &&
      typeof data.streamer === "object" &&
      !Array.isArray(data.streamer)
        ? data.streamer
        : {},
  };
}

function cleanRoleRecord(record, fallback = {}) {
  const src = record && typeof record === "object" ? record : {};
  const scopesRaw = Array.isArray(src.scopes)
    ? src.scopes
    : Array.isArray(src.scope)
      ? src.scope
      : [];

  const accessToken = normalizeToken(src.access_token || src.accessToken || "");
  const refreshToken = normalizeToken(
    src.refresh_token || src.refreshToken || ""
  );
  const clientId = String(src.client_id || src.clientId || fallback.client_id || "").trim();
  const userId = String(src.user_id || src.userId || fallback.user_id || "").trim();
  const login = String(src.login || fallback.login || "").trim();
  const expiresAt = Number(src.expires_at || src.expiresAt || 0);
  const tokenType = String(src.token_type || src.tokenType || "bearer").trim();
  const scopes = Array.from(
    new Set(
      scopesRaw
        .map((s) => String(s || "").trim())
        .filter(Boolean)
    )
  );

  const cleaned = {
    access_token: accessToken || "",
    refresh_token: refreshToken || "",
    client_id: clientId || "",
    user_id: userId || "",
    login: login || "",
    token_type: tokenType || "bearer",
    scopes,
    updated_at: String(src.updated_at || src.updatedAt || "").trim() || null,
  };

  if (Number.isFinite(expiresAt) && expiresAt > 0) {
    cleaned.expires_at = Math.floor(expiresAt);
  } else {
    cleaned.expires_at = null;
  }

  return cleaned;
}

function requireRoleSettings(settings, role) {
  const normalized = normalizeRole(role);
  const roleSettings = settings?.roles?.[normalized];
  if (!roleSettings) {
    throw new Error(`Missing role settings for ${normalized}`);
  }
  return roleSettings;
}

async function requestToken(params) {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(params || {})) {
    if (value === undefined || value === null) continue;
    body.set(key, String(value));
  }

  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body,
  });

  const text = await response.text().catch(() => "");
  const json = safeJsonParse(text, null);

  if (!response.ok) {
    const errorMessage =
      json?.message ||
      json?.error_description ||
      text ||
      response.statusText ||
      "token request failed";
    throw new Error(`Twitch OAuth token error ${response.status}: ${errorMessage}`);
  }

  if (!json || typeof json !== "object" || !json.access_token) {
    throw new Error("Twitch OAuth token response missing access_token");
  }

  return json;
}

export async function validateAccessToken(accessToken) {
  const token = normalizeToken(accessToken);
  if (!token) throw new Error("Missing access token");

  const response = await fetch(VALIDATE_ENDPOINT, {
    headers: {
      Authorization: `OAuth ${token}`,
    },
  });

  const text = await response.text().catch(() => "");
  const json = safeJsonParse(text, null);

  if (!response.ok) {
    const errorMessage =
      json?.message || text || response.statusText || "validate failed";
    throw new Error(`Twitch validate error ${response.status}: ${errorMessage}`);
  }

  return json || {};
}

export function getTokenStorePath(env = process.env) {
  const raw = String(env?.TWITCH_TOKEN_STORE_PATH || "").trim();
  if (!raw) return DEFAULT_TOKEN_STORE_PATH;
  return path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw);
}

export function readTokenStore(tokenStorePath = getTokenStorePath()) {
  try {
    if (!fs.existsSync(tokenStorePath)) return withDefaults(null);
    const raw = fs.readFileSync(tokenStorePath, "utf8");
    const json = safeJsonParse(raw, null);
    return withDefaults(json);
  } catch {
    return withDefaults(null);
  }
}

export function writeTokenStore(data, tokenStorePath = getTokenStorePath()) {
  const normalized = withDefaults(data);
  ensureDirFor(tokenStorePath);
  fs.writeFileSync(tokenStorePath, JSON.stringify(normalized, null, 2), "utf8");
  return normalized;
}

export function getRoleRecord({
  role,
  settings = buildTwitchAuthSettings(),
  tokenStorePath = getTokenStorePath(),
} = {}) {
  const normalizedRole = normalizeRole(role);
  const roleSettings = requireRoleSettings(settings, normalizedRole);
  const store = readTokenStore(tokenStorePath);
  const stored = cleanRoleRecord(store[normalizedRole], {
    client_id: roleSettings.clientId,
    user_id: roleSettings.fallbackUserId,
    login: roleSettings.fallbackLogin,
  });
  return stored;
}

function shouldRefreshRecord(record, minTtlSec = 120) {
  if (!record?.refresh_token) return false;
  const expiresAt = Number(record?.expires_at || 0);
  if (!expiresAt) return true;

  const refreshBeforeMs = Math.max(0, Number(minTtlSec) || 0) * 1000;
  return Date.now() + refreshBeforeMs >= expiresAt;
}

function mergeTokenIntoRoleRecord({
  previous = {},
  roleSettings = {},
  tokenResponse = {},
  validateResponse = {},
} = {}) {
  const now = Date.now();
  const expiresInSec = Math.max(0, Number(tokenResponse?.expires_in || 0));
  const expiresAt = expiresInSec ? now + expiresInSec * 1000 : null;

  const scopes = Array.isArray(validateResponse?.scopes)
    ? validateResponse.scopes
    : Array.isArray(tokenResponse?.scope)
      ? tokenResponse.scope
      : Array.isArray(tokenResponse?.scopes)
        ? tokenResponse.scopes
        : previous?.scopes || [];

  return cleanRoleRecord(
    {
      ...previous,
      access_token: normalizeToken(tokenResponse?.access_token || ""),
      refresh_token: normalizeToken(
        tokenResponse?.refresh_token || previous?.refresh_token || ""
      ),
      token_type: tokenResponse?.token_type || previous?.token_type || "bearer",
      scopes,
      expires_at: expiresAt,
      client_id:
        validateResponse?.client_id ||
        previous?.client_id ||
        roleSettings?.clientId ||
        "",
      user_id:
        validateResponse?.user_id ||
        previous?.user_id ||
        roleSettings?.fallbackUserId ||
        "",
      login:
        validateResponse?.login ||
        previous?.login ||
        roleSettings?.fallbackLogin ||
        "",
      updated_at: new Date(now).toISOString(),
    },
    {
      client_id: roleSettings?.clientId || "",
      user_id: roleSettings?.fallbackUserId || "",
      login: roleSettings?.fallbackLogin || "",
    }
  );
}

export function buildTwitchAuthSettings(env = process.env) {
  const redirectUri = String(env.TWITCH_AUTH_REDIRECT_URI || "").trim();
  const forceVerify = /^(1|true|yes|on)$/i.test(
    String(env.TWITCH_AUTH_FORCE_VERIFY || "true").trim()
  );

  return {
    redirectUri,
    forceVerify,
    tokenStorePath: getTokenStorePath(env),
    roles: {
      bot: {
        clientId: String(
          env.CLIENT_ID ||
            env.TWITCH_BOT_CLIENT_ID ||
            env.TWITCH_CHAT_CLIENT_ID ||
            env.CHEEEZZ_BOT_CLIENT_ID ||
            env.MAINS_BOT_CLIENT_ID ||
            ""
        ).trim(),
        clientSecret: String(
          env.CLIENT_SECRET ||
            env.TWITCH_BOT_CLIENT_SECRET ||
            env.TWITCH_CLIENT_SECRET ||
            ""
        ).trim(),
        scopes: parseScopes(env.TWITCH_BOT_SCOPES, DEFAULT_BOT_SCOPES),
        fallbackAccessToken: normalizeToken(
          env.BOT_TOKEN || env.TWITCH_CHAT_TOKEN || env.BOT_OAUTH || ""
        ),
        fallbackUserId: String(
          env.TWITCH_CHAT_SENDER_ID || env.BOT_ID || ""
        ).trim(),
        fallbackLogin: String(env.BOT_NAME || "").trim(),
      },
      streamer: {
        clientId: String(
          env.CLIENT_ID ||
            env.TWITCH_STREAMER_CLIENT_ID ||
            env.MAINS_BOT_CLIENT_ID ||
            env.CHEEEZZ_BOT_CLIENT_ID ||
            ""
        ).trim(),
        clientSecret: String(
          env.CLIENT_SECRET ||
            env.TWITCH_STREAMER_CLIENT_SECRET ||
            env.TWITCH_CLIENT_SECRET ||
            ""
        ).trim(),
        scopes: parseScopes(env.TWITCH_STREAMER_SCOPES, DEFAULT_STREAMER_SCOPES),
        fallbackAccessToken: normalizeToken(
          env.STRAMER_TOKEN ||
            env.STREAMER_TOKEN ||
            env.TWITCH_STREAMER_TOKEN ||
            ""
        ),
        fallbackUserId: String(
          env.TWITCH_CHAT_BROADCASTER_ID || env.CHANNEL_ID || ""
        ).trim(),
        fallbackLogin: String(env.CHANNEL_NAME || "").trim(),
      },
    },
  };
}

export function buildAuthorizeUrl({
  role,
  settings = buildTwitchAuthSettings(),
  state,
} = {}) {
  const normalizedRole = normalizeRole(role);
  const roleSettings = requireRoleSettings(settings, normalizedRole);
  if (!roleSettings.clientId) {
    throw new Error(`Missing client id for ${normalizedRole}`);
  }
  if (!settings.redirectUri) {
    throw new Error("Missing TWITCH_AUTH_REDIRECT_URI");
  }
  if (!state) {
    throw new Error("Missing OAuth state");
  }

  const params = new URLSearchParams();
  params.set("response_type", "code");
  params.set("client_id", roleSettings.clientId);
  params.set("redirect_uri", settings.redirectUri);
  params.set("scope", roleSettings.scopes.join(" "));
  params.set("state", String(state));
  if (settings.forceVerify) {
    params.set("force_verify", "true");
  }

  return `https://id.twitch.tv/oauth2/authorize?${params.toString()}`;
}

export async function exchangeCodeForRole({
  role,
  code,
  settings = buildTwitchAuthSettings(),
  tokenStorePath = settings.tokenStorePath || getTokenStorePath(),
} = {}) {
  const normalizedRole = normalizeRole(role);
  const roleSettings = requireRoleSettings(settings, normalizedRole);

  if (!code) throw new Error("Missing authorization code");
  if (!roleSettings.clientId) {
    throw new Error(`Missing client id for ${normalizedRole}`);
  }
  if (!roleSettings.clientSecret) {
    throw new Error(`Missing client secret for ${normalizedRole}`);
  }
  if (!settings.redirectUri) {
    throw new Error("Missing TWITCH_AUTH_REDIRECT_URI");
  }

  const tokenResponse = await requestToken({
    client_id: roleSettings.clientId,
    client_secret: roleSettings.clientSecret,
    code,
    grant_type: "authorization_code",
    redirect_uri: settings.redirectUri,
  });

  const validateResponse = await validateAccessToken(
    tokenResponse.access_token
  ).catch(() => ({}));

  const store = readTokenStore(tokenStorePath);
  const previous = cleanRoleRecord(store[normalizedRole], {
    client_id: roleSettings.clientId,
    user_id: roleSettings.fallbackUserId,
    login: roleSettings.fallbackLogin,
  });
  const merged = mergeTokenIntoRoleRecord({
    previous,
    roleSettings,
    tokenResponse,
    validateResponse,
  });

  store[normalizedRole] = merged;
  writeTokenStore(store, tokenStorePath);
  return merged;
}

export async function refreshRoleToken({
  role,
  settings = buildTwitchAuthSettings(),
  tokenStorePath = settings.tokenStorePath || getTokenStorePath(),
} = {}) {
  const normalizedRole = normalizeRole(role);
  const roleSettings = requireRoleSettings(settings, normalizedRole);
  const store = readTokenStore(tokenStorePath);
  const current = cleanRoleRecord(store[normalizedRole], {
    client_id: roleSettings.clientId,
    user_id: roleSettings.fallbackUserId,
    login: roleSettings.fallbackLogin,
  });

  if (!current.refresh_token) {
    throw new Error(`No refresh token stored for ${normalizedRole}`);
  }
  if (!roleSettings.clientId) {
    throw new Error(`Missing client id for ${normalizedRole}`);
  }
  if (!roleSettings.clientSecret) {
    throw new Error(`Missing client secret for ${normalizedRole}`);
  }

  const tokenResponse = await requestToken({
    client_id: roleSettings.clientId,
    client_secret: roleSettings.clientSecret,
    refresh_token: current.refresh_token,
    grant_type: "refresh_token",
  });

  const validateResponse = await validateAccessToken(
    tokenResponse.access_token
  ).catch(() => ({}));

  const merged = mergeTokenIntoRoleRecord({
    previous: current,
    roleSettings,
    tokenResponse,
    validateResponse,
  });

  store[normalizedRole] = merged;
  writeTokenStore(store, tokenStorePath);
  return merged;
}

export async function getRoleAccessToken({
  role,
  settings = buildTwitchAuthSettings(),
  tokenStorePath = settings.tokenStorePath || getTokenStorePath(),
  minTtlSec = 120,
} = {}) {
  const normalizedRole = normalizeRole(role);
  const roleSettings = requireRoleSettings(settings, normalizedRole);
  let record = getRoleRecord({
    role: normalizedRole,
    settings,
    tokenStorePath,
  });

  if (record.access_token && shouldRefreshRecord(record, minTtlSec)) {
    try {
      record = await refreshRoleToken({
        role: normalizedRole,
        settings,
        tokenStorePath,
      });
    } catch {}
  }

  if (record.access_token) {
    return {
      role: normalizedRole,
      accessToken: record.access_token,
      refreshToken: record.refresh_token || "",
      clientId: record.client_id || roleSettings.clientId || "",
      userId: record.user_id || roleSettings.fallbackUserId || "",
      login: record.login || roleSettings.fallbackLogin || "",
      scopes: record.scopes || [],
      expiresAt: record.expires_at || null,
      source: "store",
    };
  }

  const fallback = normalizeToken(roleSettings.fallbackAccessToken || "");
  if (!fallback) {
    return null;
  }

  return {
    role: normalizedRole,
    accessToken: fallback,
    refreshToken: "",
    clientId: roleSettings.clientId || "",
    userId: roleSettings.fallbackUserId || "",
    login: roleSettings.fallbackLogin || "",
    scopes: roleSettings.scopes || [],
    expiresAt: null,
    source: "env_fallback",
  };
}

export function getRoleIdentity({
  role,
  settings = buildTwitchAuthSettings(),
  tokenStorePath = settings.tokenStorePath || getTokenStorePath(),
} = {}) {
  const normalizedRole = normalizeRole(role);
  const roleSettings = requireRoleSettings(settings, normalizedRole);
  const record = getRoleRecord({
    role: normalizedRole,
    settings,
    tokenStorePath,
  });

  return {
    role: normalizedRole,
    userId: record.user_id || roleSettings.fallbackUserId || "",
    login: record.login || roleSettings.fallbackLogin || "",
    clientId: record.client_id || roleSettings.clientId || "",
  };
}

export function getPublicTokenSnapshot({
  settings = buildTwitchAuthSettings(),
  tokenStorePath = settings.tokenStorePath || getTokenStorePath(),
} = {}) {
  const store = readTokenStore(tokenStorePath);

  const buildRoleSummary = (role) => {
    const normalizedRole = normalizeRole(role);
    const roleSettings = requireRoleSettings(settings, normalizedRole);
    const record = cleanRoleRecord(store[normalizedRole], {
      client_id: roleSettings.clientId,
      user_id: roleSettings.fallbackUserId,
      login: roleSettings.fallbackLogin,
    });

    const expiresAt = Number(record.expires_at || 0);
    const expiresInSec = expiresAt ? Math.floor((expiresAt - Date.now()) / 1000) : null;

    return {
      role: normalizedRole,
      login: record.login || null,
      userId: record.user_id || null,
      clientId: record.client_id || null,
      scopes: Array.isArray(record.scopes) ? record.scopes : [],
      hasAccessToken: Boolean(record.access_token),
      hasRefreshToken: Boolean(record.refresh_token),
      expiresAt: expiresAt || null,
      expiresInSec,
      updatedAt: record.updated_at || null,
      fallbackConfigured: Boolean(roleSettings.fallbackAccessToken),
    };
  };

  return {
    tokenStorePath,
    redirectUri: settings.redirectUri || null,
    forceVerify: !!settings.forceVerify,
    bot: buildRoleSummary(TWITCH_ROLES.BOT),
    streamer: buildRoleSummary(TWITCH_ROLES.STREAMER),
  };
}
