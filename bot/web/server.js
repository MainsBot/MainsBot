import fs from "fs";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import { createHash, randomBytes } from "crypto";

import * as sass from "sass";
import { minify as terserMinify } from "terser";
import CleanCSS from "clean-css";

import { flushStateNow } from "../../data/postgres/stateInterceptor.js";
import { createWebAdminAuth } from "../api/twitch/webAdmin.js";
import {
  TWITCH_ROLES,
  buildAuthorizeUrl,
  buildTwitchAuthSettings,
  exchangeCodeForRole,
  getPublicTokenSnapshot,
} from "../api/twitch/auth.js";
import {
  buildRobloxAuthSettings,
  buildRobloxAuthorizeUrl,
  exchangeRobloxCode,
  getPublicRobloxTokenSnapshot,
} from "../api/roblox/auth.js";
import {
  buildSpotifyAuthSettings,
  buildSpotifyAuthorizeUrl,
  exchangeSpotifyCode,
  getPublicSpotifyTokenSnapshot,
} from "../api/spotify/auth.js";

function flagFromEnv(value) {
  return /^(1|true|yes|on)$/i.test(String(value || "").trim());
}

export function startWebServer(deps = {}) {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const ROOT_DIR = path.resolve(__dirname, "..", "..");

  const WEB_DIR = path.join(ROOT_DIR, "web");
  const STATIC_DIR = path.join(WEB_DIR, "static");
  const GEN_DIR = path.join(STATIC_DIR, "gen");

  const WEB_PORT = Number(process.env.WEB_PORT || 8787);
  const WEB_HOST = String(process.env.WEB_HOST || "127.0.0.1").trim() || "127.0.0.1";
  const WEB_SOCKET_PATH = String(process.env.WEB_SOCKET_PATH || "").trim();
  const WEB_PUBLIC_URL = String(process.env.WEB_PUBLIC_URL || "").trim();

  const SCSS_PATH = path.join(STATIC_DIR, "style.scss");
  const CSS_PATH = path.join(STATIC_DIR, "style.css");
  const BASE_JS_PATH = path.join(STATIC_DIR, "base.js");
  const ERROR_PAGE_PATH = path.join(WEB_DIR, "error.html");

  const WEB_COOKIE_SECRET = String(process.env.WEB_COOKIE_SECRET || "").trim();
  const WEB_OWNER_USER_ID = String(process.env.WEB_OWNER_USER_ID || "").trim();
  const WEB_OWNER_LOGIN = String(process.env.WEB_OWNER_LOGIN || "").trim();
  const WEB_ALLOWED_USERS = String(process.env.WEB_ALLOWED_USERS || "").trim();
  const WEB_LOGIN_FORCE_VERIFY = flagFromEnv(
    process.env.WEB_LOGIN_FORCE_VERIFY || process.env.TWITCH_AUTH_FORCE_VERIFY || ""
  );

  const TWITCH_CHANNEL_ID = String(process.env.CHANNEL_ID || "").trim();
  const TWITCH_CHANNEL_NAME = String(process.env.CHANNEL_NAME || "")
    .trim()
    .toLowerCase();
  const TWITCH_BOT_ID = String(process.env.BOT_ID || "").trim();
  const TWITCH_BOT_NAME = String(process.env.BOT_NAME || "")
    .trim()
    .toLowerCase();

  const WEB_ADMIN_AUTH = createWebAdminAuth({
    cookieSecret: WEB_COOKIE_SECRET,
    ownerUserId: WEB_OWNER_USER_ID,
    ownerLogin: WEB_OWNER_LOGIN,
    allowedUsers: WEB_ALLOWED_USERS,
    clientId: String(process.env.CLIENT_ID || "").trim(),
    clientSecret: String(process.env.CLIENT_SECRET || "").trim(),
    forceVerify: WEB_LOGIN_FORCE_VERIFY,
  });

  function isAdminAllowedSession(session) {
    if (!session?.userId || !session?.login) return false;
    if (WEB_ADMIN_AUTH.isAllowed(session)) return true;

    // Also allow the configured streamer/bot accounts to access /admin and /auth flows
    // without needing to duplicate them in [web].allowed_users.
    const sessionUserId = String(session.userId || "").trim();
    const sessionLogin = String(session.login || "").trim().toLowerCase();

    if (TWITCH_CHANNEL_ID && sessionUserId === TWITCH_CHANNEL_ID) return true;
    if (TWITCH_BOT_ID && sessionUserId === TWITCH_BOT_ID) return true;
    if (TWITCH_CHANNEL_NAME && sessionLogin === TWITCH_CHANNEL_NAME) return true;
    if (TWITCH_BOT_NAME && sessionLogin === TWITCH_BOT_NAME) return true;

    return false;
  }

  let WEB_BUILD = null;
  const cssMinifier = new CleanCSS({ level: 2 });

if (!fs.existsSync(STATIC_DIR)) {
  fs.mkdirSync(STATIC_DIR, { recursive: true });
  console.log("[WEB] created static directory");
}

function compileScss() {
  try {
    console.log("[WEB] compiling scss...");
    console.log("[WEB] SCSS_PATH:", SCSS_PATH);
    console.log("[WEB] CSS_PATH :", CSS_PATH);

    // ensure dirs exist
    fs.mkdirSync(path.dirname(CSS_PATH), { recursive: true });

    if (!fs.existsSync(SCSS_PATH)) {
      console.error("[WEB] SCSS file not found:", SCSS_PATH);
      return;
    }

    const out = sass.compile(SCSS_PATH, { style: "compressed" });

    // out.css should be a string
    fs.writeFileSync(CSS_PATH, out.css, "utf8");

    const bytes = fs.statSync(CSS_PATH).size;
    console.log(`[WEB] SCSS compiled OK -> ${CSS_PATH} (${bytes} bytes)`);
    void buildWebAssets();
  } catch (e) {
    console.error("[WEB] SCSS compile failed:", e);
  }
}

compileScss();

// auto-recompile when scss changes
fs.watchFile(SCSS_PATH, { interval: 1200 }, compileScss);


function hashContent(content) {
  return createHash("sha1").update(content).digest("hex").slice(0, 8);
}

function minifyHtml(html) {
  if (typeof html !== "string") return "";
  return html
    .replace(/>\s+</g, "><")
    .trim();
}

function minifyCss(css, sourceLabel = "inline-css") {
  const input = String(css ?? "");
  if (!input.trim()) return "";

  try {
    const result = cssMinifier.minify(input);
    if (result?.errors?.length) {
      console.error(
        `[WEB] CSS minify failed (${sourceLabel}):`,
        result.errors.join(" | ")
      );
      return input.trim();
    }

    const output = String(result?.styles ?? "").trim();
    return output || input.trim();
  } catch (e) {
    console.error(`[WEB] CSS minify threw (${sourceLabel}):`, e);
    return input.trim();
  }
}

async function minifyJs(js, sourceLabel = "inline-js") {
  const input = String(js ?? "");
  if (!input.trim()) return "";

  try {
    const result = await terserMinify(input, {
      compress: true,
      mangle: false,
      format: { comments: false },
    });
    const output = String(result?.code ?? "").trim();
    return output || input.trim();
  } catch (e) {
    console.error(`[WEB] JS minify failed (${sourceLabel}):`, e);
    return input.trim();
  }
}

async function buildWebAssets() {
  try {
    if (!fs.existsSync(BASE_JS_PATH) || !fs.existsSync(CSS_PATH)) {
      return;
    }

    fs.mkdirSync(GEN_DIR, { recursive: true });

    const rawJs = fs.readFileSync(BASE_JS_PATH, "utf8");
    const rawCss = fs.readFileSync(CSS_PATH, "utf8");
    const js = await minifyJs(rawJs, BASE_JS_PATH);
    const css = minifyCss(rawCss, CSS_PATH);

    const jsFile = `base.${hashContent(js)}.js`;
    const cssFile = `style.${hashContent(css)}.css`;

    fs.writeFileSync(path.join(GEN_DIR, jsFile), js, "utf8");
    fs.writeFileSync(path.join(GEN_DIR, cssFile), css, "utf8");

    let html = fs.readFileSync(path.join(WEB_DIR, "index.html"), "utf8");
    html = html
      .replace(/href="[^"]*style[^"]*\.css"/, `href="/static/gen/${cssFile}"`)
      .replace(/src="[^"]*base[^"]*\.js"/, `src="/static/gen/${jsFile}"`);

    WEB_BUILD = { html: minifyHtml(html), jsFile, cssFile };
  } catch (e) {
    console.error("[WEB] build failed:", e);
  }
}

fs.watchFile(BASE_JS_PATH, { interval: 1200 }, () => {
  void buildWebAssets();
});
fs.watchFile(path.join(WEB_DIR, "index.html"), { interval: 1200 }, () => {
  void buildWebAssets();
});


// ---------- BOT STATUS (provided by app.js) ----------
function getStatusSnapshot() {
  try {
    return typeof deps.getStatusSnapshot === "function" ? deps.getStatusSnapshot() : {};
  } catch {
    return {};
  }
}

function escapeHtmlForErrorPage(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => {
    if (ch === "&") return "&amp;";
    if (ch === "<") return "&lt;";
    if (ch === ">") return "&gt;";
    if (ch === '"') return "&quot;";
    return "&#39;";
  });
}

