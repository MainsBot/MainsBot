// Web admin (Twitch OAuth) session helpers
import { createHmac, timingSafeEqual } from "crypto";
import fetch from "node-fetch";

const AUTHORIZE_ENDPOINT = "https://id.twitch.tv/oauth2/authorize";
const TOKEN_ENDPOINT = "https://id.twitch.tv/oauth2/token";
const VALIDATE_ENDPOINT = "https://id.twitch.tv/oauth2/validate";

const COOKIE_NAME = "mainsbot_admin";
const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function base64urlEncode(buf) {
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(String(buf || ""), "utf8");
  return b
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64urlDecode(text) {
  const s = String(text || "").trim().replace(/-/g, "+").replace(/_/g, "/");
  const pad = s.length % 4 ? "=".repeat(4 - (s.length % 4)) : "";
  return Buffer.from(s + pad, "base64");
}

function safeJsonParse(text, fallback = null) {
  try {
    return JSON.parse(String(text ?? ""));
  } catch {
    return fallback;
  }
}

function normalizeList(value) {
  return String(value || "")
    .split(/[,\s]+/)
    .map((s) => String(s || "").trim().toLowerCase())
    .filter(Boolean);
}

function parseCookies(req) {
  const header = String(req?.headers?.cookie || "");
  const out = Object.create(null);
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (!k) continue;
    out[k] = v;
  }
  return out;
}

function buildSetCookie({
  name,
  value,
  maxAgeSec,
  httpOnly = true,
  secure = false,
  sameSite = "Lax",
  path = "/",
} = {}) {
  const parts = [`${name}=${value}`];
  if (typeof maxAgeSec === "number") parts.push(`Max-Age=${Math.max(0, Math.floor(maxAgeSec))}`);
  if (path) parts.push(`Path=${path}`);
  if (httpOnly) parts.push("HttpOnly");
  if (secure) parts.push("Secure");
  if (sameSite) parts.push(`SameSite=${sameSite}`);
  return parts.join("; ");
}

async function requestToken({ clientId, clientSecret, code, redirectUri }) {
  const body = new URLSearchParams();
  body.set("client_id", String(clientId || ""));
  body.set("client_secret", String(clientSecret || ""));
  body.set("code", String(code || ""));
  body.set("grant_type", "authorization_code");
  body.set("redirect_uri", String(redirectUri || ""));

  const resp = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });

  const text = await resp.text().catch(() => "");
  const json = safeJsonParse(text, null);
  if (!resp.ok) {
    const msg = json?.message || json?.error_description || text || resp.statusText;
    throw new Error(`Twitch token error ${resp.status}: ${msg}`);
  }
  if (!json?.access_token) throw new Error("Twitch token response missing access_token");
  return json;
}

async function validateToken(accessToken) {
  const token = String(accessToken || "")
    .trim()
    .replace(/^oauth:/i, "")
    .replace(/^bearer\\s+/i, "");
  if (!token) throw new Error("Missing access token");

  const resp = await fetch(VALIDATE_ENDPOINT, {
    headers: { Authorization: `OAuth ${token}` },
  });
  const text = await resp.text().catch(() => "");
  const json = safeJsonParse(text, null);
  if (!resp.ok) {
    const msg = json?.message || text || resp.statusText;
    throw new Error(`Twitch validate error ${resp.status}: ${msg}`);
  }
  return json || {};
}

