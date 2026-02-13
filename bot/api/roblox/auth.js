// Roblox OAuth + token store helpers
import fs from "fs";
import path from "path";
import fetch from "node-fetch";

const AUTH_ENDPOINT = "https://apis.roblox.com/oauth/v1/authorize";
const TOKEN_ENDPOINT = "https://apis.roblox.com/oauth/v1/token";
const USERINFO_ENDPOINT = "https://apis.roblox.com/oauth/v1/userinfo";

const DEFAULT_TOKEN_STORE_PATH = path.resolve(
  process.cwd(),
  "secrets",
  "roblox_tokens.json"
);

const DEFAULT_SCOPES = ["openid", "profile"];

function normalizeToken(value) {
  return String(value || "")
    .trim()
    .replace(/^bearer\s+/i, "");
}

function parseScopes(value, fallback = DEFAULT_SCOPES) {
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
  };
}

function cleanBotRecord(record, settings = {}) {
  const src = record && typeof record === "object" ? record : {};
  const scopeRaw = Array.isArray(src.scopes)
    ? src.scopes
    : typeof src.scope === "string"
      ? src.scope.split(/[,\s]+/)
      : [];
  const expiresAt = Number(src.expires_at || src.expiresAt || 0);

  return {
    access_token: normalizeToken(src.access_token || src.accessToken || ""),
    refresh_token: normalizeToken(src.refresh_token || src.refreshToken || ""),
    token_type: String(src.token_type || src.tokenType || "Bearer").trim() || "Bearer",
    scopes: Array.from(
      new Set(
        scopeRaw
          .map((s) => String(s || "").trim())
          .filter(Boolean)
      )
    ),
    expires_at: Number.isFinite(expiresAt) && expiresAt > 0 ? Math.floor(expiresAt) : null,
    updated_at: String(src.updated_at || src.updatedAt || "").trim() || null,
    user_id:
      String(
        src.user_id ||
          src.userId ||
          src.sub ||
          src?.user?.sub ||
          settings.fallbackUserId ||
          ""
      ).trim() || "",
    login:
      String(
        src.login ||
          src.preferred_username ||
          src?.user?.preferred_username ||
          settings.fallbackLogin ||
          ""
      ).trim() || "",
    display_name:
      String(src.display_name || src.name || src?.user?.name || "").trim() || "",
    client_id: String(src.client_id || src.clientId || settings.clientId || "").trim() || "",
  };
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
    const message =
      json?.error_description ||
      json?.error ||
      text ||
      response.statusText ||
      "token request failed";
    throw new Error(`Roblox OAuth token error ${response.status}: ${message}`);
  }

  if (!json || typeof json !== "object" || !json.access_token) {
    throw new Error("Roblox OAuth token response missing access_token");
  }

  return json;
}

async function fetchUserInfo(accessToken) {
  const token = normalizeToken(accessToken);
  if (!token) return {};

  const response = await fetch(USERINFO_ENDPOINT, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const text = await response.text().catch(() => "");
  const json = safeJsonParse(text, null);
  if (!response.ok || !json || typeof json !== "object") {
    return {};
  }

  return json;
}

function shouldRefreshRecord(record, minTtlSec = 120) {
  if (!record?.refresh_token) return false;
  const expiresAt = Number(record?.expires_at || 0);
  if (!expiresAt) return true;

  const refreshBeforeMs = Math.max(0, Number(minTtlSec) || 0) * 1000;
  return Date.now() + refreshBeforeMs >= expiresAt;
}

function mergeTokenRecord({
  previous = {},
  settings = {},
  tokenResponse = {},
  userInfo = {},
} = {}) {
  const now = Date.now();
  const expiresInSec = Math.max(0, Number(tokenResponse?.expires_in || 0));
  const expiresAt = expiresInSec ? now + expiresInSec * 1000 : null;
  const scopes = parseScopes(
    tokenResponse?.scope ||
      tokenResponse?.scopes ||
      previous?.scopes ||
      settings?.scopes ||
      DEFAULT_SCOPES
  );

  return cleanBotRecord(
    {
      ...previous,
      access_token: normalizeToken(tokenResponse?.access_token || ""),
      refresh_token: normalizeToken(
        tokenResponse?.refresh_token || previous?.refresh_token || ""
      ),
      token_type: tokenResponse?.token_type || previous?.token_type || "Bearer",
      scopes,
      expires_at: expiresAt,
      updated_at: new Date(now).toISOString(),
      user_id:
        userInfo?.sub ||
        previous?.user_id ||
        settings?.fallbackUserId ||
        "",
      login:
        userInfo?.preferred_username ||
        previous?.login ||
        settings?.fallbackLogin ||
        "",
      display_name: userInfo?.name || previous?.display_name || "",
      client_id: settings?.clientId || previous?.client_id || "",
    },
    settings
  );
}

export function getRobloxTokenStorePath(env = process.env) {
  const raw = String(env?.ROBLOX_TOKEN_STORE_PATH || "").trim();
  if (!raw) return DEFAULT_TOKEN_STORE_PATH;
  return path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw);
}