function renderErrorPageHtml(statusCode, title, message) {
  const safeStatus = escapeHtmlForErrorPage(statusCode);
  const safeTitle = escapeHtmlForErrorPage(title || "Error");
  const safeMessage = escapeHtmlForErrorPage(
    message || "Something went wrong while loading this page."
  );

  try {
    const template = fs.readFileSync(ERROR_PAGE_PATH, "utf8");
    return minifyHtml(template
      .replace(/\{\{STATUS\}\}/g, safeStatus)
      .replace(/\{\{TITLE\}\}/g, safeTitle)
      .replace(/\{\{MESSAGE\}\}/g, safeMessage));
  } catch {}

  return minifyHtml(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${safeStatus} ${safeTitle}</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#120f06;color:#fff3d6;font-family:Segoe UI,Arial,sans-serif}.card{max-width:560px;margin:20px;padding:28px;border:1px solid rgba(255,196,80,.35);border-radius:16px;background:rgba(26,21,9,.92)}.status{font-size:12px;letter-spacing:.12em;color:#ffbd59;text-transform:uppercase}h1{margin:10px 0 8px;font-size:28px}p{margin:0;color:rgba(255,243,214,.8)}a{display:inline-block;margin-top:16px;color:#ffbd59;text-decoration:none}</style></head><body><main class="card"><div class="status">${safeStatus}</div><h1>${safeTitle}</h1><p>${safeMessage}</p><a href="/">Return Home</a></main></body></html>`);
}

function sendHtmlResponse(res, statusCode, html, extraHeaders = {}) {
  res.writeHead(Number(statusCode) || 200, {
    "content-type": "text/html; charset=utf-8",
    ...extraHeaders,
  });
  return res.end(minifyHtml(html));
}

function sendJsonResponse(res, statusCode, data, extraHeaders = {}) {
  res.writeHead(Number(statusCode) || 200, {
    "content-type": "application/json; charset=utf-8",
    ...extraHeaders,
  });
  return res.end(JSON.stringify(data ?? null));
}

function safeJsonParse(text, fallback = null) {
  try {
    return JSON.parse(String(text ?? ""));
  } catch {
    return fallback;
  }
}

function abs(p) {
  const raw = String(p || "").trim();
  if (!raw) return "";
  return path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw);
}

function resolveEnvPath(envName, fallbackRel) {
  const raw = String(process.env[envName] || "").trim();
  return abs(raw) || abs(fallbackRel);
}

const SETTINGS_FILE_PATH = resolveEnvPath("SETTINGS_PATH", "./SETTINGS.json");
const QUOTES_FILE_PATH = resolveEnvPath("QUOTES_PATH", "./QUOTES.json");

function normalizeQuotesData(raw) {
  const base =
    Array.isArray(raw)
      ? { quotes: raw }
      : raw && typeof raw === "object"
        ? raw
        : {};

  const inputQuotes = Array.isArray(base.quotes) ? base.quotes : [];
  const quotes = [];

  for (const q of inputQuotes) {
    const id = Number(q?.id);
    const text = String(q?.text ?? q?.quote ?? "").replace(/[\r\n]+/g, " ").trim();
    if (!Number.isInteger(id) || id <= 0) continue;
    if (!text) continue;
    quotes.push({
      id,
      text,
      addedBy: String(q?.addedBy || q?.added_by || "").trim(),
      addedAt: String(q?.addedAt || q?.added_at || "").trim(),
    });
  }

  quotes.sort((a, b) => a.id - b.id);

  let nextId = Number(base.nextId || base.next_id || 0);
  if (!Number.isInteger(nextId) || nextId <= 0) {
    const maxId = quotes.reduce((m, q) => Math.max(m, Number(q.id) || 0), 0);
    nextId = maxId + 1;
  }

  return { nextId, quotes };
}

function loadQuotes() {
  try {
    if (!QUOTES_FILE_PATH) return normalizeQuotesData({});
    if (!fs.existsSync(QUOTES_FILE_PATH)) {
      const seeded = normalizeQuotesData({ quotes: [], nextId: 1 });
      fs.mkdirSync(path.dirname(QUOTES_FILE_PATH), { recursive: true });
      fs.writeFileSync(QUOTES_FILE_PATH, JSON.stringify(seeded, null, 2), "utf8");
      return seeded;
    }
    const text = fs.readFileSync(QUOTES_FILE_PATH, "utf8");
    const parsed = safeJsonParse(text, null);
    return normalizeQuotesData(parsed);
  } catch (e) {
    console.warn("[quotes] load failed:", String(e?.message || e));
    return normalizeQuotesData({});
  }
}

function saveQuotes(next) {
  const normalized = normalizeQuotesData(next);
  try {
    fs.mkdirSync(path.dirname(QUOTES_FILE_PATH), { recursive: true });
    fs.writeFileSync(QUOTES_FILE_PATH, JSON.stringify(normalized, null, 2), "utf8");
    // flush state backend if needed (noop in file backend; safe in postgres)
    void flushStateNow();
  } catch (e) {
    console.error("[quotes] save failed:", e);
    throw e;
  }
  return normalized;
}

function readRequestBodyText(req, { limitBytes = 1024 * 1024 } = {}) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;

    req.on("data", (chunk) => {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += buf.length;
      if (total > limitBytes) {
        reject(new Error("Request body too large."));
        req.destroy();
        return;
      }
      chunks.push(buf);
    });

    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

async function readJsonBody(req, { limitBytes = 1024 * 1024 } = {}) {
  const contentType = String(req?.headers?.["content-type"] || "")
    .split(";")[0]
    .trim()
    .toLowerCase();

  if (contentType !== "application/json") {
    throw new Error("Content-Type must be application/json.");
  }

  const text = await readRequestBodyText(req, { limitBytes });
  const json = safeJsonParse(text, null);
  if (!json || typeof json !== "object") throw new Error("Invalid JSON body.");
  return json;
}

function sendCssResponse(res, statusCode, css, sourceLabel = "inline-css", extraHeaders = {}) {
  res.writeHead(Number(statusCode) || 200, {
    "content-type": "text/css; charset=utf-8",
    ...extraHeaders,
  });
  return res.end(minifyCss(css, sourceLabel));
}

async function sendJsResponse(
  res,
  statusCode,
  js,
  sourceLabel = "inline-js",
  extraHeaders = {}
) {
  const output = await minifyJs(js, sourceLabel);
  res.writeHead(Number(statusCode) || 200, {
    "content-type": "text/javascript; charset=utf-8",
    ...extraHeaders,
  });
  return res.end(output);
}

function sendErrorPage(res, statusCode, title, message) {
  return sendHtmlResponse(res, statusCode, renderErrorPageHtml(statusCode, title, message), {
    "cache-control": "no-store",
  });
}

const AUTH_STATE_TTL_MS = 10 * 60 * 1000;
const oauthStateStore = new Map();

function pruneOAuthStateStore(now = Date.now()) {
  for (const [key, meta] of oauthStateStore.entries()) {
    const createdAt = Number(meta?.createdAt || 0);
    if (!createdAt || now - createdAt > AUTH_STATE_TTL_MS) {
      oauthStateStore.delete(key);
    }
  }
}

function createOAuthState(role, provider = "twitch") {
  let extra = null;
  if (arguments.length >= 3) extra = arguments[2];
  pruneOAuthStateStore();
  const token = randomBytes(24).toString("hex");
  const record = {
    role: String(role || "").toLowerCase(),
    provider: String(provider || "twitch").toLowerCase(),
    createdAt: Date.now(),
  };
  if (extra && typeof extra === "object") {
    for (const [k, v] of Object.entries(extra)) {
      if (!k) continue;
      if (k === "role" || k === "provider" || k === "createdAt") continue;
      record[k] = v;
    }
  }
  oauthStateStore.set(token, record);
  return token;
}

function consumeOAuthState(token) {
  pruneOAuthStateStore();
  const key = String(token || "").trim();
  if (!key) return null;

  const value = oauthStateStore.get(key);
  oauthStateStore.delete(key);
  if (!value) return null;

  const createdAt = Number(value.createdAt || 0);
  if (!createdAt || Date.now() - createdAt > AUTH_STATE_TTL_MS) {
    return null;
  }

  return value;
}

function getRequestOrigin(req) {
  const forcedOriginRaw = String(
    process.env.WEB_ORIGIN ||
      process.env.WEB_BASE_URL ||
      ""
  ).trim();
  if (forcedOriginRaw) {
    try {
      const u = new URL(forcedOriginRaw);
      return `${u.protocol}//${u.host}`;
    } catch {}
  }

  const forwardedHost = String(req?.headers?.["x-forwarded-host"] || "")
    .split(",")[0]
    .trim();
  const host = String(
    forwardedHost || req?.headers?.host || `127.0.0.1:${WEB_PORT}`
  ).trim();
  const forwardedProto = String(req?.headers?.["x-forwarded-proto"] || "")
    .split(",")[0]
    .trim()
    .toLowerCase();
  const proto = forwardedProto || (req?.socket?.encrypted ? "https" : "http");
  return `${proto}://${host}`;
}

function isLocalAuthHost(hostname) {
  const value = String(hostname || "").trim().toLowerCase();
  return (
    value === "localhost" ||
    value === "127.0.0.1" ||
    value === "::1" ||
    value.endsWith(".localhost")
  );
}

function sanitizeNextPath(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  // Only allow absolute paths on this server.
  if (!raw.startsWith("/")) return "";
  // Disallow protocol-relative or weird URLs.
  if (raw.startsWith("//")) return "";
  // Basic cleanup.
  return raw.replace(/\s/g, "");
}

function buildAuthSettingsForRequest(req) {
  const settings = buildTwitchAuthSettings();
  const requestOrigin = getRequestOrigin(req);
  let requestHost = "";
  try {
    requestHost = new URL(requestOrigin).hostname;
  } catch {}

  const forceDynamicRedirect = flagFromEnv(
    process.env.TWITCH_AUTH_DYNAMIC_REDIRECT
  );

  if (
    !settings.redirectUri ||
    forceDynamicRedirect
  ) {
    settings.redirectUri = `${requestOrigin}/auth/callback`;
  }
  return settings;
}