export function createWebAdminAuth({
  cookieSecret,
  ownerUserId = "",
  ownerLogin = "",
  allowedUsers = "",
  clientId,
  clientSecret,
  forceVerify = false,
  ttlMs = DEFAULT_TTL_MS,
} = {}) {
  const secret = String(cookieSecret || "").trim();
  const ownerId = String(ownerUserId || "").trim();
  const owner = String(ownerLogin || "").trim().toLowerCase();
  const allow = new Set(normalizeList(allowedUsers));

  function sign(payloadText) {
    return createHmac("sha256", secret).update(payloadText).digest();
  }

  function encodeSession({ userId, login, now = Date.now() } = {}) {
    if (!secret) throw new Error("WEB_COOKIE_SECRET is missing");
    const exp = now + Math.max(60_000, Number(ttlMs) || DEFAULT_TTL_MS);
    const session = arguments[0] && typeof arguments[0] === "object" ? arguments[0] : {};
    const extra = { ...session };
    delete extra.userId;
    delete extra.login;
    delete extra.now;

    const payload = {
      userId: String(userId || "").trim(),
      login: String(login || "").trim().toLowerCase(),
      iat: now,
      exp,
      ...extra,
    };
    const payloadText = JSON.stringify(payload);
    const payloadB64 = base64urlEncode(payloadText);
    const sigB64 = base64urlEncode(sign(payloadB64));
    return `${payloadB64}.${sigB64}`;
  }

  function decodeSession(token) {
    if (!secret) return null;
    const raw = String(token || "").trim();
    const idx = raw.lastIndexOf(".");
    if (idx === -1) return null;

    const payloadB64 = raw.slice(0, idx);
    const sigB64 = raw.slice(idx + 1);
    if (!payloadB64 || !sigB64) return null;

    const expected = sign(payloadB64);
    const provided = base64urlDecode(sigB64);
    if (provided.length !== expected.length) return null;
    if (!timingSafeEqual(provided, expected)) return null;

    const payloadText = base64urlDecode(payloadB64).toString("utf8");
    const payload = safeJsonParse(payloadText, null);
    if (!payload?.userId || !payload?.login) return null;
    if (Number(payload.exp || 0) <= Date.now()) return null;
    return payload;
  }

  function isAllowed(session) {
    if (!session?.userId || !session?.login) return false;
    if (ownerId && String(session.userId) === ownerId) return true;
    if (owner && String(session.login).toLowerCase() === owner) return true;
    if (allow.size === 0) return false;
    return allow.has(String(session.login).toLowerCase());
  }

  function readSession(req) {
    const cookies = parseCookies(req);
    return decodeSession(cookies[COOKIE_NAME]);
  }

  function setSessionCookie(res, session, { secure = false } = {}) {
    const token = encodeSession(session);
    const maxAgeSec = Math.floor(Math.max(1, Number(ttlMs) || DEFAULT_TTL_MS) / 1000);
    res.setHeader(
      "set-cookie",
      buildSetCookie({
        name: COOKIE_NAME,
        value: token,
        maxAgeSec,
        secure,
      })
    );
  }

  function clearSessionCookie(res, { secure = false } = {}) {
    res.setHeader(
      "set-cookie",
      buildSetCookie({
        name: COOKIE_NAME,
        value: "",
        maxAgeSec: 0,
        secure,
      })
    );
  }

  function buildLoginUrl({ redirectUri, state } = {}) {
    const cid = String(clientId || "").trim();
    if (!cid) throw new Error("Missing Twitch client id for web login (CLIENT_ID).");
    if (!redirectUri) throw new Error("Missing redirectUri for web login.");
    if (!state) throw new Error("Missing OAuth state.");

    const params = new URLSearchParams();
    params.set("response_type", "code");
    params.set("client_id", cid);
    params.set("redirect_uri", String(redirectUri));
    params.set("state", String(state));
    params.set("scope", "");
    if (forceVerify) params.set("force_verify", "true");
    return `${AUTHORIZE_ENDPOINT}?${params.toString()}`;
  }

  async function exchangeCode({ code, redirectUri } = {}) {
    const cid = String(clientId || "").trim();
    const csec = String(clientSecret || "").trim();
    if (!cid) throw new Error("Missing Twitch client id for web login (CLIENT_ID).");
    if (!csec) throw new Error("Missing Twitch client secret for web login (CLIENT_SECRET).");
    if (!redirectUri) throw new Error("Missing redirectUri for web login.");
    if (!code) throw new Error("Missing OAuth code.");

    const token = await requestToken({
      clientId: cid,
      clientSecret: csec,
      code,
      redirectUri,
    });
    const validated = await validateToken(token.access_token);
    return {
      userId: String(validated.user_id || "").trim(),
      login: String(validated.login || "").trim(),
    };
  }

  return {
    cookieName: COOKIE_NAME,
    buildLoginUrl,
    exchangeCode,
    readSession,
    setSessionCookie,
    clearSessionCookie,
    isAllowed,
  };
}