export function readRobloxTokenStore(
  tokenStorePath = getRobloxTokenStorePath()
) {
  try {
    if (!fs.existsSync(tokenStorePath)) return withDefaults(null);
    const raw = fs.readFileSync(tokenStorePath, "utf8");
    const parsed = safeJsonParse(raw, null);
    return withDefaults(parsed);
  } catch {
    return withDefaults(null);
  }
}

export function writeRobloxTokenStore(
  data,
  tokenStorePath = getRobloxTokenStorePath()
) {
  const normalized = withDefaults(data);
  ensureDirFor(tokenStorePath);
  fs.writeFileSync(tokenStorePath, JSON.stringify(normalized, null, 2), "utf8");
  return normalized;
}

export function buildRobloxAuthSettings(env = process.env) {
  return {
    clientId: String(env.ROBLOX_CLIENT_ID || "").trim(),
    clientSecret: String(env.ROBLOX_CLIENT_SECRET || "").trim(),
    redirectUri: String(env.ROBLOX_AUTH_REDIRECT_URI || "").trim(),
    forceVerify: /^(1|true|yes|on)$/i.test(
      String(env.ROBLOX_AUTH_FORCE_VERIFY || "false").trim()
    ),
    scopes: parseScopes(env.ROBLOX_AUTH_SCOPES, DEFAULT_SCOPES),
    tokenStorePath: getRobloxTokenStorePath(env),
    fallbackAccessToken: normalizeToken(env.ROBLOX_ACCESS_TOKEN || ""),
    fallbackRefreshToken: normalizeToken(env.ROBLOX_REFRESH_TOKEN || ""),
    fallbackUserId: String(env.ROBLOX_BOT_USER_ID || "").trim(),
    fallbackLogin: String(env.ROBLOX_BOT_USERNAME || "").trim(),
  };
}