function buildRobloxAuthSettingsForRequest(req) {
  const settings = buildRobloxAuthSettings();
  const requestOrigin = getRequestOrigin(req);
  let requestHost = "";
  try {
    requestHost = new URL(requestOrigin).hostname;
  } catch {}

  const forceDynamicRedirect = flagFromEnv(
    process.env.ROBLOX_AUTH_DYNAMIC_REDIRECT
  );

  if (
    !settings.redirectUri ||
    forceDynamicRedirect
  ) {
    // Roblox apps often have pre-approved redirect URIs; default to the Roblox-specific callback.
    settings.redirectUri = `${requestOrigin}/auth/roblox/callback`;
  }
  return settings;
}

function buildSpotifyAuthSettingsForRequest(req) {
  const settings = buildSpotifyAuthSettings();
  const requestOrigin = getRequestOrigin(req);
  let requestHost = "";
  try {
    requestHost = new URL(requestOrigin).hostname;
  } catch {}

  if (
    !settings.redirectUri ||
    settings.forceDynamicRedirect
  ) {
    // Prefer a single shared callback endpoint.
    settings.redirectUri = `${requestOrigin}/auth/callback`;
  }
  return settings;
}

function sendRedirect(res, location, statusCode = 302) {
  res.writeHead(Number(statusCode) || 302, {
    location: String(location || "/"),
    "cache-control": "no-store",
  });
  return res.end();
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => {
    if (ch === "&") return "&amp;";
    if (ch === "<") return "&lt;";
    if (ch === ">") return "&gt;";
    if (ch === '"') return "&quot;";
    return "&#39;";
  });
}

function renderAuthLandingHtml({ settings, snapshot }) {
  const redirectUri = escapeHtml(settings?.redirectUri || "not_set");
  const tokenPath = escapeHtml(snapshot?.tokenStorePath || "secrets/twitch_tokens.json");
  const botStatus = snapshot?.bot?.hasAccessToken ? "Connected" : "Not Connected";
  const streamerStatus = snapshot?.streamer?.hasAccessToken ? "Connected" : "Not Connected";

  return `<!doctype html>
  <html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Twitch Auth | MainsBot</title>
    <style>
      :root{--bg0:#0b0a06;--bg1:#141108;--panel:rgba(26,21,9,.92);--border:rgba(255,196,80,.35);--text:#fff3d6;--muted:rgba(255,243,214,.72);--accent:#ffbd59}
      *{box-sizing:border-box} body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;color:var(--text);font-family:"Segoe UI",Arial,sans-serif;background:radial-gradient(900px 550px at 20% 0%,rgba(255,196,80,.14),transparent 60%),radial-gradient(700px 420px at 80% 100%,rgba(255,140,40,.14),transparent 60%),linear-gradient(180deg,var(--bg1),var(--bg0))}
      .card{width:min(760px,100%);border-radius:18px;border:1px solid var(--border);background:var(--panel);padding:26px;box-shadow:0 18px 48px rgba(0,0,0,.42)}
      h1{margin:0 0 8px;font-size:34px;line-height:1.05} p{margin:0;color:var(--muted);line-height:1.45}
      .meta{margin-top:14px;font-size:14px;color:var(--muted)}
      .row{margin-top:18px;display:flex;flex-wrap:wrap;gap:10px}
      .btn{display:inline-block;padding:10px 14px;border-radius:10px;background:rgba(255,189,89,.16);border:1px solid rgba(255,189,89,.35);color:var(--accent);font-weight:700;text-decoration:none}
      .status{margin-top:16px;display:grid;gap:8px}
      code{font-family:Consolas,Monaco,monospace}
      .ok{color:#b8f7c0}
      .warn{color:#ffcf8a}
    </style>
  </head>
  <body>
    <main class="card">
      <h1>Twitch OAuth</h1>
      <p>Authorize bot and streamer accounts, then tokens are stored in <code>${tokenPath}</code>.</p>
      <div class="meta">Redirect URI in use: <code>${redirectUri}</code></div>
      <div class="status">
        <div>Bot: <span class="${botStatus === "Connected" ? "ok" : "warn"}">${escapeHtml(botStatus)}</span></div>
        <div>Streamer: <span class="${streamerStatus === "Connected" ? "ok" : "warn"}">${escapeHtml(streamerStatus)}</span></div>
      </div>
      <div class="row">
        <a class="btn" href="/auth/bot">Connect Bot</a>
        <a class="btn" href="/auth/streamer">Connect Streamer</a>
        <a class="btn" href="/auth/success">View Auth Status</a>
        <a class="btn" href="/auth/roblox">Roblox OAuth</a>
        <a class="btn" href="/auth/spotify">Spotify OAuth</a>
      </div>
    </main>
  </body>
  </html>`;
}

function renderAuthSuccessHtml({ role = "", login = "", snapshot }) {
  const roleText = escapeHtml(role || "unknown");
  const loginText = escapeHtml(login || "unknown");
  const redirectUri = escapeHtml(snapshot?.redirectUri || "not_set");
  const tokenPath = escapeHtml(snapshot?.tokenStorePath || "secrets/twitch_tokens.json");
  const botStatus = snapshot?.bot?.hasAccessToken ? "Connected" : "Not Connected";
  const streamerStatus = snapshot?.streamer?.hasAccessToken ? "Connected" : "Not Connected";

  return `<!doctype html>
  <html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Auth Success | MainsBot</title>
    <style>
      :root{--bg0:#0b0a06;--bg1:#141108;--panel:rgba(26,21,9,.92);--border:rgba(255,196,80,.35);--text:#fff3d6;--muted:rgba(255,243,214,.72);--accent:#ffbd59}
      *{box-sizing:border-box} body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;color:var(--text);font-family:"Segoe UI",Arial,sans-serif;background:radial-gradient(900px 550px at 20% 0%,rgba(255,196,80,.14),transparent 60%),radial-gradient(700px 420px at 80% 100%,rgba(255,140,40,.14),transparent 60%),linear-gradient(180deg,var(--bg1),var(--bg0))}
      .card{width:min(760px,100%);border-radius:18px;border:1px solid var(--border);background:var(--panel);padding:26px;box-shadow:0 18px 48px rgba(0,0,0,.42)}
      .pill{display:inline-block;padding:5px 11px;border-radius:999px;background:rgba(255,189,89,.16);color:var(--accent);font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}
      h1{margin:10px 0 8px;font-size:34px;line-height:1.05} p{margin:0;color:var(--muted);line-height:1.45}
      .meta{margin-top:14px;display:grid;gap:6px;font-size:14px;color:var(--muted)}
      .row{margin-top:18px;display:flex;flex-wrap:wrap;gap:10px}
      .btn{display:inline-block;padding:10px 14px;border-radius:10px;background:rgba(255,189,89,.16);border:1px solid rgba(255,189,89,.35);color:var(--accent);font-weight:700;text-decoration:none}
      code{font-family:Consolas,Monaco,monospace}
      .ok{color:#b8f7c0}
      .warn{color:#ffcf8a}
    </style>
  </head>
  <body>
    <main class="card">
      <div class="pill">OAuth Complete</div>
      <h1>${roleText} Connected</h1>
      <p>Authorized account: <strong>${loginText}</strong>.</p>
      <div class="meta">
        <div>Bot: <span class="${botStatus === "Connected" ? "ok" : "warn"}">${escapeHtml(botStatus)}</span></div>
        <div>Streamer: <span class="${streamerStatus === "Connected" ? "ok" : "warn"}">${escapeHtml(streamerStatus)}</span></div>
        <div>Token store: <code>${tokenPath}</code></div>
        <div>Redirect URI: <code>${redirectUri}</code></div>
      </div>
      <div class="row">
        <a class="btn" href="/auth">Back To Auth</a>
        <a class="btn" href="/">Return Home</a>
      </div>
    </main>
  </body>
  </html>`;
}

function renderUnifiedAuthSuccessHtml({
  provider = "",
  role = "",
  login = "",
  twitchSnapshot,
  robloxSnapshot,
  spotifySnapshot,
} = {}) {
  const p = String(provider || "").trim().toLowerCase();
  const roleText = escapeHtml(role || "");
  const loginText = escapeHtml(login || "");

  const twitchTokenPath = escapeHtml(twitchSnapshot?.tokenStorePath || "secrets/twitch_tokens.json");
  const twitchBotStatus = twitchSnapshot?.bot?.hasAccessToken ? "Connected" : "Not Connected";
  const twitchStreamerStatus = twitchSnapshot?.streamer?.hasAccessToken ? "Connected" : "Not Connected";

  const robloxTokenPath = escapeHtml(robloxSnapshot?.tokenStorePath || "secrets/roblox_tokens.json");
  const robloxStatus = robloxSnapshot?.bot?.hasAccessToken ? "Connected" : "Not Connected";
  const robloxLogin = escapeHtml(String(robloxSnapshot?.bot?.login || "").trim() || "");

  const spotifyTokenPath = escapeHtml(spotifySnapshot?.tokenStorePath || "secrets/spotify_tokens.json");
  const spotifyStatus = spotifySnapshot?.hasRefreshToken ? "Connected" : "Not Connected";

  const headline =
    p === "spotify"
      ? "Spotify connected"
      : p === "roblox"
        ? "Roblox connected"
        : p === "twitch"
          ? "Twitch connected"
          : p === "weblogin"
            ? "Logged in"
            : "Auth status";

  const detailLine =
    p === "twitch" && roleText
      ? `<div class="meta">Role: <code>${roleText}</code>${loginText ? ` | Login: <code>${loginText}</code>` : ""}</div>`
      : p === "roblox" && robloxLogin
        ? `<div class="meta">Roblox login: <code>${robloxLogin}</code></div>`
        : ``;

  return `<!doctype html>
  <html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Auth | MainsBot</title>
    <style>
      :root{--bg0:#0b0a06;--bg1:#141108;--panel:rgba(26,21,9,.92);--border:rgba(255,196,80,.35);--text:#fff3d6;--muted:rgba(255,243,214,.72);--accent:#ffbd59}
      *{box-sizing:border-box} body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;color:var(--text);font-family:"Segoe UI",Arial,sans-serif;background:radial-gradient(900px 550px at 20% 0%,rgba(255,196,80,.14),transparent 60%),radial-gradient(700px 420px at 80% 100%,rgba(255,140,40,.14),transparent 60%),linear-gradient(180deg,var(--bg1),var(--bg0))}
      .card{width:min(900px,100%);border-radius:18px;border:1px solid var(--border);background:var(--panel);padding:26px;box-shadow:0 18px 48px rgba(0,0,0,.42)}
      h1{margin:0 0 8px;font-size:34px;line-height:1.05} p{margin:0;color:var(--muted);line-height:1.45}
      .meta{margin-top:12px;font-size:14px;color:var(--muted)}
      .row{margin-top:18px;display:flex;flex-wrap:wrap;gap:10px}
      .btn{display:inline-block;padding:10px 14px;border-radius:10px;background:rgba(255,189,89,.16);border:1px solid rgba(255,189,89,.35);color:var(--accent);font-weight:700;text-decoration:none}
      .grid{margin-top:18px;display:grid;grid-template-columns:1fr;gap:12px}
      .panel{border:1px solid rgba(255,196,80,.18);border-radius:14px;padding:14px;background:rgba(9,8,4,.45)}
      .k{color:var(--muted)}
      .ok{color:#b8f7c0}
      .warn{color:#ffcf8a}
      code{font-family:Consolas,Monaco,monospace;color:var(--accent)}
    </style>
  </head>
  <body>
    <main class="card">
      <h1>${escapeHtml(headline)}</h1>
      ${detailLine}

      <div class="grid">
        <div class="panel">
          <div><span class="k">Twitch bot:</span> <span class="${twitchBotStatus === "Connected" ? "ok" : "warn"}">${escapeHtml(twitchBotStatus)}</span></div>
          <div><span class="k">Twitch streamer:</span> <span class="${twitchStreamerStatus === "Connected" ? "ok" : "warn"}">${escapeHtml(twitchStreamerStatus)}</span></div>
          <div class="meta">Token store: <code>${twitchTokenPath}</code></div>
          <div class="row">
            <a class="btn" href="/auth/twitch/bot">Link Twitch Bot</a>
            <a class="btn" href="/auth/twitch/streamer">Link Twitch Streamer</a>
          </div>
        </div>

        <div class="panel">
          <div><span class="k">Roblox:</span> <span class="${robloxStatus === "Connected" ? "ok" : "warn"}">${escapeHtml(robloxStatus)}</span>${robloxLogin ? ` ( <code>${robloxLogin}</code> )` : ""}</div>
          <div class="meta">Token store: <code>${robloxTokenPath}</code></div>
          <div class="row">
            <a class="btn" href="/auth/roblox">Link Roblox</a>
          </div>
        </div>

        <div class="panel">
          <div><span class="k">Spotify:</span> <span class="${spotifyStatus === "Connected" ? "ok" : "warn"}">${escapeHtml(spotifyStatus)}</span></div>
          <div class="meta">Token store: <code>${spotifyTokenPath}</code></div>
          <div class="row">
            <a class="btn" href="/auth/spotify">Link Spotify</a>
          </div>
        </div>
      </div>

      <div class="row">
        <a class="btn" href="/admin">Admin</a>
        <a class="btn" href="/">Home</a>
      </div>
    </main>
  </body>
  </html>`;
}

function renderRobloxAuthLandingHtml({ settings, snapshot }) {
  const redirectUri = escapeHtml(settings?.redirectUri || "not_set");
  const tokenPath = escapeHtml(snapshot?.tokenStorePath || "secrets/roblox_tokens.json");
  const status = snapshot?.bot?.hasAccessToken ? "Connected" : "Not Connected";
  const login = String(snapshot?.bot?.login || "").trim();
  const userId = String(snapshot?.bot?.userId || "").trim();
  const linkedAccount = escapeHtml(login || (userId ? `User ID ${userId}` : "Not linked"));
  const linkedUserId = escapeHtml(userId);

  return `<!doctype html>
  <html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Roblox Auth | MainsBot</title>
    <style>
      :root{--bg0:#0b0a06;--bg1:#141108;--panel:rgba(26,21,9,.92);--border:rgba(255,196,80,.35);--text:#fff3d6;--muted:rgba(255,243,214,.72);--accent:#ffbd59}
      *{box-sizing:border-box} body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;color:var(--text);font-family:"Segoe UI",Arial,sans-serif;background:radial-gradient(900px 550px at 20% 0%,rgba(255,196,80,.14),transparent 60%),radial-gradient(700px 420px at 80% 100%,rgba(255,140,40,.14),transparent 60%),linear-gradient(180deg,var(--bg1),var(--bg0))}
      .card{width:min(760px,100%);border-radius:18px;border:1px solid var(--border);background:var(--panel);padding:26px;box-shadow:0 18px 48px rgba(0,0,0,.42)}
      h1{margin:0 0 8px;font-size:34px;line-height:1.05} p{margin:0;color:var(--muted);line-height:1.45}
      .meta{margin-top:14px;font-size:14px;color:var(--muted)}
      .row{margin-top:18px;display:flex;flex-wrap:wrap;gap:10px}
      .btn{display:inline-block;padding:10px 14px;border-radius:10px;background:rgba(255,189,89,.16);border:1px solid rgba(255,189,89,.35);color:var(--accent);font-weight:700;text-decoration:none}
      .ok{color:#b8f7c0}
      .warn{color:#ffcf8a}
      code{font-family:Consolas,Monaco,monospace}
    </style>
  </head>
  <body>
    <main class="card">
      <h1>Roblox OAuth</h1>
      <p>Authorize the Roblox account, then tokens are stored in <code>${tokenPath}</code>.</p>
      <div class="meta">Redirect URI in use: <code>${redirectUri}</code></div>
      <div class="meta">Roblox account: <span class="${status === "Connected" ? "ok" : "warn"}">${escapeHtml(status)}</span></div>
      <div class="meta">Linked user: <strong>${linkedAccount}</strong>${userId ? ` (ID: <code>${linkedUserId}</code>)` : ""}</div>
      <div class="row">
        <a class="btn" href="/auth/roblox/bot">Connect Roblox Account</a>
        <a class="btn" href="/auth/roblox/success">View Roblox Auth Status</a>
        <a class="btn" href="/auth">Twitch Auth</a>
      </div>
    </main>
  </body>
  </html>`;
}

function renderRobloxAuthSuccessHtml({ login = "", snapshot }) {
  const rawLogin = String(login || snapshot?.bot?.login || "").trim();
  const rawUserId = String(snapshot?.bot?.userId || "").trim();
  const loginText = escapeHtml(rawLogin || (rawUserId ? `User ID ${rawUserId}` : "unknown"));
  const linkedUserId = escapeHtml(rawUserId);
  const redirectUri = escapeHtml(snapshot?.redirectUri || "not_set");
  const tokenPath = escapeHtml(snapshot?.tokenStorePath || "secrets/roblox_tokens.json");
  const status = snapshot?.bot?.hasAccessToken ? "Connected" : "Not Connected";

  return `<!doctype html>
  <html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Roblox Auth Success | MainsBot</title>
    <style>
      :root{--bg0:#0b0a06;--bg1:#141108;--panel:rgba(26,21,9,.92);--border:rgba(255,196,80,.35);--text:#fff3d6;--muted:rgba(255,243,214,.72);--accent:#ffbd59}
      *{box-sizing:border-box} body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;color:var(--text);font-family:"Segoe UI",Arial,sans-serif;background:radial-gradient(900px 550px at 20% 0%,rgba(255,196,80,.14),transparent 60%),radial-gradient(700px 420px at 80% 100%,rgba(255,140,40,.14),transparent 60%),linear-gradient(180deg,var(--bg1),var(--bg0))}
      .card{width:min(760px,100%);border-radius:18px;border:1px solid var(--border);background:var(--panel);padding:26px;box-shadow:0 18px 48px rgba(0,0,0,.42)}
      .pill{display:inline-block;padding:5px 11px;border-radius:999px;background:rgba(255,189,89,.16);color:var(--accent);font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}
      h1{margin:10px 0 8px;font-size:34px;line-height:1.05} p{margin:0;color:var(--muted);line-height:1.45}
      .meta{margin-top:14px;display:grid;gap:6px;font-size:14px;color:var(--muted)}
      .row{margin-top:18px;display:flex;flex-wrap:wrap;gap:10px}
      .btn{display:inline-block;padding:10px 14px;border-radius:10px;background:rgba(255,189,89,.16);border:1px solid rgba(255,189,89,.35);color:var(--accent);font-weight:700;text-decoration:none}
      .ok{color:#b8f7c0}
      .warn{color:#ffcf8a}
      code{font-family:Consolas,Monaco,monospace}
    </style>
  </head>
  <body>
    <main class="card">
      <div class="pill">OAuth Complete</div>
      <h1>Roblox Account Connected</h1>
      <p>Authorized Roblox account: <strong>${loginText}</strong>.</p>
      <div class="meta">
        <div>Status: <span class="${status === "Connected" ? "ok" : "warn"}">${escapeHtml(status)}</span></div>
        ${rawUserId ? `<div>User ID: <code>${linkedUserId}</code></div>` : ""}
        <div>Token store: <code>${tokenPath}</code></div>
        <div>Redirect URI: <code>${redirectUri}</code></div>
      </div>
      <div class="row">
        <a class="btn" href="/auth/roblox">Back To Roblox Auth</a>
        <a class="btn" href="/">Return Home</a>
      </div>
    </main>
  </body>
  </html>`;
}