export function buildRobloxAuthorizeUrl({
  settings = buildRobloxAuthSettings(),
  state,
} = {}) {
  if (!settings.clientId) {
    throw new Error("Missing ROBLOX_CLIENT_ID");
  }
  if (!settings.redirectUri) {
    throw new Error("Missing ROBLOX_AUTH_REDIRECT_URI");
  }
  if (!state) {
    throw new Error("Missing OAuth state");
  }

  const params = new URLSearchParams();
  params.set("response_type", "code");
  params.set("client_id", settings.clientId);
  params.set("redirect_uri", settings.redirectUri);
  params.set("scope", settings.scopes.join(" "));
  params.set("state", String(state));
  if (settings.forceVerify) {
    params.set("prompt", "consent");
  }

  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

export async function exchangeRobloxCode({
  code,
  settings = buildRobloxAuthSettings(),
  tokenStorePath = settings.tokenStorePath || getRobloxTokenStorePath(),
} = {}) {
  if (!code) throw new Error("Missing authorization code");
  if (!settings.clientId) throw new Error("Missing ROBLOX_CLIENT_ID");
  if (!settings.clientSecret) throw new Error("Missing ROBLOX_CLIENT_SECRET");
  if (!settings.redirectUri) throw new Error("Missing ROBLOX_AUTH_REDIRECT_URI");

  const tokenResponse = await requestToken({
    grant_type: "authorization_code",
    code,
    client_id: settings.clientId,
    client_secret: settings.clientSecret,
    redirect_uri: settings.redirectUri,
  });

  const userInfo = await fetchUserInfo(tokenResponse.access_token);
  const store = readRobloxTokenStore(tokenStorePath);
  const previous = cleanBotRecord(store.bot, settings);
  const merged = mergeTokenRecord({
    previous,
    settings,
    tokenResponse,
    userInfo,
  });
  store.bot = merged;
  writeRobloxTokenStore(store, tokenStorePath);
  return merged;
}

export async function refreshRobloxToken({
  settings = buildRobloxAuthSettings(),
  tokenStorePath = settings.tokenStorePath || getRobloxTokenStorePath(),
} = {}) {
  const store = readRobloxTokenStore(tokenStorePath);
  const current = cleanBotRecord(store.bot, settings);

  const refreshToken =
    current.refresh_token || normalizeToken(settings.fallbackRefreshToken || "");
  if (!refreshToken) {
    throw new Error("No Roblox refresh token available");
  }
  if (!settings.clientId) throw new Error("Missing ROBLOX_CLIENT_ID");
  if (!settings.clientSecret) throw new Error("Missing ROBLOX_CLIENT_SECRET");

  const tokenResponse = await requestToken({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: settings.clientId,
    client_secret: settings.clientSecret,
  });

  const userInfo = await fetchUserInfo(tokenResponse.access_token);
  const merged = mergeTokenRecord({
    previous: current,
    settings,
    tokenResponse,
    userInfo,
  });
  store.bot = merged;
  writeRobloxTokenStore(store, tokenStorePath);
  return merged;
}

export async function getRobloxAccessToken({
  settings = buildRobloxAuthSettings(),
  tokenStorePath = settings.tokenStorePath || getRobloxTokenStorePath(),
  minTtlSec = 120,
} = {}) {
  let record = cleanBotRecord(readRobloxTokenStore(tokenStorePath).bot, settings);

  if (record.access_token && shouldRefreshRecord(record, minTtlSec)) {
    try {
      record = await refreshRobloxToken({ settings, tokenStorePath });
    } catch {}
  }

  if (record.access_token) {
    return {
      accessToken: record.access_token,
      refreshToken: record.refresh_token || "",
      userId: record.user_id || settings.fallbackUserId || "",
      login: record.login || settings.fallbackLogin || "",
      clientId: record.client_id || settings.clientId || "",
      scopes: Array.isArray(record.scopes) ? record.scopes : [],
      expiresAt: record.expires_at || null,
      source: "store",
    };
  }

  const fallback = normalizeToken(settings.fallbackAccessToken || "");
  if (!fallback) return null;

  return {
    accessToken: fallback,
    refreshToken: normalizeToken(settings.fallbackRefreshToken || ""),
    userId: settings.fallbackUserId || "",
    login: settings.fallbackLogin || "",
    clientId: settings.clientId || "",
    scopes: settings.scopes || [],
    expiresAt: null,
    source: "env_fallback",
  };
}

export function getPublicRobloxTokenSnapshot({
  settings = buildRobloxAuthSettings(),
  tokenStorePath = settings.tokenStorePath || getRobloxTokenStorePath(),
} = {}) {
  const record = cleanBotRecord(readRobloxTokenStore(tokenStorePath).bot, settings);
  const expiresAt = Number(record.expires_at || 0);
  const expiresInSec = expiresAt ? Math.floor((expiresAt - Date.now()) / 1000) : null;

  return {
    tokenStorePath,
    redirectUri: settings.redirectUri || null,
    clientId: settings.clientId || null,
    scopes: settings.scopes || [],
    bot: {
      login: record.login || null,
      userId: record.user_id || null,
      hasAccessToken: Boolean(record.access_token),
      hasRefreshToken: Boolean(record.refresh_token),
      expiresAt: expiresAt || null,
      expiresInSec,
      updatedAt: record.updated_at || null,
      fallbackConfigured: Boolean(settings.fallbackAccessToken),
    },
  };
}