// ---------- STATIC FILE SERVER ----------
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

const BLOCKED_SOURCE_PATHS = new Set([
  "/style.scss",
  "/style.css.map",
  "/static/style.scss",
  "/static/style.css.map",
]);

const webServer = http.createServer(async (req, res) => {
  try {
  const requestOrigin = getRequestOrigin(req);
  let parsedUrl;
  try {
    parsedUrl = new URL(String(req.url || "/"), requestOrigin);
  } catch {
    return sendErrorPage(res, 400, "Bad Request", "Invalid request URL.");
  }

  const urlPath = parsedUrl.pathname;
  const routePath =
    urlPath.length > 1 ? urlPath.replace(/\/+$/, "") : urlPath;
  const lowerUrlPath = routePath.toLowerCase();
  const method = String(req.method || "GET").toUpperCase();
    const authSettings = buildAuthSettingsForRequest(req);
    const authSnapshot = () =>
      getPublicTokenSnapshot({
        settings: authSettings,
        tokenStorePath: authSettings.tokenStorePath,
      });
    const robloxAuthSettings = buildRobloxAuthSettingsForRequest(req);
    const robloxAuthSnapshot = () =>
      getPublicRobloxTokenSnapshot({
        settings: robloxAuthSettings,
        tokenStorePath: robloxAuthSettings.tokenStorePath,
      });
    const spotifyAuthSettings = buildSpotifyAuthSettingsForRequest(req);
    const spotifyAuthSnapshot = () => getPublicSpotifyTokenSnapshot();

  const isSecureRequest = requestOrigin.startsWith("https://");
    const adminSession = WEB_ADMIN_AUTH.readSession(req);
    const adminAllowed = isAdminAllowedSession(adminSession);

  const webAdminRedirectUriOverride = String(process.env.WEB_ADMIN_REDIRECT_URI || "").trim();
  const webAdminOriginOverride = String(process.env.WEB_ADMIN_ORIGIN || "").trim();

  // We intentionally reuse /auth/callback for admin web login so the Twitch app only needs one callback URL.
  const webLoginRedirectUri = webAdminRedirectUriOverride
    ? webAdminRedirectUriOverride
    : `${(webAdminOriginOverride || requestOrigin).replace(/\/+$/, "")}/auth/callback`;

  if (routePath === "/admin/login") {
    try {
      if (String(parsedUrl.searchParams.get("debug") || "") === "1") {
        return sendJsonResponse(
          res,
          200,
          {
            ok: true,
            requestOrigin,
            host: String(req?.headers?.host || ""),
            forwardedHost: String(req?.headers?.["x-forwarded-host"] || ""),
            forwardedProto: String(req?.headers?.["x-forwarded-proto"] || ""),
            webAdminOriginOverride: webAdminOriginOverride || null,
            webAdminRedirectUriOverride: webAdminRedirectUriOverride || null,
            computedRedirectUri: webLoginRedirectUri,
          },
          { "cache-control": "no-store" }
        );
      }

      const nextPath = sanitizeNextPath(parsedUrl.searchParams.get("next"));
      const state = createOAuthState("admin", "weblogin", {
        nextPath: nextPath || "/admin",
      });
      const authorizeUrl = WEB_ADMIN_AUTH.buildLoginUrl({
        redirectUri: webLoginRedirectUri,
        state,
      });
      return sendRedirect(res, authorizeUrl);
    } catch (e) {
      console.error("[WEB][ADMIN] login URL build failed:", e);
      return sendErrorPage(
        res,
        500,
        "Admin Login Error",
        String(e?.message || e)
      );
    }
  }

  if (routePath === "/admin/logout") {
    WEB_ADMIN_AUTH.clearSessionCookie(res, { secure: isSecureRequest });
    return sendRedirect(res, "/");
  }

  if (routePath === "/admin/callback") {
    // Legacy path: keep for backward compatibility (redirect to the unified callback).
    return sendRedirect(res, `/auth/callback${parsedUrl.search || ""}`);
  }

  if (routePath === "/admin/callback_legacy") {
    const oauthError = String(parsedUrl.searchParams.get("error") || "").trim();
    const oauthErrorDescription = String(
      parsedUrl.searchParams.get("error_description") || ""
    ).trim();

    if (oauthError) {
      return sendErrorPage(
        res,
        400,
        "Authorization Denied",
        oauthErrorDescription || oauthError
      );
    }

    const code = String(parsedUrl.searchParams.get("code") || "").trim();
    const state = String(parsedUrl.searchParams.get("state") || "").trim();
    if (!code || !state) {
      return sendErrorPage(
        res,
        400,
        "Invalid Callback",
        "Missing OAuth code/state. Start from /admin/login."
      );
    }

    const stateMeta = consumeOAuthState(state);
    if (stateMeta?.provider !== "weblogin" || stateMeta?.role !== "admin") {
      return sendErrorPage(
        res,
        400,
        "Expired State",
        "OAuth state expired or was already used. Please retry login."
      );
    }

    try {
      const user = await WEB_ADMIN_AUTH.exchangeCode({
        code,
        redirectUri: webLoginRedirectUri,
      });

      const session = { userId: user.userId, login: user.login };
      if (!WEB_ADMIN_AUTH.isAllowed(session)) {
        WEB_ADMIN_AUTH.clearSessionCookie(res, { secure: isSecureRequest });
        return sendErrorPage(
          res,
          403,
          "Forbidden",
          "Your Twitch account is not permitted to access this dashboard."
        );
      }

      WEB_ADMIN_AUTH.setSessionCookie(res, session, { secure: isSecureRequest });
      return sendRedirect(res, "/admin");
    } catch (e) {
      console.error("[WEB][ADMIN] callback exchange failed:", e);
      return sendErrorPage(
        res,
        500,
        "Login Failed",
        String(e?.message || e)
      );
    }
  }

  if (routePath === "/admin") {
    if (!adminAllowed) {
      return sendRedirect(res, "/admin/login");
    }

    const who = escapeHtml(String(adminSession?.login || "unknown"));
    return sendHtmlResponse(
      res,
      200,
      `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Admin | MainsBot</title><style>:root{--bg0:#0b0a06;--bg1:#141108;--panel:rgba(26,21,9,.92);--border:rgba(255,196,80,.35);--text:#fff3d6;--muted:rgba(255,243,214,.72);--accent:#ffbd59}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;color:var(--text);font-family:\"Segoe UI\",Arial,sans-serif;background:radial-gradient(900px 550px at 20% 0%,rgba(255,196,80,.14),transparent 60%),radial-gradient(700px 420px at 80% 100%,rgba(255,140,40,.14),transparent 60%),linear-gradient(180deg,var(--bg1),var(--bg0))}.card{width:min(860px,100%);border-radius:18px;border:1px solid var(--border);background:var(--panel);padding:26px;box-shadow:0 18px 48px rgba(0,0,0,.42)}h1{margin:0 0 8px;font-size:34px;line-height:1.05}p{margin:0;color:var(--muted);line-height:1.45}.row{margin-top:18px;display:flex;flex-wrap:wrap;gap:10px}.btn{display:inline-block;padding:10px 14px;border-radius:10px;background:rgba(255,189,89,.16);border:1px solid rgba(255,189,89,.35);color:var(--accent);font-weight:700;text-decoration:none}code{font-family:Consolas,Monaco,monospace;color:var(--accent)}</style></head><body><main class="card"><h1>MainsBot Admin</h1><p>Logged in as <strong>${who}</strong></p><div class="row"><a class="btn" href=\"/admin/settings\">Settings</a><a class="btn" href=\"/admin/quotes\">Quotes</a><a class="btn" href=\"/auth\">Twitch/Roblox OAuth</a><a class="btn" href=\"/status\">Public Status JSON</a><a class="btn" href=\"/admin/logout\">Logout</a></div></main></body></html>`,
      { "cache-control": "no-store" }
    );
  }

  if (routePath === "/admin/quotes") {
    if (!adminAllowed) {
      if (method === "POST") {
        return sendJsonResponse(res, 401, { ok: false, error: "Unauthorized" }, { "cache-control": "no-store" });
      }
      return sendRedirect(res, "/admin/login");
    }

    if (method === "GET") {
      const who = escapeHtml(String(adminSession?.login || "unknown"));
      const format = String(parsedUrl.searchParams.get("format") || "").trim().toLowerCase();
      const data = loadQuotes();

      if (format === "json") {
        res.writeHead(200, {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store",
        });
        return res.end(JSON.stringify(data, null, 2));
      }

      const quotesJson = escapeHtml(JSON.stringify(data, null, 2));
      const rowsHtml = data.quotes
        .slice()
        .sort((a, b) => Number(a?.id || 0) - Number(b?.id || 0))
        .map((q) => {
          const id = Number(q?.id || 0);
          const text = escapeHtml(String(q?.text || ""));
          const addedBy = escapeHtml(String(q?.addedBy || ""));
          const addedAt = escapeHtml(String(q?.addedAt || ""));
          return `<tr data-id="${id}"><td class="id">#${id}</td><td class="txt"><input class="in" value="${text}" /></td><td class="meta">${addedBy || "-"}</td><td class="meta">${addedAt || "-"}</td><td class="act"><button class="btn sm" data-act="save">Save</button><button class="btn sm danger" data-act="del">Delete</button></td></tr>`;
        })
        .join("");

      return sendHtmlResponse(
        res,
        200,
        `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Quotes | MainsBot</title><style>:root{--bg0:#0b0a06;--bg1:#141108;--panel:rgba(26,21,9,.92);--border:rgba(255,196,80,.35);--text:#fff3d6;--muted:rgba(255,243,214,.72);--accent:#ffbd59;--danger:#ff6b6b}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;color:var(--text);font-family:\"Segoe UI\",Arial,sans-serif;background:radial-gradient(900px 550px at 20% 0%,rgba(255,196,80,.14),transparent 60%),radial-gradient(700px 420px at 80% 100%,rgba(255,140,40,.14),transparent 60%),linear-gradient(180deg,var(--bg1),var(--bg0))}.card{width:min(1180px,100%);border-radius:18px;border:1px solid var(--border);background:var(--panel);padding:22px;box-shadow:0 18px 48px rgba(0,0,0,.42)}h1{margin:0 0 6px;font-size:30px;line-height:1.05}.meta{color:var(--muted);font-size:14px;margin-bottom:14px}.row{margin-top:12px;display:flex;flex-wrap:wrap;gap:10px;align-items:center}.btn,button.btn{display:inline-block;padding:10px 14px;border-radius:10px;background:rgba(255,189,89,.16);border:1px solid rgba(255,189,89,.35);color:var(--accent);font-weight:700;text-decoration:none;cursor:pointer}.btn.sm{padding:7px 10px;border-radius:9px;font-weight:700}.btn.danger,.btn.sm.danger{border-color:rgba(255,107,107,.45);background:rgba(255,107,107,.14);color:var(--danger)}.in{width:100%;border-radius:10px;border:1px solid rgba(255,196,80,.28);background:rgba(9,8,4,.55);padding:10px 12px;color:var(--text);font-size:14px}.in:focus{outline:2px solid rgba(255,189,89,.35)}table{width:100%;border-collapse:collapse}th,td{padding:10px 10px;border-bottom:1px solid rgba(255,196,80,.18);vertical-align:top}th{color:var(--muted);font-size:12px;text-align:left;letter-spacing:.04em;text-transform:uppercase}.id{width:70px;white-space:nowrap;color:var(--accent);font-weight:800}.txt{min-width:420px}.meta{color:var(--muted);font-size:13px}.act{width:160px;white-space:nowrap}.status{margin-left:auto;color:var(--muted);min-height:18px}details{margin-top:16px}textarea{width:100%;min-height:38vh;resize:vertical;border-radius:12px;border:1px solid rgba(255,196,80,.28);background:rgba(9,8,4,.55);padding:14px;color:var(--text);font-family:Consolas,Monaco,monospace;font-size:13px;line-height:1.4}textarea:focus{outline:2px solid rgba(255,189,89,.35)}code{font-family:Consolas,Monaco,monospace;color:var(--accent)}</style></head><body><main class="card"><h1>Quotes</h1><div class="meta">Logged in as <strong>${who}</strong> · Chat: <code>!addquote &lt;text&gt;</code> · <a class="btn sm" href="/admin/quotes?format=json">Download JSON</a></div><div class="row"><input class="in" id="newText" placeholder="New quote text…" /><button class="btn" id="add">Add Quote</button><a class="btn" href="/admin">Back</a><a class="btn" href="/admin/logout">Logout</a><span class="status" id="status"></span></div><table><thead><tr><th>ID</th><th>Text</th><th>Added By</th><th>Added At</th><th>Actions</th></tr></thead><tbody id="rows">${rowsHtml || `<tr><td class="meta" colspan="5">No quotes yet.</td></tr>`}</tbody></table><details><summary class="meta">Advanced JSON editor</summary><p class="meta">Edits persist to your configured state backend. Invalid JSON is rejected.</p><textarea id="quotes" spellcheck="false">${quotesJson}</textarea><div class="row"><button class="btn" id="saveJson">Save JSON</button></div></details><script>const $st=document.getElementById('status');const api=async(payload)=>{const r=await fetch('/admin/quotes',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});const j=await r.json().catch(()=>null);if(!r.ok)throw new Error(j&&j.error?j.error:(r.status+' '+r.statusText));return j;};document.getElementById('add').addEventListener('click',async()=>{$st.textContent='Adding…';try{const text=(document.getElementById('newText').value||'').trim();if(!text)throw new Error('Enter quote text.');await api({action:'add',text});location.reload();}catch(e){$st.textContent='Error: '+(e&&e.message?e.message:String(e));}});document.getElementById('rows').addEventListener('click',async(e)=>{const btn=e.target&&e.target.closest&&e.target.closest('button[data-act]');if(!btn)return;const tr=btn.closest('tr');const id=Number(tr&&tr.dataset&&tr.dataset.id);if(!id)return;$st.textContent='Saving…';try{if(btn.dataset.act==='del'){if(!confirm('Delete quote #'+id+'?'))return;await api({action:'delete',id});location.reload();return;}if(btn.dataset.act==='save'){const input=tr.querySelector('input.in');const text=(input&&input.value?input.value:'').trim();if(!text)throw new Error('Quote text is empty.');await api({action:'edit',id,text});location.reload();return;}}catch(err){$st.textContent='Error: '+(err&&err.message?err.message:String(err));}});document.getElementById('saveJson').addEventListener('click',async()=>{$st.textContent='Saving…';try{const text=(document.getElementById('quotes').value||'');await api({action:'replace',quotesText:text});$st.textContent='Saved.';}catch(e){$st.textContent='Error: '+(e&&e.message?e.message:String(e));}});</script></main></body></html>`,
        { "cache-control": "no-store" }
      );
    }

    if (method === "POST") {
      try {
        const body = await readJsonBody(req, { limitBytes: 1024 * 1024 });
        const action = String(body?.action || "").trim().toLowerCase();
        const data = loadQuotes();

        if (action === "add") {
          const text = String(body?.text || "").replace(/[\r\n]+/g, " ").trim();
          if (!text) return sendJsonResponse(res, 400, { ok: false, error: "Missing quote text." });
          const id = Number(data.nextId) || 1;
          data.quotes.push({ id, text, addedBy: String(adminSession?.login || "").trim(), addedAt: new Date().toISOString() });
          data.nextId = id + 1;
          saveQuotes(data);
          return sendJsonResponse(res, 200, { ok: true, data });
        }

        if (action === "delete") {
          const id = Number(body?.id);
          if (!Number.isInteger(id) || id <= 0) {
            return sendJsonResponse(res, 400, { ok: false, error: "Invalid quote id." });
          }
          const idx = data.quotes.findIndex((q) => Number(q?.id) === id);
          if (idx === -1) return sendJsonResponse(res, 404, { ok: false, error: "Quote not found." });
          data.quotes.splice(idx, 1);
          saveQuotes(data);
          return sendJsonResponse(res, 200, { ok: true, data });
        }

        if (action === "edit") {
          const id = Number(body?.id);
          const text = String(body?.text || "").replace(/[\r\n]+/g, " ").trim();
          if (!Number.isInteger(id) || id <= 0) {
            return sendJsonResponse(res, 400, { ok: false, error: "Invalid quote id." });
          }
          if (!text) return sendJsonResponse(res, 400, { ok: false, error: "Missing quote text." });
          const quote = data.quotes.find((q) => Number(q?.id) === id);
          if (!quote) return sendJsonResponse(res, 404, { ok: false, error: "Quote not found." });
          quote.text = text;
          saveQuotes(data);
          return sendJsonResponse(res, 200, { ok: true, data });
        }

        if (action === "replace") {
          if (typeof body?.quotes !== "object" && typeof body?.quotesText !== "string") {
            return sendJsonResponse(res, 400, { ok: false, error: "Provide quotesText (JSON) or quotes object." });
          }

          const nextRaw =
            typeof body.quotesText === "string" ? safeJsonParse(body.quotesText, null) : body.quotes;

          if (!nextRaw || typeof nextRaw !== "object") {
            return sendJsonResponse(res, 400, { ok: false, error: "Invalid quotes JSON." });
          }

          const normalized = normalizeQuotesData(nextRaw);
          saveQuotes(normalized);
          return sendJsonResponse(res, 200, { ok: true, data: normalized });
        }

        return sendJsonResponse(res, 400, { ok: false, error: "Unknown action." });
      } catch (e) {
        return sendJsonResponse(res, 400, { ok: false, error: String(e?.message || e) }, { "cache-control": "no-store" });
      }
    }

    return sendErrorPage(res, 405, "Method Not Allowed", "Use GET or POST.");
  }

  if (routePath === "/admin/settings") {
    if (!adminAllowed) {
      return sendRedirect(res, "/admin/login");
    }

    if (method === "GET") {
      let settingsObj = {};
      try {
        const raw = fs.readFileSync(SETTINGS_FILE_PATH, "utf8");
        const parsed = safeJsonParse(raw, null);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          settingsObj = parsed;
        }
      } catch {}

      const who = escapeHtml(String(adminSession?.login || "unknown"));
      const settingsText = escapeHtml(JSON.stringify(settingsObj, null, 2));

      return sendHtmlResponse(
        res,
        200,
        `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Settings | MainsBot</title><style>:root{--bg0:#0b0a06;--bg1:#141108;--panel:rgba(26,21,9,.92);--border:rgba(255,196,80,.35);--text:#fff3d6;--muted:rgba(255,243,214,.72);--accent:#ffbd59}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;color:var(--text);font-family:\"Segoe UI\",Arial,sans-serif;background:radial-gradient(900px 550px at 20% 0%,rgba(255,196,80,.14),transparent 60%),radial-gradient(700px 420px at 80% 100%,rgba(255,140,40,.14),transparent 60%),linear-gradient(180deg,var(--bg1),var(--bg0))}.card{width:min(980px,100%);border-radius:18px;border:1px solid var(--border);background:var(--panel);padding:22px;box-shadow:0 18px 48px rgba(0,0,0,.42)}h1{margin:0 0 6px;font-size:30px;line-height:1.05}.meta{color:var(--muted);font-size:14px;margin-bottom:14px}.hint{margin:0 0 10px;color:var(--muted);line-height:1.45}.row{margin-top:12px;display:flex;flex-wrap:wrap;gap:10px;align-items:center}.btn,button.btn{display:inline-block;padding:10px 14px;border-radius:10px;background:rgba(255,189,89,.16);border:1px solid rgba(255,189,89,.35);color:var(--accent);font-weight:700;text-decoration:none;cursor:pointer}textarea{width:100%;min-height:60vh;resize:vertical;border-radius:12px;border:1px solid rgba(255,196,80,.28);background:rgba(9,8,4,.55);padding:14px;color:var(--text);font-family:Consolas,Monaco,monospace;font-size:13px;line-height:1.4}textarea:focus{outline:2px solid rgba(255,189,89,.35)}.status{margin-top:10px;color:var(--muted);min-height:18px}code{font-family:Consolas,Monaco,monospace;color:var(--accent)}</style></head><body><main class="card"><h1>Settings</h1><div class="meta">Logged in as <strong>${who}</strong></div><p class="hint">Edits persist to your configured state backend. Invalid JSON is rejected.</p><textarea id="settings" spellcheck="false">${settingsText}</textarea><div class="row"><button class="btn" id="save">Save</button><a class="btn" href=\"/admin\">Back</a><a class="btn" href=\"/admin/quotes\">Quotes</a><a class="btn" href=\"/admin/logout\">Logout</a><span class="status" id="status"></span></div><script>const $s=document.getElementById('settings');const $st=document.getElementById('status');document.getElementById('save').addEventListener('click',async()=>{$st.textContent='Saving…';try{const r=await fetch('/admin/settings',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({settingsText:$s.value})});const j=await r.json().catch(()=>null);if(!r.ok)throw new Error(j&&j.error?j.error:(r.status+' '+r.statusText));$st.textContent='Saved.';}catch(e){$st.textContent='Error: '+(e&&e.message?e.message:String(e));}});</script></main></body></html>`,
        { "cache-control": "no-store" }
      );
    }

    if (method === "POST") {
      try {
        const body = await readJsonBody(req, { limitBytes: 1024 * 1024 });

        let next = body?.settings;
        if (next == null && typeof body?.settingsText === "string") {
          next = safeJsonParse(body.settingsText, null);
        }

        if (!next || typeof next !== "object" || Array.isArray(next)) {
          return sendJsonResponse(
            res,
            400,
            { ok: false, error: "settings must be a JSON object." },
            { "cache-control": "no-store" }
          );
        }

        fs.mkdirSync(path.dirname(SETTINGS_FILE_PATH), { recursive: true });
        fs.writeFileSync(SETTINGS_FILE_PATH, JSON.stringify(next, null, 2), "utf8");
        await flushStateNow();

        return sendJsonResponse(res, 200, { ok: true }, { "cache-control": "no-store" });
      } catch (e) {
        console.error("[WEB][ADMIN] settings save failed:", e);
        return sendJsonResponse(
          res,
          400,
          { ok: false, error: String(e?.message || e) },
          { "cache-control": "no-store" }
        );
      }
    }

    return sendJsonResponse(
      res,
      405,
      { ok: false, error: "Method not allowed." },
      { "cache-control": "no-store" }
    );
  }

  if (lowerUrlPath.startsWith("/auth") && !adminAllowed) {
    // Allow OAuth callbacks without an admin session (the callback is what *creates* the session/tokens).
    if (
      routePath === "/auth/callback" ||
      routePath === "/auth/roblox/callback" ||
      routePath === "/auth/spotify/callback"
    ) {
      // fall through
    } else {
      const next = encodeURIComponent(`${routePath}${parsedUrl.search || ""}`);
      return sendRedirect(res, `/admin/login?next=${next}`);
    }
  }

  if (routePath === "/callback") {
    return sendRedirect(
      res,
      `/auth/callback${parsedUrl.search || ""}`
    );
  }

  if (routePath === "/success") {
    return sendRedirect(
      res,
      `/auth/success${parsedUrl.search || ""}`
    );
  }

  // Use /auth as a shortcut to the unified auth status page.
  if (routePath === "/auth") {
    return sendRedirect(res, "/auth/success");
  }

  if (routePath === "/auth/status") {
    res.writeHead(200, {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    });
    return res.end(JSON.stringify(authSnapshot()));
  }

  // Direct auth start endpoints (no landing pages).
  if (routePath === "/auth/spotify") {
    try {
      if (
        !String(process.env.SPOTIFY_CLIENT_ID || "").trim() ||
        !String(process.env.SPOTIFY_CLIENT_SECRET || "").trim()
      ) {
        return sendErrorPage(
          res,
          400,
          "Spotify Not Configured",
          "Set [spotify] client_id + client_secret in your INI, then retry."
        );
      }

      const state = createOAuthState("spotify", "spotify", {
        redirectUri: String(spotifyAuthSettings?.redirectUri || "").trim(),
      });
      const authorizeUrl = buildSpotifyAuthorizeUrl({
        settings: spotifyAuthSettings,
        state,
      });
      if (String(parsedUrl.searchParams.get("debug") || "") === "1") {
        return sendJsonResponse(
          res,
          200,
          {
            ok: true,
            redirectUri: String(spotifyAuthSettings?.redirectUri || ""),
            authorizeUrl,
            snapshot: spotifyAuthSnapshot(),
          },
          { "cache-control": "no-store" }
        );
      }
      return sendRedirect(res, authorizeUrl);
    } catch (e) {
      console.error("[WEB][SPOTIFY_AUTH] authorize URL build failed:", e);
      return sendErrorPage(res, 500, "Auth Setup Error", String(e?.message || e));
    }
  }

  if (routePath === "/auth/roblox" || routePath === "/auth/roblox/bot") {
    try {
      const state = createOAuthState("bot", "roblox", {
        redirectUri: String(robloxAuthSettings?.redirectUri || "").trim(),
      });
      const authorizeUrl = buildRobloxAuthorizeUrl({
        settings: robloxAuthSettings,
        state,
      });
      return sendRedirect(res, authorizeUrl);
    } catch (e) {
      console.error("[WEB][ROBLOX_AUTH] authorize URL build failed:", e);
      return sendErrorPage(res, 500, "Auth Setup Error", String(e?.message || e));
    }
  }

  if (routePath === "/auth/roblox/status") {
    res.writeHead(200, {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    });
    return res.end(JSON.stringify(robloxAuthSnapshot()));
  }

  // Legacy endpoints kept for old links.
  if (routePath === "/auth/spotify/connect") return sendRedirect(res, "/auth/spotify");
  if (routePath === "/auth/spotify/status") {
    return sendJsonResponse(res, 200, spotifyAuthSnapshot(), { "cache-control": "no-store" });
  }
  if (routePath === "/auth/roblox/bot") return sendRedirect(res, "/auth/roblox");

  if (
    routePath === "/auth/twitch/bot" ||
    routePath === "/auth/twitch/streamer" ||
    routePath === "/auth/bot" ||
    routePath === "/auth/streamer"
  ) {
    const role =
      routePath.endsWith("/bot") ? TWITCH_ROLES.BOT : TWITCH_ROLES.STREAMER;

    try {
      const state = createOAuthState(role, "twitch", {
        redirectUri: String(authSettings?.redirectUri || "").trim(),
      });
      const authorizeUrl = buildAuthorizeUrl({
        role,
        settings: authSettings,
        state,
      });
      return sendRedirect(res, authorizeUrl);
    } catch (e) {
      console.error("[WEB][AUTH] authorize URL build failed:", e);
      return sendErrorPage(
        res,
        500,
        "Auth Setup Error",
        String(e?.message || e)
      );
    }
  }

  if (routePath === "/auth/spotify/callback") {
    // Legacy callback endpoint: forward into the shared callback handler.
    return sendRedirect(res, `/auth/callback${parsedUrl.search || ""}`);
  }

  if (routePath === "/auth/roblox/callback") {
    const oauthError = String(parsedUrl.searchParams.get("error") || "").trim();
    const oauthErrorDescription = String(
      parsedUrl.searchParams.get("error_description") || ""
    ).trim();

    if (oauthError) {
      return sendErrorPage(
        res,
        400,
        "Authorization Denied",
        oauthErrorDescription || oauthError
      );
    }

    const code = String(parsedUrl.searchParams.get("code") || "").trim();
    const state = String(parsedUrl.searchParams.get("state") || "").trim();

    if (!code || !state) {
      return sendErrorPage(
        res,
        400,
        "Invalid Callback",
        "Missing OAuth code/state. Start from /auth/roblox."
      );
    }

    const stateMeta = consumeOAuthState(state);
    if (stateMeta?.provider !== "roblox" || !stateMeta?.role) {
      return sendErrorPage(
        res,
        400,
        "Expired State",
        "OAuth state expired or was already used. Please retry auth."
      );
    }

    try {
      const rbSettings = {
        ...robloxAuthSettings,
        redirectUri: String(stateMeta?.redirectUri || robloxAuthSettings.redirectUri || "").trim(),
      };

      const record = await exchangeRobloxCode({
        code,
        settings: rbSettings,
        tokenStorePath: robloxAuthSettings.tokenStorePath,
      });

      refreshTrackedRobloxUserId(true);

      const params = new URLSearchParams();
      params.set("provider", "roblox");
      if (record?.login) params.set("login", String(record.login));
      return sendRedirect(res, `/auth/success?${params.toString()}`);
    } catch (e) {
      console.error("[WEB][ROBLOX_AUTH] callback exchange failed:", e);
      return sendErrorPage(
        res,
        500,
        "Token Exchange Failed",
        String(e?.message || e)
      );
    }
  }

  if (
    routePath === "/auth/callback" ||
    (routePath === "/auth/success" && parsedUrl.searchParams.has("code"))
  ) {
    const oauthError = String(parsedUrl.searchParams.get("error") || "").trim();
    const oauthErrorDescription = String(
      parsedUrl.searchParams.get("error_description") || ""
    ).trim();

    if (oauthError) {
      return sendErrorPage(
        res,
        400,
        "Authorization Denied",
        oauthErrorDescription || oauthError
      );
    }

    const code = String(parsedUrl.searchParams.get("code") || "").trim();
    const state = String(parsedUrl.searchParams.get("state") || "").trim();

    if (!code || !state) {
      return sendErrorPage(
        res,
        400,
        "Invalid Callback",
        "Missing OAuth code/state. Start from /auth/twitch/bot, /auth/twitch/streamer, /auth/roblox, or /auth/spotify."
      );
    }

    const stateMeta = consumeOAuthState(state);

    // Admin web login reuses /auth/callback (so Twitch app only needs one callback URL).
    if (stateMeta?.provider === "weblogin" && stateMeta?.role === "admin") {
      try {
        const user = await WEB_ADMIN_AUTH.exchangeCode({
          code,
          redirectUri: webLoginRedirectUri,
        });

        const session = { userId: user.userId, login: user.login };
        if (!isAdminAllowedSession(session)) {
          WEB_ADMIN_AUTH.clearSessionCookie(res, { secure: isSecureRequest });
          return sendErrorPage(
            res,
            403,
            "Forbidden",
            `Your Twitch account is not permitted to access this dashboard.\n\n` +
              `Logged in as: ${String(user?.login || "unknown")} (id: ${String(user?.userId || "unknown")}).\n\n` +
              `To allow access, update your INI [web] section:\n` +
              `- owner_user_id / owner_login, or\n` +
              `- allowed_users (comma separated logins).\n\n` +
              `Note: streamer/bot accounts from your INI [twitch] section (channel_name/channel_id/bot_name/bot_id) are also allowed.`
          );
        }

        WEB_ADMIN_AUTH.setSessionCookie(res, session, { secure: isSecureRequest });
        const nextPath = sanitizeNextPath(stateMeta?.nextPath) || "/admin";
        return sendRedirect(res, nextPath);
      } catch (e) {
        console.error("[WEB][ADMIN] callback exchange failed:", e);
        return sendErrorPage(
          res,
          500,
          "Login Failed",
          String(e?.message || e)
        );
      }
    }

    if (!stateMeta?.provider || !stateMeta?.role) {
      return sendErrorPage(
        res,
        400,
        "Expired State",
        "OAuth state expired or was already used. Please retry auth."
      );
    }

    try {
      if (stateMeta.provider === "spotify") {
        const spSettings = {
          ...spotifyAuthSettings,
          redirectUri: String(stateMeta?.redirectUri || spotifyAuthSettings.redirectUri || "").trim(),
        };
        await exchangeSpotifyCode({
          code,
          settings: spSettings,
          tokenStorePath: spotifyAuthSettings.tokenStorePath,
        });

        const params = new URLSearchParams();
        params.set("provider", "spotify");
        return sendRedirect(res, `/auth/success?${params.toString()}`);
      }

      if (stateMeta.provider !== "twitch") {
        return sendErrorPage(
          res,
          400,
          "Expired State",
          "OAuth state expired or was already used. Please retry auth."
        );
      }

      const role = stateMeta.role;
      const twitchSettings = {
        ...authSettings,
        redirectUri: String(stateMeta?.redirectUri || authSettings.redirectUri || "").trim(),
      };

      const record = await exchangeCodeForRole({
        role,
        code,
        settings: twitchSettings,
        tokenStorePath: authSettings.tokenStorePath,
      });

      const params = new URLSearchParams();
      params.set("provider", "twitch");
      params.set("role", role);
      if (record?.login) params.set("login", String(record.login));
      return sendRedirect(res, `/auth/success?${params.toString()}`);
    } catch (e) {
      console.error("[WEB][AUTH] callback exchange failed:", e);
      return sendErrorPage(
        res,
        500,
        "Token Exchange Failed",
        String(e?.message || e)
      );
    }
  }

  if (routePath === "/auth/success") {
    // Unified status page for all auth providers.
    const provider = String(parsedUrl.searchParams.get("provider") || "").trim();
    const role = String(parsedUrl.searchParams.get("role") || "").trim();
    const login = String(parsedUrl.searchParams.get("login") || "").trim();
    return sendHtmlResponse(
      res,
      200,
      renderUnifiedAuthSuccessHtml({
        provider,
        role,
        login,
        twitchSnapshot: authSnapshot(),
        robloxSnapshot: robloxAuthSnapshot(),
        spotifySnapshot: spotifyAuthSnapshot(),
      }),
      { "cache-control": "no-store" }
    );
  }

  if (routePath === "/auth/spotify/success") {
    return sendRedirect(res, "/auth/success?provider=spotify");
  }

  if (routePath === "/auth/roblox/success") {
    const login = String(parsedUrl.searchParams.get("login") || "").trim();
    const params = new URLSearchParams();
    params.set("provider", "roblox");
    if (login) params.set("login", login);
    return sendRedirect(res, `/auth/success?${params.toString()}`);
  }

  // Block public access to source files; server-side build still reads these from disk.
  if (BLOCKED_SOURCE_PATHS.has(lowerUrlPath)) {
    return sendErrorPage(
      res,
      403,
      "Forbidden",
      "Direct access to source files is blocked."
    );
  }

  if (routePath === "/status") {
    res.writeHead(200, {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    });
    return res.end(JSON.stringify(getStatusSnapshot()));
  }

  let filePath;
  if (routePath === "/" || routePath === "/index.html") {
    if (WEB_BUILD?.html) {
      return sendHtmlResponse(res, 200, WEB_BUILD.html);
    }
    filePath = path.join(WEB_DIR, "index.html");
  } else {
    const rel = urlPath.replace(/^\/+/, ""); // IMPORTANT FIX
    filePath = path.join(WEB_DIR, rel);
  }

  filePath = path.normalize(filePath);
  if (!filePath.startsWith(WEB_DIR + path.sep)) {
    return sendErrorPage(res, 403, "Forbidden", "You do not have access to this path.");
  }

  fs.readFile(filePath, async (err, data) => {
    try {
      if (err) {
        if (err.code === "ENOENT") {
          return sendErrorPage(
            res,
            404,
            "Not Found",
            "The page you requested does not exist."
          );
        }

        console.error("[WEB] file read failed:", err);
        return sendErrorPage(
          res,
          500,
          "Server Error",
          "The server failed to load this resource."
        );
      }

      const ext = path.extname(filePath).toLowerCase();
      if (ext === ".html") {
        return sendHtmlResponse(res, 200, data.toString("utf8"));
      }
      if (ext === ".css") {
        return sendCssResponse(res, 200, data.toString("utf8"), filePath);
      }
      if (ext === ".js") {
        return await sendJsResponse(res, 200, data.toString("utf8"), filePath);
      }

      res.writeHead(200, { "content-type": MIME[ext] || "application/octet-stream" });
      return res.end(data);
    } catch (e) {
      console.error("[WEB] static handler failed:", e);
      if (!res.headersSent) {
        return sendErrorPage(
          res,
          500,
          "Server Error",
          "The server failed to load this resource."
        );
      }
      try {
        return res.end();
      } catch {}
    }
  });
  } catch (e) {
    console.error("[WEB] request handler failed:", e);
    if (!res.headersSent) {
      return sendErrorPage(
        res,
        500,
        "Server Error",
        "An unexpected server error occurred."
      );
    }
    try {
      return res.end();
    } catch {}
  }
});

const WEB_LISTEN = String(process.env.WEB_LISTEN || "").trim().toLowerCase();
const wantSocket =
  WEB_LISTEN === "socket" ? true : WEB_LISTEN === "tcp" ? false : Boolean(WEB_SOCKET_PATH);

if (wantSocket && !WEB_SOCKET_PATH) {
  console.warn("[WEB] WEB_LISTEN=socket but WEB_SOCKET_PATH is empty; falling back to tcp.");
}

webServer.on("error", (err) => {
  const code = String(err?.code || "");
  if (code === "EADDRINUSE") {
    console.error(
      `[WEB] listen failed: address already in use (${WEB_HOST}:${WEB_PORT}). ` +
        `Stop the other process or change [web].port in your INI.`
    );
    return;
  }

  console.error("[WEB] server error:", err);
});

if (wantSocket && WEB_SOCKET_PATH) {
  const isNamedPipe =
    process.platform === "win32" || /^\\\\\\\\\\.\\\\pipe\\\\/i.test(WEB_SOCKET_PATH);
  if (!isNamedPipe) {
    try {
      fs.unlinkSync(WEB_SOCKET_PATH);
    } catch (e) {
      if (e?.code !== "ENOENT") {
        console.warn("[WEB] socket cleanup failed:", String(e?.message || e));
      }
    }
  }

  webServer.listen(WEB_SOCKET_PATH, () => {
    console.log(`[WEB] WEB_DIR=${WEB_DIR}`);
    console.log(`[WEB] index exists=${fs.existsSync(path.join(WEB_DIR, "index.html"))}`);
    console.log(`[WEB] serving unix socket ${WEB_SOCKET_PATH}`);
  });
} else {
  webServer.listen(WEB_PORT, WEB_HOST, () => {
    console.log(`[WEB] WEB_DIR=${WEB_DIR}`);
    console.log(`[WEB] index exists=${fs.existsSync(path.join(WEB_DIR, "index.html"))}`);
    console.log(`[WEB] serving http://${WEB_HOST}:${WEB_PORT}`);
  });
}


  return {
    server: webServer,
    stop() {
      try {
        webServer?.close?.();
      } catch {}
    },
  };
}
