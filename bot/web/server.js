import fs from "fs";
import http from "http";
import net from "net";
import path from "path";
import { fileURLToPath } from "url";
import { createHash, randomBytes, timingSafeEqual } from "crypto";
import fetch from "node-fetch";

import * as sass from "sass";
import { minify as terserMinify } from "terser";
import CleanCSS from "clean-css";

import { flushStateNow } from "../../data/postgres/stateInterceptor.js";
import { createWebAdminAuth } from "../api/twitch/webAdmin.js";
import { isUserModerator, updateChannelInfo, getGameIdByName } from "../api/twitch/helix.js";
import {
  TWITCH_ROLES,
  buildAuthorizeUrl,
  buildTwitchAuthSettings,
  exchangeCodeForRole,
  getRoleAccessToken,
  getPublicTokenSnapshot,
} from "../api/twitch/auth.js";
import {
  buildRobloxAuthSettings,
  buildRobloxAuthorizeUrl,
  exchangeRobloxCode,
  getPublicRobloxTokenSnapshot,
} from "../api/roblox/auth.js";
import * as ROBLOX from "../api/roblox/index.js";
import {
  buildSpotifyAuthSettings,
  buildSpotifyAuthorizeUrl,
  exchangeSpotifyCode,
  getPublicSpotifyTokenSnapshot,
} from "../api/spotify/auth.js";
import * as SPOTIFY from "../api/spotify/index.js";
import {
  addTrackedRobloxFriend,
  isRobloxModuleEnabled,
  listTrackedRobloxFriends,
  unfriendTrackedRobloxFriends,
} from "../modules/roblox.js";

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
  const WEB_AUTH_MODE = String(process.env.WEB_AUTH_MODE || "").trim().toLowerCase();
  const WEB_ADMIN_USERNAME = String(process.env.WEB_ADMIN_USERNAME || "").trim();
  const WEB_ADMIN_PASSWORD = String(process.env.WEB_ADMIN_PASSWORD || "");
  const WEB_ADMIN_PASSWORD_HASH = String(process.env.WEB_ADMIN_PASSWORD_HASH || "").trim();
  const WEB_LOGIN_FORCE_VERIFY = flagFromEnv(
    process.env.WEB_LOGIN_FORCE_VERIFY || process.env.TWITCH_AUTH_FORCE_VERIFY || ""
  );
  const WEB_IP_INTEL_ENABLED = flagFromEnv(
    process.env.WEB_IP_INTEL_ENABLED ?? process.env.WEB_VPN_DETECTION_ENABLED ?? "1"
  );
  const WEB_IP_INTEL_TIMEOUT_MS = Math.max(
    500,
    Number(process.env.WEB_IP_INTEL_TIMEOUT_MS || 2500) || 2500
  );
  const WEB_IP_INTEL_CACHE_MS = Math.max(
    60_000,
    Number(process.env.WEB_IP_INTEL_CACHE_MS || 6 * 60 * 60 * 1000) ||
      6 * 60 * 60 * 1000
  );
  const ipIntelCache = new Map();

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

  function normalizeLogin(value) {
    return String(value || "").trim().toLowerCase();
  }

  function safeEqualText(a, b) {
    const aa = Buffer.from(String(a ?? ""), "utf8");
    const bb = Buffer.from(String(b ?? ""), "utf8");
    if (aa.length !== bb.length) {
      // Spend roughly the same amount of time even when lengths differ.
      try {
        const ha = createHash("sha256").update(aa).digest();
        const hb = createHash("sha256").update(bb).digest();
        timingSafeEqual(ha, hb);
      } catch {}
      return false;
    }
    try {
      return timingSafeEqual(aa, bb);
    } catch {
      return false;
    }
  }

  const passwordAuthConfigured = Boolean(
    normalizeLogin(WEB_ADMIN_USERNAME) &&
      (String(WEB_ADMIN_PASSWORD || "").trim() || String(WEB_ADMIN_PASSWORD_HASH || "").trim())
  );

  const usePasswordAuth =
    WEB_AUTH_MODE === "password" ||
    ((WEB_AUTH_MODE === "" || WEB_AUTH_MODE === "auto") && passwordAuthConfigured);

  function verifyAdminPasswordLogin({ username, password } = {}) {
    const expectedUser = normalizeLogin(WEB_ADMIN_USERNAME);
    if (!expectedUser) return { ok: false, error: "Missing [web].admin_username" };
    if (normalizeLogin(username) !== expectedUser) return { ok: false, error: "Invalid username or password." };

    const supplied = String(password ?? "");
    const hash = String(WEB_ADMIN_PASSWORD_HASH || "").trim();
    if (hash) {
      // Supported formats:
      // - sha256:<hex>
      if (hash.toLowerCase().startsWith("sha256:")) {
        const expectedHex = hash.slice("sha256:".length).trim().toLowerCase();
        const gotHex = createHash("sha256").update(supplied, "utf8").digest("hex").toLowerCase();
        return safeEqualText(gotHex, expectedHex)
          ? { ok: true }
          : { ok: false, error: "Invalid username or password." };
      }
      return { ok: false, error: "Unsupported [web].admin_password_hash format (use sha256:<hex>)."};
    }

    const expectedPw = String(WEB_ADMIN_PASSWORD || "");
    if (!expectedPw) return { ok: false, error: "Missing [web].admin_password" };
    return safeEqualText(supplied, expectedPw)
      ? { ok: true }
      : { ok: false, error: "Invalid username or password." };
  }

  function isAdminAllowedSession(session) {
    if (!session?.userId || !session?.login) return false;

    if (String(session.mode || "").trim().toLowerCase() === "password") {
      // Cookie is signed; this means the user successfully logged in via /admin/login.
      // Optionally pin to the configured admin username to prevent stale cookies from being accepted after a change.
      const expectedUser = normalizeLogin(WEB_ADMIN_USERNAME);
      if (!expectedUser) return false;
      return normalizeLogin(session.login) === expectedUser;
    }

    if (session?.isMod === true) return true;
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

  function sanitizeSettingsForStorage(input = {}) {
    const src = input && typeof input === "object" && !Array.isArray(input) ? input : {};
    const out = { ...src };

    const bool = (v, fallback = false) => (v == null ? fallback : Boolean(v));
    const str = (v, fallback = "") => (v == null ? fallback : String(v)).trim();
    const num = (v, fallback = 0) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : fallback;
    };
    const int = (v, fallback = 0) => Math.max(0, Math.floor(num(v, fallback)));
    const arrStr = (v) =>
      Array.isArray(v) ? v.map((x) => String(x || "").trim()).filter(Boolean) : [];
    const obj = (v, fallback = {}) =>
      v && typeof v === "object" && !Array.isArray(v) ? v : fallback;

    // Normalize common keys used by both the bot and admin UI.
    out.ks = bool(out.ks, false);
    out.timers = bool(out.timers, true);
    out.keywords = bool(out.keywords, true);
    out.spamFilter = bool(out.spamFilter, true);
    out.lengthFilter = bool(out.lengthFilter, false);
    out.linkFilter = bool(out.linkFilter, true);
    out.linkAllowlist = arrStr(out.linkAllowlist);
    out.currentMode = str(out.currentMode, "!join.on");
    out.currentGame = str(out.currentGame, "Website");
    out.currentLink = out.currentLink == null ? null : str(out.currentLink, "");

    out.filterExemptions = arrStr(out.filterExemptions);
    out.bots = arrStr(out.bots);
    out.joinTimer = bool(out.joinTimer, true);
    out.gamesPlayedCount = int(out.gamesPlayedCount, 5);

    out.timer = obj(out.timer, {
      join: "type !join to join the game",
      link: "type !link to get the link to join",
      "1v1": "type 1v1 in chat once to get a chance to 1v1 the streamer",
      ticket: "type !ticket to join the game",
      val: "type !val to join",
    });
    out.main = obj(out.main, { join: "!join", link: "!link", "1v1": "!1v1", ticket: "!ticket", val: "!val" });
    out.nonFollowers = obj(out.nonFollowers, {
      join: "click the follow button on twitch to get access to the join command",
    });

    out.validModes = arrStr(out.validModes);
    out.specialModes = arrStr(out.specialModes);
    out.customModes = arrStr(out.customModes);
    out.ignoreModes = arrStr(out.ignoreModes);

    if (!out.validModes.length) {
      out.validModes = ["!join.on", "!link.on", "!1v1.on", "!ticket.on", "!val.on", "!reddit.on"];
    }
    if (!out.specialModes.length) {
      out.specialModes = [
        "!ks.on",
        "!ks.off",
        "!timer.on",
        "!timer.off",
        "!keywords.on",
        "!keywords.off",
        "!timers.off",
        "!timers.on",
        "!sleep.on",
        "!sleep.off",
      ];
    }
    if (!out.customModes.length) {
      out.customModes = ["!xqcchat.on", "!xqcchat.off"];
    }
    if (!out.ignoreModes.length) {
      out.ignoreModes = [
        "!spamfilter.on",
        "!spamfilter.off",
        "!lengthfilter.on",
        "!lengthfilter.off",
        "!linkfilter.on",
        "!linkfilter.off",
        "!sleep.on",
      ];
    }

    out.corrections = obj(out.corrections, {});
    out.titles = obj(out.titles, {
      join: "FREE ROBUX LIVE - WIN THIS GAME - !JOIN TO PLAY - !socials !discord",
      link: "FREE ROBUX LIVE - WIN THIS GAME - !LINK TO PLAY - !socials !discord",
      ticket: "FREE ROBUX LIVE - WIN THIS GAME - !TICKET TO PLAY - !socials !discord",
      "1v1": "ARSENAL 1V1 - WIN = FREE ROBUX - !1V1 TO PLAY - !socials !discord",
      val: "VALORANT - !VAL TO PLAY - !socials !discord",
      reddit: "REDDIT RECAP - !socials !discord !reddit",
    });
    out.modeGames = obj(out.modeGames, {});
    for (const [k, v] of Object.entries(out.modeGames)) {
      const key = String(k || "").trim();
      const val = String(v || "").trim();
      if (!key || !val) {
        delete out.modeGames[k];
      } else {
        out.modeGames[key] = val;
      }
    }

    // Remove runtime/diagnostic keys (should not be persisted).
    delete out.subathonDay;
    delete out.account;
    delete out.gameChangeTime;
    delete out.lastGameExitTime;
    delete out.followerOnlyMode;
    delete out.discordRobloxLogging;
    delete out.responseCount;
    delete out.chatArray;

    // Filter tuning (timeouts/intervals/messages).
    out.filters = obj(out.filters, {});
    out.filters.spam = obj(out.filters.spam, {});
    out.filters.length = obj(out.filters.length, {});
    out.filters.link = obj(out.filters.link, {});

    out.filters.spam.windowMs = int(out.filters.spam.windowMs, 7000);
    out.filters.spam.minMessages = int(out.filters.spam.minMessages, 5);
    out.filters.spam.strikeResetMs = int(out.filters.spam.strikeResetMs, 10 * 60 * 1000);
    out.filters.spam.timeoutFirstSec = int(out.filters.spam.timeoutFirstSec, 30);
    out.filters.spam.timeoutRepeatSec = int(out.filters.spam.timeoutRepeatSec, 60);
    out.filters.spam.reason = str(
      out.filters.spam.reason,
      "[AUTOMATIC] Please stop excessively spamming - MainsBot"
    );
    out.filters.spam.messageFirst = str(
      out.filters.spam.messageFirst,
      "{atUser}, please stop excessively spamming."
    );
    out.filters.spam.messageRepeat = str(
      out.filters.spam.messageRepeat,
      "{atUser} Please STOP excessively spamming."
    );

    out.filters.length.maxChars = int(out.filters.length.maxChars, 400);
    out.filters.length.strikeResetMs = int(out.filters.length.strikeResetMs, 10 * 60 * 1000);
    out.filters.length.timeoutFirstSec = int(out.filters.length.timeoutFirstSec, 30);
    out.filters.length.timeoutRepeatSec = int(out.filters.length.timeoutRepeatSec, 60);
    out.filters.length.reason = str(
      out.filters.length.reason,
      "[AUTOMATIC] Message exceeds max character limit - MainsBot"
    );
    out.filters.length.message = str(
      out.filters.length.message,
      "{atUser} Message exceeds max character limit."
    );

    out.filters.link.strikeResetMs = int(out.filters.link.strikeResetMs, 10 * 60 * 1000);
    out.filters.link.timeoutFirstSec = int(out.filters.link.timeoutFirstSec, 1);
    out.filters.link.timeoutRepeatSec = int(out.filters.link.timeoutRepeatSec, 5);
    out.filters.link.reason = str(out.filters.link.reason, "[AUTOMATIC] No links allowed - MainsBot");
    out.filters.link.message = str(out.filters.link.message, "{atUser} No links allowed in chat.");

    return out;
  }

  let WEB_BUILD = null;
  let LAST_SCSS_CSS = "";
  const cssMinifier = new CleanCSS({ level: 2 });

if (!fs.existsSync(STATIC_DIR)) {
  fs.mkdirSync(STATIC_DIR, { recursive: true });
  console.log("[WEB] created static directory");
}

function hashContentBase36(content, len = 10) {
  const hex = createHash("sha1").update(content).digest("hex");
  const base36 = BigInt(`0x${hex}`).toString(36);
  return base36.slice(0, len);
}

function compileScssToCssText() {
  try {
    if (!fs.existsSync(SCSS_PATH)) {
      console.error("[WEB] SCSS file not found:", SCSS_PATH);
      return "";
    }

    const out = sass.compile(SCSS_PATH, { style: "expanded" });
    return String(out?.css ?? "");
  } catch (e) {
    console.error("[WEB] SCSS compile failed:", e);
    return "";
  }
}

function compileScss() {
  console.log("[WEB] compiling scss...");
  const css = compileScssToCssText();
  if (!String(css || "").trim()) return;
  LAST_SCSS_CSS = css;
  void buildWebAssets();
}

compileScss();

// auto-recompile when scss changes
fs.watchFile(SCSS_PATH, { interval: 1200 }, compileScss);


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
    if (!fs.existsSync(BASE_JS_PATH)) {
      return;
    }

    fs.mkdirSync(GEN_DIR, { recursive: true });

    const rawJs = fs.readFileSync(BASE_JS_PATH, "utf8");
    const rawCss = String(LAST_SCSS_CSS || "");
    if (!rawCss.trim()) return;
    const js = await minifyJs(rawJs, BASE_JS_PATH);
    const css = minifyCss(rawCss, SCSS_PATH);

    const jsFile = `base.${hashContentBase36(js)}.js`;
    const cssFile = `style.${hashContentBase36(css)}.css`;

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

function parseBooleanInput(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const text = String(value ?? "").trim().toLowerCase();
  if (!text) return fallback;
  if (["1", "true", "yes", "on"].includes(text)) return true;
  if (["0", "false", "no", "off"].includes(text)) return false;
  return fallback;
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

function getIsSecureRequest(req) {
  const forwardedProto = String(req?.headers?.["x-forwarded-proto"] || "")
    .split(",")[0]
    .trim()
    .toLowerCase();
  if (forwardedProto) return forwardedProto === "https";
  return Boolean(req?.socket?.encrypted);
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

function isAuthManagerSession(session) {
  if (!session?.userId && !session?.login) return false;

  const sessionUserId = String(session?.userId || "").trim();
  const sessionLogin = String(session?.login || "").trim().toLowerCase();
  const ownerLogin = String(WEB_OWNER_LOGIN || "").trim().toLowerCase();
  const ownerUserId = String(WEB_OWNER_USER_ID || "").trim();

  if (ownerUserId && sessionUserId === ownerUserId) return true;
  if (ownerLogin && sessionLogin === ownerLogin) return true;

  if (TWITCH_CHANNEL_ID && sessionUserId === TWITCH_CHANNEL_ID) return true;
  if (TWITCH_BOT_ID && sessionUserId === TWITCH_BOT_ID) return true;
  if (TWITCH_CHANNEL_NAME && sessionLogin === TWITCH_CHANNEL_NAME) return true;
  if (TWITCH_BOT_NAME && sessionLogin === TWITCH_BOT_NAME) return true;

  return false;
}

function normalizeIpCandidate(rawValue) {
  let value = String(rawValue || "").trim();
  if (!value) return "";

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1).trim();
  }

  value = value.replace(/^for=/i, "").trim();
  if (!value) return "";

  if (value.startsWith("[")) {
    const end = value.indexOf("]");
    if (end !== -1) {
      value = value.slice(1, end).trim();
    }
  } else if (/^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(value)) {
    value = value.slice(0, value.lastIndexOf(":"));
  }

  value = value.replace(/^::ffff:/i, "").trim();
  const zoneIndex = value.indexOf("%");
  if (zoneIndex !== -1) value = value.slice(0, zoneIndex).trim();

  return net.isIP(value) ? value : "";
}

function isPrivateOrLocalIp(ip) {
  const value = normalizeIpCandidate(ip);
  if (!value) return true;

  const ipVersion = net.isIP(value);
  if (ipVersion === 4) {
    const parts = value.split(".").map((x) => Number(x));
    if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
      return true;
    }
    const [a, b] = parts;
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a === 0) return true;
    if (a >= 224) return true;
    return false;
  }

  if (ipVersion === 6) {
    const lower = value.toLowerCase();
    if (lower === "::1") return true;
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true;
    if (lower.startsWith("fe80")) return true;
    if (lower.startsWith("::ffff:127.")) return true;
    return false;
  }

  return true;
}

function parseForwardedHeaderIps(value) {
  const parts = String(value || "").split(",");
  const out = [];
  for (const part of parts) {
    const match = String(part || "").match(/for=([^;]+)/i);
    if (!match) continue;
    const ip = normalizeIpCandidate(match[1]);
    if (ip) out.push(ip);
  }
  return out;
}

function getRequestIpInfo(req) {
  const candidates = [];
  const seen = new Set();

  const push = (rawValue, source) => {
    const ip = normalizeIpCandidate(rawValue);
    if (!ip) return;
    if (seen.has(ip)) return;
    seen.add(ip);
    candidates.push({ ip, source });
  };

  const headerDirect = [
    ["cf-connecting-ip", "cf-connecting-ip"],
    ["true-client-ip", "true-client-ip"],
    ["x-real-ip", "x-real-ip"],
    ["x-client-ip", "x-client-ip"],
    ["fastly-client-ip", "fastly-client-ip"],
    ["fly-client-ip", "fly-client-ip"],
  ];

  for (const [headerName, sourceName] of headerDirect) {
    push(req?.headers?.[headerName], sourceName);
  }

  const xffValues = String(req?.headers?.["x-forwarded-for"] || "")
    .split(",")
    .map((x) => normalizeIpCandidate(x))
    .filter(Boolean);
  for (let i = 0; i < xffValues.length; i++) {
    push(xffValues[i], i === 0 ? "x-forwarded-for" : `x-forwarded-for#${i + 1}`);
  }

  const forwardedValues = parseForwardedHeaderIps(req?.headers?.forwarded);
  for (let i = 0; i < forwardedValues.length; i++) {
    push(forwardedValues[i], i === 0 ? "forwarded" : `forwarded#${i + 1}`);
  }

  push(req?.socket?.remoteAddress, "socket");

  const selected =
    candidates.find((entry) => !isPrivateOrLocalIp(entry.ip)) ||
    candidates[0] ||
    { ip: "unknown", source: "unknown" };

  return {
    ip: String(selected.ip || "unknown"),
    source: String(selected.source || "unknown"),
    chain: candidates.map((entry) => entry.ip),
    chainSources: candidates.map((entry) => `${entry.source}:${entry.ip}`),
  };
}

async function fetchJsonWithTimeout(url, timeoutMs) {
  let timer = null;
  try {
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("timeout")), timeoutMs);
    });
    const response = await Promise.race([
      fetch(url, {
        method: "GET",
        headers: { accept: "application/json" },
      }),
      timeout,
    ]);
    if (!response || typeof response.ok !== "boolean") {
      throw new Error("invalid_response");
    }
    if (!response.ok) {
      throw new Error(`http_${response.status}`);
    }
    return await response.json();
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function normalizeIpIntelPayload(ip, payload) {
  const status = String(payload?.status || "").trim().toLowerCase();
  if (status && status !== "success") {
    const reason = String(payload?.message || payload?.error || status).trim();
    throw new Error(reason || "lookup_failed");
  }

  const isProxy = Boolean(payload?.proxy);
  const isHosting = Boolean(payload?.hosting);
  const isMobile = Boolean(payload?.mobile);
  const riskFlags = [];
  if (isProxy) riskFlags.push("vpn_or_proxy");
  if (isHosting) riskFlags.push("hosting");
  if (isMobile) riskFlags.push("mobile_network");

  return {
    provider: "ip-api",
    ip: String(payload?.query || ip || "").trim() || ip,
    isProxy,
    isVpn: isProxy,
    isTor: false,
    isHosting,
    isMobile,
    riskFlags,
    country: String(payload?.country || "").trim(),
    region: String(payload?.regionName || "").trim(),
    city: String(payload?.city || "").trim(),
    isp: String(payload?.isp || "").trim(),
    org: String(payload?.org || "").trim(),
    asn: String(payload?.as || "").trim(),
  };
}

async function getIpIntel(ip) {
  if (!WEB_IP_INTEL_ENABLED) return null;

  const normalizedIp = normalizeIpCandidate(ip);
  if (!normalizedIp || normalizedIp === "unknown") return null;
  if (isPrivateOrLocalIp(normalizedIp)) {
    return {
      provider: "ip-api",
      ip: normalizedIp,
      skipped: true,
      reason: "private_or_local_ip",
      riskFlags: [],
    };
  }

  const now = Date.now();
  const cached = ipIntelCache.get(normalizedIp);
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  const url =
    `http://ip-api.com/json/${encodeURIComponent(normalizedIp)}` +
    `?fields=status,message,query,country,regionName,city,isp,org,as,proxy,hosting,mobile`;

  try {
    const json = await fetchJsonWithTimeout(url, WEB_IP_INTEL_TIMEOUT_MS);
    const intel = normalizeIpIntelPayload(normalizedIp, json);
    ipIntelCache.set(normalizedIp, {
      value: intel,
      expiresAt: now + WEB_IP_INTEL_CACHE_MS,
    });
    return intel;
  } catch (e) {
    const fallback = {
      provider: "ip-api",
      ip: normalizedIp,
      lookupError: String(e?.message || e),
      riskFlags: [],
    };
    ipIntelCache.set(normalizedIp, {
      value: fallback,
      expiresAt: now + Math.min(WEB_IP_INTEL_CACHE_MS, 10 * 60 * 1000),
    });
    return fallback;
  }
}

function getRequestIp(req) {
  return getRequestIpInfo(req).ip;
}

function readRequestHeader(req, names = []) {
  const list = Array.isArray(names) ? names : [names];
  for (const nameRaw of list) {
    const name = String(nameRaw || "").trim().toLowerCase();
    if (!name) continue;
    const value = req?.headers?.[name];
    const text = Array.isArray(value) ? String(value[0] || "") : String(value || "");
    const first = text.split(",")[0].trim();
    if (first) return first;
  }
  return "";
}

function clampAuditText(value, maxLen = 220) {
  const raw = String(value ?? "").replace(/[\r\n\t]+/g, " ").trim();
  if (!raw) return "";
  if (raw.length <= maxLen) return raw;
  return `${raw.slice(0, Math.max(0, maxLen - 3))}...`;
}

function detectSpotifyRequestSource(req, routePath = "") {
  const explicit = String(
    readRequestHeader(req, ["x-request-source", "x-source"]) || ""
  )
    .trim()
    .toLowerCase();
  if (explicit) return explicit;

  const referer = String(
    req?.headers?.referer || req?.headers?.referrer || ""
  ).trim().toLowerCase();
  const userAgent = String(req?.headers?.["user-agent"] || "")
    .trim()
    .toLowerCase();
  const route = String(routePath || "").trim().toLowerCase();

  if (referer.includes("/swagger") || userAgent.includes("swagger")) return "swagger";
  if (route.startsWith("/admin/")) return "admin";
  if (route.startsWith("/api/")) return "api";
  return "unknown";
}

function resolveSpotifyAuditActor(req, adminSession = null) {
  const sessionLogin = String(adminSession?.login || "").trim();
  const sessionUserId = String(adminSession?.userId || "").trim();
  const sessionMode = String(adminSession?.mode || "").trim().toLowerCase();
  const adminLoginHeader = readRequestHeader(req, [
    "x-admin-login",
    "x-actor-login",
  ]);
  const adminUserIdHeader = readRequestHeader(req, [
    "x-admin-user-id",
    "x-actor-user-id",
  ]);
  const adminModeHeader = readRequestHeader(req, [
    "x-admin-mode",
    "x-actor-mode",
  ]);

  const twitchLoginHeader = readRequestHeader(req, [
    "x-twitch-login",
    "x-user-login",
    "x-login",
  ]);
  const twitchUserIdHeader = readRequestHeader(req, [
    "x-twitch-user-id",
    "x-twitch-id",
    "x-user-id",
  ]);
  const discordUsernameHeader = readRequestHeader(req, [
    "x-discord-username",
    "x-discord-user",
  ]);
  const discordUserIdHeader = readRequestHeader(req, [
    "x-discord-user-id",
    "x-discord-id",
  ]);

  const resolvedSessionLogin = adminLoginHeader || sessionLogin;
  const resolvedSessionUserId = adminUserIdHeader || sessionUserId;
  const resolvedSessionMode = String(adminModeHeader || sessionMode || "")
    .trim()
    .toLowerCase();

  let twitchLogin = twitchLoginHeader;
  let twitchUserId = twitchUserIdHeader;
  let twitchSource = twitchLogin || twitchUserId ? "header" : "";

  if ((!twitchLogin || !twitchUserId) && resolvedSessionMode === "twitch") {
    if (!twitchLogin && resolvedSessionLogin) twitchLogin = resolvedSessionLogin;
    if (!twitchUserId && resolvedSessionUserId) twitchUserId = resolvedSessionUserId;
    if (!twitchSource && (twitchLogin || twitchUserId)) twitchSource = "session";
  }

  let discordUsername = discordUsernameHeader;
  let discordUserId = discordUserIdHeader;
  let discordSource = discordUsername || discordUserId ? "header" : "";

  // Best-effort fallback: if no explicit Discord identity is provided, keep a lookup hint
  // from the authenticated actor/session login for downstream resolver logic.
  const discordLookupHint = String(
    discordUsername ||
      (resolvedSessionMode === "password" && resolvedSessionLogin
        ? resolvedSessionLogin
        : "")
  ).trim();
  if (!discordUsername && resolvedSessionMode === "password" && resolvedSessionLogin) {
    discordUsername = resolvedSessionLogin;
    if (!discordSource) discordSource = "session_hint";
  }

  return {
    actorLogin: resolvedSessionLogin || "anonymous",
    actorUserId: resolvedSessionUserId,
    sessionMode: resolvedSessionMode || "unknown",
    twitchLogin: clampAuditText(twitchLogin, 80),
    twitchUserId: clampAuditText(twitchUserId, 40),
    twitchSource: twitchSource || "unknown",
    discordUsername: clampAuditText(discordUsername, 80),
    discordUserId: clampAuditText(discordUserId, 40),
    discordLookupHint: clampAuditText(discordLookupHint, 80),
    discordSource: discordSource || "unknown",
  };
}

function logSpotifyAdminAudit(req, {
  adminSession = null,
  action = "",
  routePath = "",
  ok = false,
  reason = "",
  input = "",
  uri = "",
  source = "",
  trackName = "",
  trackArtists = "",
  spotifyStatus = null,
} = {}) {
  const actor = resolveSpotifyAuditActor(req, adminSession);
  const actorLogin = String(actor.actorLogin || "").trim() || "anonymous";
  const actorUserId = String(actor.actorUserId || "").trim() || "";
  const requestIpInfo = getRequestIpInfo(req);
  const requestIp = String(requestIpInfo?.ip || "unknown").trim() || "unknown";
  const requestIpSource = String(requestIpInfo?.source || "unknown").trim() || "unknown";
  const requestIpChain = Array.isArray(requestIpInfo?.chain)
    ? requestIpInfo.chain.filter(Boolean)
    : [];
  const requestIpChainText = requestIpChain.join(" -> ");
  const requestSource = detectSpotifyRequestSource(req, routePath);
  const actionKey = String(action || "").trim().toLowerCase();
  const event =
    actionKey === "add"
      ? ok
        ? "Song Added to Queue"
        : "Song Add Failed"
      : actionKey === "skip"
        ? ok
          ? "Song Skipped"
          : "Song Skip Failed"
        : ok
          ? "Spotify Action OK"
          : "Spotify Action Failed";

  const normalizedTrackName = clampAuditText(trackName, 120);
  const normalizedTrackArtists = clampAuditText(trackArtists, 120);
  const normalizedInput = clampAuditText(input, 160);
  const normalizedUri = clampAuditText(uri, 160);
  const trackSummary = normalizedTrackName
    ? normalizedTrackArtists
      ? `${normalizedTrackName} - ${normalizedTrackArtists}`
      : normalizedTrackName
    : normalizedInput || normalizedUri || "(unknown track)";
  const compact =
    `[WEB][SPOTIFY] (${event}) "${trackSummary}" - ${actorLogin} (${actorUserId || "unknown"}) ` +
    `[${requestSource}] ip=${requestIp} (${requestIpSource})`;
  const reasonText = clampAuditText(reason, 120);
  if (ok) {
    console.log(compact);
  } else {
    console.log(`${compact} [${reasonText || "failed"}]`);
  }

  const logModAction = deps?.logDiscordModAction;
  if (typeof logModAction !== "function") return;

  const discordAction =
    actionKey === "add"
      ? "spotify_addsong"
      : actionKey === "skip"
        ? "spotify_skip"
        : "spotify_action";

  const meta = {
    route: String(routePath || "").trim() || "unknown",
    method: String(req?.method || "").toUpperCase(),
    ip: requestIp,
    requestIp,
    requestIpSource,
    ipSource: requestIpSource,
    requestIpChain: requestIpChainText,
    ipChain: requestIpChainText,
    requestSource,
    source: String(source || "").trim() || "",
    inputSource: String(source || "").trim() || "",
    input: normalizedInput || "",
    trackName: normalizedTrackName || "",
    trackArtists: normalizedTrackArtists || "",
    trackUri: normalizedUri || "",
    song: trackSummary || "",
    actorSessionMode: actor.sessionMode,
    actorLogin,
    actorUserId,
    twitchLogin: actor.twitchLogin || "",
    twitchUserId: actor.twitchUserId || "",
    twitchIdentitySource: actor.twitchSource || "",
    discordUsername: actor.discordUsername || "",
    discordUserId: actor.discordUserId || "",
    discordLookupHint: actor.discordLookupHint || "",
    discordIdentitySource: actor.discordSource || "",
  };
  if (Number.isFinite(Number(spotifyStatus))) {
    meta.spotifyStatus = Number(spotifyStatus);
  }

  const sendDiscordAuditLog = async () => {
    const ipIntel = await getIpIntel(requestIp).catch(() => null);
    if (ipIntel && typeof ipIntel === "object") {
      meta.ipIntel = ipIntel;
      if (Array.isArray(ipIntel.riskFlags) && ipIntel.riskFlags.length) {
        meta.ipRiskFlags = ipIntel.riskFlags.join(", ");
      }
      if (ipIntel.lookupError) {
        meta.ipLookupError = String(ipIntel.lookupError);
      }
    }

    await logModAction({
      action: discordAction,
      ok: Boolean(ok),
      channelName: TWITCH_CHANNEL_NAME || "",
      user: {
        login: actorLogin,
        id: actorUserId,
        displayName: actorLogin,
      },
      meta,
      error: ok ? "" : reasonText,
    });
  };

  Promise.resolve(sendDiscordAuditLog()).catch((e) => {
    console.warn(
      "[WEB][SPOTIFY] discord log bridge failed:",
      String(e?.message || e)
    );
  });
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

function escapeJsonForInlineScript(value) {
  return JSON.stringify(value ?? {}).replace(/[<>\u2028\u2029]/g, (ch) => {
    if (ch === "<") return "\\u003c";
    if (ch === ">") return "\\u003e";
    if (ch === "\u2028") return "\\u2028";
    if (ch === "\u2029") return "\\u2029";
    return ch;
  });
}

function renderTopbar({ who = "", active = "" } = {}) {
  const safeWho = who ? escapeHtml(who) : "";
  const a = String(active || "").trim().toLowerCase();
  const sectionLabel = a === "swagger" ? "Swagger Docs" : "Admin";
  const link = (href, label, key, extra = "") => {
    const isActive = key && a === String(key).trim().toLowerCase();
    const cls = isActive ? "btn btn--sm" : "btn btn--sm btn--ghost";
    return `<a class="${cls}" href="${href}" ${extra}>${escapeHtml(label)}</a>`;
  };

  const swaggerBtnClass = a === "swagger" ? "btn btn--sm" : "btn btn--sm btn--ghost";

  const right = safeWho
    ? `<div class="row" style="justify-content:flex-end"><a class="${swaggerBtnClass}" href="/swagger">Swagger</a><span class="muted" style="font-size:13px">Logged in as</span><strong>${safeWho}</strong><a class="btn btn--sm btn--danger" href="/admin/logout">Logout</a></div>`
    : `<div class="row" style="justify-content:flex-end"><a class="${swaggerBtnClass}" href="/swagger">Swagger</a><a class="btn btn--sm" href="/admin/login">Login</a></div>`;

  return `<div class="topbar">
    <div class="topbar__brand">
      <a href="/">MainsBot</a>
      <span class="muted">${sectionLabel}</span>
    </div>
    <div class="topbar__links">
      ${link("/", "Home", "home")}
      ${safeWho ? link("/admin", "Admin", "admin") : ""}
      ${safeWho ? link("/admin/quotes", "Quotes", "quotes") : ""}
    </div>
    <div class="topbar__right">${right}</div>
  </div>`;
}

function renderHeadMeta({
  title = "MainsBot",
  description = "Commands + live status and admin dashboard.",
  imagePath = "/favicon.svg",
} = {}) {
  const fullTitle = `${String(title || "MainsBot").trim() || "MainsBot"} | MainsBot`;
  const safeTitle = escapeHtml(fullTitle);
  const safeDescription = escapeHtml(
    String(description || "Commands + live status and admin dashboard.")
  );
  const safeImagePath = escapeHtml(String(imagePath || "/favicon.svg").trim() || "/favicon.svg");
  return `
    <meta name="description" content="${safeDescription}">
    <meta name="theme-color" content="#ffbd59">
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="MainsBot">
    <meta property="og:title" content="${safeTitle}">
    <meta property="og:description" content="${safeDescription}">
    <meta property="og:image" content="${safeImagePath}">
    <meta name="twitter:card" content="summary">
    <meta name="twitter:title" content="${safeTitle}">
    <meta name="twitter:description" content="${safeDescription}">
    <meta name="twitter:image" content="${safeImagePath}">
    <link rel="icon" type="image/svg+xml" href="/favicon.svg">
    <link rel="shortcut icon" href="/favicon.svg">
    <link rel="alternate icon" href="/favicon.ico">
    <link rel="apple-touch-icon" href="/favicon.svg">`;
}

function renderShell({
  title = "MainsBot",
  description = "Commands + live status and admin dashboard.",
  who = "",
  active = "",
  body = "",
} = {}) {
  const cssHref = WEB_BUILD?.cssFile
    ? `/static/gen/${WEB_BUILD.cssFile}`
    : "/static/style.css";
  return `<!doctype html>
  <html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${escapeHtml(title)} | MainsBot</title>
    ${renderHeadMeta({ title, description })}
    <link rel="stylesheet" href="${cssHref}" />
  </head>
  <body>
    <div class="page">
      ${renderTopbar({ who, active })}
      ${body}
    </div>
  </body>
  </html>`;
}

function buildOpenApiSpec({ requestOrigin = "" } = {}) {
  const origin = String(requestOrigin || "").trim() || "http://localhost:8000";
  return {
    openapi: "3.0.3",
    info: {
      title: "MainsBot Admin API",
      version: "1.0.0",
      description: "Admin endpoints for settings, quotes, auth status, and mode apply.",
    },
    servers: [{ url: origin }],
    tags: [
      { name: "Admin" },
      { name: "Auth" },
      { name: "Status" },
      { name: "Spotify" },
      { name: "Roblox" },
    ],
    paths: {
      "/api/admin/session": {
        get: {
          tags: ["Admin"],
          summary: "Get current admin session",
          responses: {
            200: {
              description: "Session payload",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      ok: { type: "boolean" },
                      authenticated: { type: "boolean" },
                      session: { type: "object", additionalProperties: true, nullable: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/api/admin/settings": {
        get: {
          tags: ["Admin"],
          summary: "Get settings JSON payload",
          responses: {
            200: { description: "Settings object" },
            401: { description: "Unauthorized" },
          },
        },
        post: {
          tags: ["Admin"],
          summary: "Save settings JSON payload",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    settings: {
                      type: "object",
                      description: "Settings object to persist.",
                      additionalProperties: true,
                    },
                    settingsText: {
                      type: "string",
                      description: "Raw JSON text alternative.",
                    },
                  },
                },
                examples: {
                  minimal: {
                    value: {
                      settings: {
                        ks: false,
                        timers: true,
                        keywords: true,
                        spamFilter: true,
                        lengthFilter: false,
                        linkFilter: true,
                        currentMode: "!join.on",
                      },
                    },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: "Saved",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      ok: { type: "boolean" },
                      backend: { type: "string", example: "postgres" },
                    },
                  },
                },
              },
            },
            400: { description: "Invalid payload" },
            401: { description: "Unauthorized" },
          },
        },
      },
      "/api/admin/settings-json": {
        get: {
          tags: ["Admin"],
          summary: "Get settings JSON payload",
          responses: {
            200: { description: "Settings object" },
            401: { description: "Unauthorized" },
          },
        },
        post: {
          tags: ["Admin"],
          summary: "Save settings JSON payload",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    settings: { type: "object", additionalProperties: true },
                    settingsText: { type: "string" },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: "Saved" },
            400: { description: "Invalid payload" },
            401: { description: "Unauthorized" },
          },
        },
      },
      "/api/admin/apply-mode": {
        post: {
          tags: ["Admin"],
          summary: "Apply selected mode/title/game to Twitch now",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    mode: { type: "string", example: "!join.on" },
                    titles: { type: "object", additionalProperties: { type: "string" } },
                    modeGames: { type: "object", additionalProperties: { type: "string" } },
                  },
                  required: ["mode"],
                },
              },
            },
          },
          responses: {
            200: { description: "Applied" },
            400: { description: "Invalid mode/payload" },
            401: { description: "Unauthorized" },
          },
        },
      },
      "/api/spotify/add": {
        post: {
          tags: ["Spotify"],
          summary: "Add a Spotify track to queue",
          description:
            "Requires admin session and linked Spotify account. Input accepts Spotify track URL, spotify:track URI, raw 22-char track id, or search text.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    input: {
                      type: "string",
                      example: "https://open.spotify.com/track/7dS5EaCoMnN7DzlpT6aRn2",
                    },
                    limit: {
                      type: "integer",
                      minimum: 1,
                      maximum: 10,
                      description: "Only used for search fallback.",
                      example: 1,
                    },
                  },
                  required: ["input"],
                },
              },
            },
          },
          responses: {
            200: { description: "Track added (or add failed with details)." },
            400: { description: "Validation/auth/linking issue." },
            401: { description: "Unauthorized." },
            405: { description: "Method not allowed." },
          },
        },
      },
      "/api/spotify/skip": {
        post: {
          tags: ["Spotify"],
          summary: "Skip current Spotify track",
          description:
            "Requires admin session and linked Spotify account.",
          responses: {
            200: { description: "Skip attempted." },
            400: { description: "Spotify not linked/configured." },
            401: { description: "Unauthorized." },
            405: { description: "Method not allowed." },
          },
        },
      },
      "/api/roblox/friends/tracked": {
        get: {
          tags: ["Roblox"],
          summary: "List tracked Roblox friend targets (TOUNFRIEND store)",
          description:
            "Admin-only endpoint. Returns tracked Roblox users that can be unfriended later.",
          parameters: [
            {
              in: "query",
              name: "scope",
              required: false,
              schema: {
                type: "string",
                enum: ["all", "temp", "temporary", "perm", "permanent"],
              },
              description: "Filter tracked list by scope.",
            },
          ],
          responses: {
            200: { description: "Tracked users list." },
            401: { description: "Unauthorized." },
          },
        },
      },
      "/api/roblox/friends/current": {
        get: {
          tags: ["Roblox"],
          summary: "Get current Roblox friends for linked account",
          description:
            "Admin-only endpoint. Uses linked Roblox account from OAuth. Optionally pass userId query param.",
          parameters: [
            {
              in: "query",
              name: "userId",
              required: false,
              schema: { type: "string" },
              description: "Optional Roblox user id override.",
            },
            {
              in: "query",
              name: "limit",
              required: false,
              schema: { type: "integer", minimum: 1, maximum: 5000 },
              description: "Maximum entries to return.",
            },
          ],
          responses: {
            200: { description: "Friends list." },
            400: { description: "Roblox account not linked / invalid user id." },
            401: { description: "Unauthorized." },
          },
        },
      },
      "/api/roblox/friends/add": {
        post: {
          tags: ["Roblox"],
          summary: "Send Roblox friend request and track target",
          description:
            "Admin-only endpoint. Adds a user to tracked TOUNFRIEND store after friend request send/confirm.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    username: { type: "string", example: "Builderman" },
                    permanent: { type: "boolean", example: false },
                    source: { type: "string", example: "api" },
                  },
                  required: ["username"],
                },
              },
            },
          },
          responses: {
            200: { description: "Request processed." },
            400: { description: "Validation/configuration issue." },
            401: { description: "Unauthorized." },
          },
        },
      },
      "/api/roblox/friends/unfriend-all": {
        post: {
          tags: ["Roblox"],
          summary: "Unfriend tracked Roblox users in bulk",
          description:
            "Admin-only endpoint. Unfriends tracked temporary users by default; set includePermanent=true to process all tracked users.",
          requestBody: {
            required: false,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    includePermanent: { type: "boolean", example: false },
                    delayMs: { type: "integer", minimum: 0, maximum: 10000, example: 250 },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: "Bulk unfriend result." },
            401: { description: "Unauthorized." },
          },
        },
      },
      "/api/admin/quotes": {
        get: {
          tags: ["Admin"],
          summary: "Get quotes JSON export",
          responses: {
            200: { description: "JSON response" },
            401: { description: "Unauthorized" },
          },
        },
        post: {
          tags: ["Admin"],
          summary: "Mutate quotes",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    action: {
                      type: "string",
                      enum: ["add", "edit", "delete", "replace"],
                    },
                    id: { type: "integer" },
                    text: { type: "string" },
                    quotesText: { type: "string" },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: "Saved" },
            400: { description: "Validation error" },
            401: { description: "Unauthorized" },
          },
        },
      },
      "/api/auth/status": {
        get: {
          tags: ["Auth"],
          summary: "Get public auth/token status snapshot",
          responses: {
            200: { description: "Status payload" },
          },
        },
      },
      "/api/status": {
        get: {
          tags: ["Status"],
          summary: "Get bot runtime status JSON",
          responses: {
            200: { description: "Status payload" },
          },
        },
      },
    },
  };
}

function renderSwaggerUiHtml({ who = "", actor = null } = {}) {
  const safeWho = escapeHtml(String(who || "").trim());
  const safeActorJson = escapeJsonForInlineScript({
    login: String(actor?.login || "").trim(),
    userId: String(actor?.userId || "").trim(),
    mode: String(actor?.mode || "").trim().toLowerCase(),
  });
  const cssHref = WEB_BUILD?.cssFile
    ? `/static/gen/${WEB_BUILD.cssFile}`
    : "/static/style.css";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Swagger | MainsBot</title>
  ${renderHeadMeta({
    title: "Swagger",
    description: "Interactive API docs for MainsBot endpoints.",
  })}
  <link rel="stylesheet" href="${cssHref}" />
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
  <style>
    .swagger-shell {
      margin-top: 16px;
      padding: 16px;
    }
    .swagger-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
      margin-bottom: 14px;
    }
    .swagger-head h1 {
      margin: 10px 0 4px;
      line-height: 1.05;
      letter-spacing: -0.02em;
    }
    .swagger-head .meta {
      color: var(--muted);
      font-size: 14px;
    }
    #swagger-ui {
      max-width: 100%;
      margin: 0;
    }
    .swagger-ui .topbar {
      display: none;
    }
    .swagger-ui .scheme-container {
      background: rgba(0, 0, 0, 0.22);
      box-shadow: none;
      border: 1px solid rgba(255, 197, 84, 0.18);
      border-radius: 12px;
    }
    .swagger-ui .opblock {
      border-radius: 12px;
    }
    .swagger-ui .info p,
    .swagger-ui .info li,
    .swagger-ui .opblock-description-wrapper p,
    .swagger-ui .parameter__name,
    .swagger-ui .response-col_status,
    .swagger-ui .response-col_description,
    .swagger-ui table thead tr th {
      color: var(--text);
    }
    .swagger-ui input,
    .swagger-ui textarea,
    .swagger-ui select {
      background: rgba(0, 0, 0, 0.35) !important;
      color: var(--text) !important;
      border-color: rgba(255, 196, 80, 0.28) !important;
    }
    @media (max-width: 860px) {
      .swagger-shell {
        padding: 14px;
      }
    }
  </style>
</head>
<body>
  <div class="page">
    ${renderTopbar({ who: safeWho, active: "swagger" })}
    <main class="app">
      <section class="card swagger-shell">
        <div class="swagger-head">
          <div>
            <span class="pill">API Docs</span>
            <h1>Swagger</h1>
            <div class="meta">Interactive docs for all public and admin <code>/api/*</code> endpoints.</div>
          </div>
          <div class="row">
            <a class="btn btn--sm btn--ghost" href="/swagger.json" target="_blank" rel="noreferrer">Raw JSON</a>
          </div>
        </div>
        <div id="swagger-ui"></div>
      </section>
    </main>
  </div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    const adminActor = ${safeActorJson};
    window.ui = SwaggerUIBundle({
      url: '/swagger.json',
      dom_id: '#swagger-ui',
      deepLinking: true,
      displayRequestDuration: true,
      persistAuthorization: true,
      requestInterceptor: (req) => {
        try {
          req.headers = req.headers || {};
          req.headers["x-request-source"] = "swagger";

          if (adminActor && adminActor.login) {
            req.headers["x-admin-login"] = adminActor.login;
            req.headers["x-actor-login"] = adminActor.login;
            req.headers["x-discord-username"] = adminActor.login;
          }
          if (adminActor && adminActor.userId) {
            req.headers["x-admin-user-id"] = adminActor.userId;
            req.headers["x-actor-user-id"] = adminActor.userId;
          }
          if (adminActor && adminActor.mode) {
            req.headers["x-admin-mode"] = adminActor.mode;
            req.headers["x-actor-mode"] = adminActor.mode;
            if (adminActor.mode === "twitch") {
              if (adminActor.login) req.headers["x-twitch-login"] = adminActor.login;
              if (adminActor.userId) req.headers["x-twitch-user-id"] = adminActor.userId;
            }
          }
        } catch {}
        return req;
      },
    });
  </script>
</body>
</html>`;
}

function renderReactAdminHtml({ who = "" } = {}) {
  const safeWho = escapeHtml(String(who || "").trim() || "unknown");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>React Admin | MainsBot</title>
  ${renderHeadMeta({
    title: "Admin",
    description: "Manage MainsBot settings, auth, and quotes.",
  })}
  <style>
    :root{--bg:#0f0d06;--panel:#17130a;--line:#5f461e;--text:#f7ebcc;--muted:#b7a886;--accent:#ffbd59;--ok:#45c06a;--warn:#ff6767}
    *{box-sizing:border-box} body{margin:0;background:linear-gradient(180deg,#140f07,#0d0b06);color:var(--text);font:14px/1.45 system-ui,Segoe UI,Arial}
    .wrap{max-width:1100px;margin:24px auto;padding:0 16px}
    .card{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:16px}
    .row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
    .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px}
    .btn{background:#2d2310;border:1px solid #7a5b2b;color:var(--text);padding:10px 14px;border-radius:10px;cursor:pointer}
    .btn:hover{border-color:#b8863c}
    .in,select,textarea{width:100%;background:#0d0a05;border:1px solid #56401c;color:var(--text);border-radius:10px;padding:10px}
    .muted{color:var(--muted)} h1,h2{margin:0 0 10px} label{display:block;font-weight:600;margin-bottom:6px}
    .pill{display:inline-block;background:#2d2310;border:1px solid #7a5b2b;border-radius:999px;padding:4px 10px;color:#ffd086}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card row" style="justify-content:space-between">
      <div><span class="pill">React Admin</span> <span class="muted">Logged in as ${safeWho}</span></div>
      <div class="row">
        <a class="btn" href="/admin">Back</a>
        <a class="btn" href="/swagger">Swagger</a>
        <a class="btn" href="/admin/logout">Logout</a>
      </div>
    </div>
    <div id="app" class="card" style="margin-top:12px">Loadingâ€¦</div>
  </div>

  <script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
  <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
  <script type="text/babel">
    const { useEffect, useState } = React;
    function toCsv(arr){ return Array.isArray(arr) ? arr.join(', ') : ''; }
    function fromCsv(text){ return String(text||'').split(/[,\\n]+/).map(s=>s.trim()).filter(Boolean); }
    function asInt(value, fallback){
      const n = Number(value);
      return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : fallback;
    }
    const FILTER_DEFAULTS = {
      spam: { windowMs: 7000, minMessages: 5, strikeResetMs: 600000, timeoutFirstSec: 30, timeoutRepeatSec: 60, reason: "[AUTOMATIC] Please stop excessively spamming - MainsBot", messageFirst: "{atUser}, please stop excessively spamming.", messageRepeat: "{atUser} Please STOP excessively spamming." },
      length: { maxChars: 400, strikeResetMs: 600000, timeoutFirstSec: 30, timeoutRepeatSec: 60, reason: "[AUTOMATIC] Message exceeds max character limit - MainsBot", message: "{atUser} Message exceeds max character limit." },
      link: { strikeResetMs: 600000, timeoutFirstSec: 1, timeoutRepeatSec: 5, reason: "[AUTOMATIC] No links allowed - MainsBot", message: "{atUser} No links allowed in chat." },
    };
    function normalizeSettings(raw){
      const s = raw && typeof raw === 'object' ? { ...raw } : {};
      const filters = s.filters && typeof s.filters === 'object' ? s.filters : {};
      const spam = filters.spam && typeof filters.spam === 'object' ? filters.spam : {};
      const length = filters.length && typeof filters.length === 'object' ? filters.length : {};
      const link = filters.link && typeof filters.link === 'object' ? filters.link : {};
      s.filters = {
        spam: {
          windowMs: asInt(spam.windowMs, FILTER_DEFAULTS.spam.windowMs),
          minMessages: asInt(spam.minMessages, FILTER_DEFAULTS.spam.minMessages),
          strikeResetMs: asInt(spam.strikeResetMs, FILTER_DEFAULTS.spam.strikeResetMs),
          timeoutFirstSec: asInt(spam.timeoutFirstSec, FILTER_DEFAULTS.spam.timeoutFirstSec),
          timeoutRepeatSec: asInt(spam.timeoutRepeatSec, FILTER_DEFAULTS.spam.timeoutRepeatSec),
          reason: String(spam.reason || FILTER_DEFAULTS.spam.reason),
          messageFirst: String(spam.messageFirst || FILTER_DEFAULTS.spam.messageFirst),
          messageRepeat: String(spam.messageRepeat || FILTER_DEFAULTS.spam.messageRepeat),
        },
        length: {
          maxChars: asInt(length.maxChars, FILTER_DEFAULTS.length.maxChars),
          strikeResetMs: asInt(length.strikeResetMs, FILTER_DEFAULTS.length.strikeResetMs),
          timeoutFirstSec: asInt(length.timeoutFirstSec, FILTER_DEFAULTS.length.timeoutFirstSec),
          timeoutRepeatSec: asInt(length.timeoutRepeatSec, FILTER_DEFAULTS.length.timeoutRepeatSec),
          reason: String(length.reason || FILTER_DEFAULTS.length.reason),
          message: String(length.message || FILTER_DEFAULTS.length.message),
        },
        link: {
          strikeResetMs: asInt(link.strikeResetMs, FILTER_DEFAULTS.link.strikeResetMs),
          timeoutFirstSec: asInt(link.timeoutFirstSec, FILTER_DEFAULTS.link.timeoutFirstSec),
          timeoutRepeatSec: asInt(link.timeoutRepeatSec, FILTER_DEFAULTS.link.timeoutRepeatSec),
          reason: String(link.reason || FILTER_DEFAULTS.link.reason),
          message: String(link.message || FILTER_DEFAULTS.link.message),
        },
      };
      s.linkAllowlistText = toCsv(s.linkAllowlist);
      return s;
    }

    function App(){
      const [loading,setLoading]=useState(true);
      const [status,setStatus]=useState('');
      const [data,setData]=useState(null);

      useEffect(()=>{ (async()=>{
        try{
          const r = await fetch('/admin/settings-json', { credentials:'same-origin' });
          const j = await r.json();
          if(!r.ok) throw new Error(j && j.error ? j.error : (r.status + ' ' + r.statusText));
          setData(j.settings || {});
        }catch(e){
          setStatus('Error: ' + (e && e.message ? e.message : String(e)));
        }finally{
          setLoading(false);
        }
      })(); },[]);

      async function save(){
        if(!data) return;
        setStatus('Saving...');
        try{
          const payload = {
            settings: {
              ...data,
              linkAllowlist: fromCsv(data.linkAllowlistText),
            }
          };
          delete payload.settings.linkAllowlistText;
          const r = await fetch('/admin/settings-json', {
            method:'POST',
            credentials:'same-origin',
            headers:{ 'content-type':'application/json' },
            body: JSON.stringify(payload)
          });
          const j = await r.json();
          if(!r.ok) throw new Error(j && j.error ? j.error : (r.status + ' ' + r.statusText));
          setData({ ...(j.settings||{}), linkAllowlistText: toCsv((j.settings||{}).linkAllowlist) });
          setStatus('Saved (' + (j.backend || 'ok') + ').');
        }catch(e){
          setStatus('Error: ' + (e && e.message ? e.message : String(e)));
        }
      }

      if(loading) return <div>Loading settingsâ€¦</div>;
      if(!data) return <div className="muted">Failed to load settings.</div>;

      const set = (k,v)=>setData(prev=>({ ...(prev||{}), [k]: v }));
      return (
        <div>
          <h1>Settings (React)</h1>
          <div className="muted" style={{marginBottom:12}}>This writes to the same backend as admin save.</div>
          <div className="grid">
            <div>
              <label>Current Mode</label>
              <select value={String(data.currentMode||'')} onChange={e=>set('currentMode', e.target.value)}>
                {Array.isArray(data.validModes) && data.validModes.length
                  ? data.validModes.map(m => <option key={m} value={m}>{m}</option>)
                  : <option value={String(data.currentMode||'!join.on')}>{String(data.currentMode||'!join.on')}</option>}
              </select>
            </div>
            <div>
              <label>Kill Switch</label>
              <input type="checkbox" checked={Boolean(data.ks)} onChange={e=>set('ks', e.target.checked)} />
            </div>
            <div>
              <label>Timers</label>
              <input type="checkbox" checked={Boolean(data.timers)} onChange={e=>set('timers', e.target.checked)} />
            </div>
            <div>
              <label>Keywords</label>
              <input type="checkbox" checked={Boolean(data.keywords)} onChange={e=>set('keywords', e.target.checked)} />
            </div>
            <div>
              <label>Spam Filter</label>
              <input type="checkbox" checked={Boolean(data.spamFilter)} onChange={e=>set('spamFilter', e.target.checked)} />
            </div>
            <div>
              <label>Length Filter</label>
              <input type="checkbox" checked={Boolean(data.lengthFilter)} onChange={e=>set('lengthFilter', e.target.checked)} />
            </div>
            <div>
              <label>Link Filter</label>
              <input type="checkbox" checked={Boolean(data.linkFilter)} onChange={e=>set('linkFilter', e.target.checked)} />
            </div>
            <div style={{gridColumn:'1/-1'}}>
              <label>Link Allowlist (comma separated)</label>
              <input
                className="in"
                value={String(data.linkAllowlistText ?? toCsv(data.linkAllowlist))}
                onChange={e=>set('linkAllowlistText', e.target.value)}
                placeholder="example.com, twitch.tv"
              />
            </div>
          </div>
          <div className="row" style={{marginTop:14}}>
            <button className="btn" onClick={save}>Save</button>
            <span className="muted">{status}</span>
          </div>
        </div>
      );
    }

    ReactDOM.createRoot(document.getElementById('app')).render(<App />);
  </script>
</body>
</html>`;
}

function renderReactAppHtml({ who = "" } = {}) {
  try {
    const adminHtmlPath = path.join(WEB_DIR, "admin", "index.html");
    return fs.readFileSync(adminHtmlPath, "utf8");
  } catch {
    return renderShell({
      title: "Admin",
      who: String(who || ""),
      active: "admin",
      body: '<div class="card"><div class="card__bd"><h1>Admin UI missing</h1><div class="muted">Could not load <code>web/admin/index.html</code>.</div></div></div>',
    });
  }
}

function renderQuotesAppHtml({ who = "" } = {}) {
  try {
    const quotesHtmlPath = path.join(WEB_DIR, "admin", "quotes.html");
    return fs.readFileSync(quotesHtmlPath, "utf8");
  } catch {
    return renderShell({
      title: "Quotes",
      who: String(who || ""),
      active: "admin",
      body: '<div class="card"><div class="card__bd"><h1>Quotes UI missing</h1><div class="muted">Could not load <code>web/admin/quotes.html</code>.</div></div></div>',
    });
  }
}

function renderAdminLoginHtml({
  nextPath = "/admin",
  canWebTwitchLogin = true,
} = {}) {
  try {
    const loginHtmlPath = path.join(WEB_DIR, "admin", "login.html");
    const safeNext = escapeHtml(String(nextPath || "/admin"));
    const twitchHref = `/admin/login?twitch=1&next=${encodeURIComponent(String(nextPath || "/admin"))}`;

    return fs
      .readFileSync(loginHtmlPath, "utf8")
      .replaceAll("__NEXT_PATH__", safeNext)
      .replaceAll("__TWITCH_HREF__", escapeHtml(twitchHref))
      .replaceAll("__LOGIN_GRID_CLASS__", canWebTwitchLogin ? "" : "login-grid--single")
      .replaceAll("__TWITCH_CLASS__", canWebTwitchLogin ? "" : "is-hidden");
  } catch {
    return renderShell({
      title: "Admin Login",
      active: "admin",
      body: `<div class="card"><div class="card__bd"><h1>Admin login UI missing</h1><div class="muted">Could not load <code>web/admin/login.html</code>.</div></div></div>`,
    });
  }
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
    ${renderHeadMeta({
      title: "Twitch Auth",
      description: "Link Twitch bot and streamer accounts for MainsBot.",
    })}
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
        <a class="btn" href="/admin/auth">View Auth Status</a>
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
    ${renderHeadMeta({
      title: "Auth Success",
      description: "OAuth flow complete. Redirecting to admin auth status.",
    })}
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
        <a class="btn" href="/admin/auth">Back To Auth</a>
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
  who = "",
  twitchSnapshot,
  robloxSnapshot,
  spotifySnapshot,
} = {}) {
  const p = String(provider || "").trim().toLowerCase();
  const roleText = escapeHtml(role || "");
  const loginText = escapeHtml(login || "");

  const twitchBotStatus = twitchSnapshot?.bot?.hasAccessToken ? "Connected" : "Not Connected";
  const twitchStreamerStatus = twitchSnapshot?.streamer?.hasAccessToken ? "Connected" : "Not Connected";

  const robloxStatus = robloxSnapshot?.bot?.hasAccessToken ? "Connected" : "Not Connected";
  const robloxLogin = escapeHtml(String(robloxSnapshot?.bot?.login || "").trim() || "");

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

  const body = `<div class="card">
  <div class="card__hd">
    <div>
      <div class="pill">Auth Status</div>
      <h1 style="margin-top:10px">${escapeHtml(headline)}</h1>
      ${detailLine}
    </div>
    <div class="row">
      <a class="btn btn--sm btn--ghost" href="/admin">Back</a>
    </div>
  </div>
  <div class="card__bd">
    <div class="grid grid--2">
      <div class="panel" style="grid-column:1/-1">
        <div class="panel__top">
          <div class="panel__topLeft">
            <div><span class="k">Twitch bot:</span> <span class="${twitchBotStatus === "Connected" ? "ok" : "warn"} status-value">${escapeHtml(twitchBotStatus)}</span></div>
            <div><span class="k">Twitch streamer:</span> <span class="${twitchStreamerStatus === "Connected" ? "ok" : "warn"} status-value">${escapeHtml(twitchStreamerStatus)}</span></div>
          </div>
        </div>
        <div class="row" style="margin-top:10px">
          <a class="btn" href="/auth/twitch/bot">Link Twitch Bot</a>
          <a class="btn" href="/auth/twitch/streamer">Link Twitch Streamer</a>
        </div>
      </div>

      <div class="panel">
        <div class="panel__top">
          <div class="panel__topLeft">
            <div><span class="k">Roblox:</span> <span class="${robloxStatus === "Connected" ? "ok" : "warn"} status-value">${escapeHtml(robloxStatus)}</span>${robloxLogin ? ` <span class="muted">( <code>${robloxLogin}</code> )</span>` : ""}</div>
          </div>
        </div>
        <div class="row" style="margin-top:10px">
          <a class="btn" href="/auth/roblox">Link Roblox</a>
        </div>
      </div>

      <div class="panel">
        <div class="panel__top">
          <div class="panel__topLeft">
            <div><span class="k">Spotify:</span> <span class="${spotifyStatus === "Connected" ? "ok" : "warn"} status-value">${escapeHtml(spotifyStatus)}</span></div>
          </div>
        </div>
        <div class="row" style="margin-top:10px">
          <a class="btn" href="/auth/spotify">Link Spotify</a>
        </div>
      </div>
    </div>
  </div>
</div>`;

  return renderShell({ title: "Auth", who: String(who || ""), active: "auth", body });
}

function renderAuthSuccessRedirectHtml({
  targetPath = "/admin/auth",
  success = true,
  errorText = "",
} = {}) {
  const safeTarget = String(targetPath || "/admin/auth");
  const title = success ? "Link Successful" : "Link Returned Error";
  const description = success
    ? "OAuth link completed. Redirecting to Auth Status in 2 seconds."
    : `OAuth provider returned an error: ${String(errorText || "unknown_error")}. Redirecting to Auth Status in 2 seconds.`;

  const body = `<div class="card">
  <div class="card__hd">
    <div>
      <div class="pill">AUTH</div>
      <h1 style="margin-top:10px">${escapeHtml(title)}</h1>
      <div class="muted" style="margin-top:6px">${escapeHtml(description)}</div>
    </div>
  </div>
  <div class="card__bd">
    <div class="row">
      <a class="btn" href="${escapeHtml(safeTarget)}">Go now</a>
    </div>
  </div>
</div>
<script>
  const target = ${JSON.stringify(safeTarget)};
  setTimeout(() => {
    window.location.replace(target);
  }, 2000);
</script>`;

  return renderShell({ title: "Auth Redirect", body });
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
    ${renderHeadMeta({
      title: "Roblox Auth",
      description: "Link Roblox account access for MainsBot.",
    })}
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
        <a class="btn" href="/admin/auth">Auth Status</a>
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
    ${renderHeadMeta({
      title: "Roblox Auth Success",
      description: "Roblox OAuth flow complete for MainsBot.",
    })}
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
  "/admin.css",
  "/_admin.scss",
  "/static/style.scss",
  "/static/style.css.map",
  "/static/admin.css",
  "/static/_admin.scss",
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

  // IMPORTANT: do not derive cookie security from requestOrigin, since requestOrigin can be forced via WEB_ORIGIN.
  // Use the actual incoming request scheme (or x-forwarded-proto) so local http logins don't drop the cookie.
  const isSecureRequest = getIsSecureRequest(req);
    const adminSession = WEB_ADMIN_AUTH.readSession(req);
    const adminAllowed = isAdminAllowedSession(adminSession);
    const authManagerAllowed = isAuthManagerSession(adminSession);

  const webAdminRedirectUriOverride = String(process.env.WEB_ADMIN_REDIRECT_URI || "").trim();
  const webAdminOriginOverride = String(process.env.WEB_ADMIN_ORIGIN || "").trim();

  // We intentionally reuse /auth/callback for admin web login so the Twitch app only needs one callback URL.
  const webLoginRedirectUri = webAdminRedirectUriOverride
    ? webAdminRedirectUriOverride
    : `${(webAdminOriginOverride || requestOrigin).replace(/\/+$/, "")}/auth/callback`;

  if (routePath === "/favicon.ico") {
    return sendRedirect(res, "/favicon.svg", 302);
  }

  if (routePath === "/swagger.json") {
    return sendJsonResponse(
      res,
      200,
      buildOpenApiSpec({ requestOrigin }),
      { "cache-control": "no-store" }
    );
  }

  if (routePath === "/swagger") {
    return sendHtmlResponse(
      res,
      200,
      renderSwaggerUiHtml({
        who: adminAllowed ? String(adminSession?.login || "") : "",
        actor: adminAllowed ? adminSession || null : null,
      }),
      { "cache-control": "no-store" }
    );
  }

  if (routePath === "/admin/login") {
    try {
      if (String(parsedUrl.searchParams.get("debug") || "") === "1") {
        return sendJsonResponse(
          res,
          200,
          {
            ok: true,
            authMode: usePasswordAuth ? "password" : "twitch",
            requestOrigin,
            isSecureRequest,
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

      if (adminAllowed) {
        const nextPath = sanitizeNextPath(parsedUrl.searchParams.get("next"));
        return sendRedirect(res, nextPath || "/admin");
      }

      const nextPath = sanitizeNextPath(parsedUrl.searchParams.get("next")) || "/admin";
      const wantsTwitchLogin = String(parsedUrl.searchParams.get("twitch") || "") === "1";

      const canWebTwitchLogin =
        !!String(process.env.CLIENT_ID || "").trim() &&
        !!String(process.env.CLIENT_SECRET || "").trim();

      if (usePasswordAuth && !wantsTwitchLogin) {
        if (!passwordAuthConfigured) {
          return sendErrorPage(
            res,
            500,
            "Admin Login Not Configured",
            "Password login is enabled, but [web].admin_username + [web].admin_password (or admin_password_hash) are not set in your INI."
          );
        }

        if (method === "GET") {
          return sendHtmlResponse(
            res,
            200,
            renderAdminLoginHtml({
              nextPath,
              canWebTwitchLogin,
            }),
            { "cache-control": "no-store" }
          );
        }

        if (method === "POST") {
          try {
            const contentType = String(req?.headers?.["content-type"] || "")
              .split(";")[0]
              .trim()
              .toLowerCase();

            let username = "";
            let password = "";
            let next = nextPath;

            if (contentType === "application/json") {
              const body = await readJsonBody(req, { limitBytes: 16 * 1024 });
              username = String(body?.username || "");
              password = String(body?.password || "");
              next = sanitizeNextPath(body?.next) || nextPath;
            } else {
              const text = await readRequestBodyText(req, { limitBytes: 16 * 1024 });
              const params = new URLSearchParams(text);
              username = String(params.get("username") || "");
              password = String(params.get("password") || "");
              next = sanitizeNextPath(params.get("next")) || nextPath;
            }

            const ok = verifyAdminPasswordLogin({ username, password });
            if (!ok?.ok) {
              return sendErrorPage(res, 403, "Forbidden", ok?.error || "Invalid username or password.");
            }

            WEB_ADMIN_AUTH.setSessionCookie(
              res,
              { userId: "password", login: normalizeLogin(WEB_ADMIN_USERNAME), mode: "password" },
              { secure: isSecureRequest }
            );
            return sendRedirect(res, next || "/admin");
          } catch (e) {
            console.error("[WEB][ADMIN] password login failed:", e);
            return sendErrorPage(res, 500, "Login Failed", String(e?.message || e));
          }
        }

        return sendErrorPage(res, 405, "Method Not Allowed", "Use GET or POST.");
      }

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
    return sendRedirect(res, "/admin/login");
  }

  if (routePath === "/admin/session" || routePath === "/api/admin/session") {
    return sendJsonResponse(
      res,
      200,
      {
        ok: true,
        allowed: Boolean(adminAllowed),
        login: adminAllowed ? String(adminSession?.login || "") : null,
        userId: adminAllowed ? String(adminSession?.userId || "") : null,
        mode: adminAllowed ? String(adminSession?.mode || "") : null,
      },
      { "cache-control": "no-store" }
    );
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
    return sendHtmlResponse(
      res,
      200,
      renderReactAppHtml({ who: String(adminSession?.login || "") }),
      { "cache-control": "no-store" }
    );
  }

  if (routePath === "/admin/auth") {
    if (!adminAllowed) {
      const next = encodeURIComponent(`${routePath}${parsedUrl.search || ""}`);
      return sendRedirect(res, `/admin/login?next=${next}`);
    }
    if (!authManagerAllowed) {
      return sendErrorPage(
        res,
        403,
        "Forbidden",
        "Auth management is restricted to the owner, streamer account, or bot account."
      );
    }
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
        who: String(adminSession?.login || ""),
        twitchSnapshot: authSnapshot(),
        robloxSnapshot: robloxAuthSnapshot(),
        spotifySnapshot: spotifyAuthSnapshot(),
      }),
      { "cache-control": "no-store" }
    );
  }

  if (routePath === "/admin/quotes" || routePath === "/api/admin/quotes") {
    const isQuotesApi = routePath === "/api/admin/quotes";
    if (!adminAllowed) {
      if (isQuotesApi || method === "POST") {
        return sendJsonResponse(res, 401, { ok: false, error: "Unauthorized" }, { "cache-control": "no-store" });
      }
      return sendRedirect(res, "/admin/login");
    }

    if (method === "GET") {
      const format = String(parsedUrl.searchParams.get("format") || "").trim().toLowerCase();
      const data = loadQuotes();

      if (isQuotesApi || format === "json") {
        res.writeHead(200, {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store",
        });
        return res.end(JSON.stringify(data, null, 2));
      }

      return sendHtmlResponse(
        res,
        200,
        renderQuotesAppHtml({ who: String(adminSession?.login || "") }),
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

    if (isQuotesApi) {
      return sendJsonResponse(
        res,
        405,
        { ok: false, error: "Method not allowed." },
        { "cache-control": "no-store" }
      );
    }
    return sendErrorPage(res, 405, "Method Not Allowed", "Use GET or POST.");
  }
  if (routePath === "/admin/react") {
    if (!adminAllowed) {
      return sendRedirect(res, "/admin/login");
    }
    return sendHtmlResponse(
      res,
      200,
      renderReactAppHtml({ who: String(adminSession?.login || "") }),
      { "cache-control": "no-store" }
    );
  }

  if (
    routePath === "/admin/settings-json" ||
    routePath === "/api/admin/settings" ||
    routePath === "/api/admin/settings-json"
  ) {
    if (!adminAllowed) {
      return sendJsonResponse(
        res,
        401,
        { ok: false, error: "Unauthorized" },
        { "cache-control": "no-store" }
      );
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

      const sanitizedSettingsObj = sanitizeSettingsForStorage(settingsObj);
      const backendRaw = String(process.env.STATE_BACKEND || "file").trim().toLowerCase();
      const backend = backendRaw === "pg" ? "postgres" : (backendRaw || "file");
      return sendJsonResponse(
        res,
        200,
        { ok: true, settings: sanitizedSettingsObj, backend },
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

        const nextForSanitize = Object.assign({}, next);
        delete nextForSanitize.currentGame;
        const sanitized = sanitizeSettingsForStorage(nextForSanitize);

        try {
          const existingRaw = fs.readFileSync(SETTINGS_FILE_PATH, "utf8");
          const existingParsed = safeJsonParse(existingRaw, null);
          if (existingParsed && typeof existingParsed === "object" && !Array.isArray(existingParsed)) {
            const existingGame = String(existingParsed.currentGame || "").trim();
            if (existingGame) sanitized.currentGame = existingGame;
          }
        } catch {}

        fs.mkdirSync(path.dirname(SETTINGS_FILE_PATH), { recursive: true });
        fs.writeFileSync(SETTINGS_FILE_PATH, JSON.stringify(sanitized, null, 2), "utf8");
        await flushStateNow();

        const backendRaw = String(process.env.STATE_BACKEND || "file").trim().toLowerCase();
        const backend = backendRaw === "pg" ? "postgres" : (backendRaw || "file");
        return sendJsonResponse(
          res,
          200,
          { ok: true, settings: sanitized, backend },
          { "cache-control": "no-store" }
        );
      } catch (e) {
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

  if (routePath === "/admin/settings") {
    if (!adminAllowed) {
      if (method === "POST") {
        return sendJsonResponse(
          res,
          401,
          { ok: false, error: "Unauthorized" },
          { "cache-control": "no-store" }
        );
      }
      return sendRedirect(res, "/admin/login");
    }

    if (method === "GET") {
      return sendRedirect(res, "/admin#settings");
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

        const nextForSanitize = Object.assign({}, next);
        delete nextForSanitize.currentGame;
        const sanitized = sanitizeSettingsForStorage(nextForSanitize);

        try {
          const existingRaw = fs.readFileSync(SETTINGS_FILE_PATH, "utf8");
          const existingParsed = safeJsonParse(existingRaw, null);
          if (existingParsed && typeof existingParsed === "object" && !Array.isArray(existingParsed)) {
            const existingGame = String(existingParsed.currentGame || "").trim();
            if (existingGame) sanitized.currentGame = existingGame;
          }
        } catch {}

        fs.mkdirSync(path.dirname(SETTINGS_FILE_PATH), { recursive: true });
        fs.writeFileSync(SETTINGS_FILE_PATH, JSON.stringify(sanitized, null, 2), "utf8");
        await flushStateNow();

        const backendRaw = String(process.env.STATE_BACKEND || "file").trim().toLowerCase();
        const backend = backendRaw === "pg" ? "postgres" : (backendRaw || "file");
        return sendJsonResponse(res, 200, { ok: true, backend }, { "cache-control": "no-store" });
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
  if (routePath === "/admin/apply-mode" || routePath === "/api/admin/apply-mode") {
    if (!adminAllowed) {
      return sendJsonResponse(
        res,
        401,
        { ok: false, error: "Unauthorized" },
        { "cache-control": "no-store" }
      );
    }

    if (method !== "POST") {
      return sendJsonResponse(
        res,
        405,
        { ok: false, error: "Method not allowed." },
        { "cache-control": "no-store" }
      );
    }

    try {
      const body = await readJsonBody(req, { limitBytes: 256 * 1024 });
      const mode = String(body?.mode || "").trim();
      const titles =
        body?.titles && typeof body.titles === "object" && !Array.isArray(body.titles)
          ? body.titles
          : null;
      const modeGames =
        body?.modeGames && typeof body.modeGames === "object" && !Array.isArray(body.modeGames)
          ? body.modeGames
          : null;

      if (!mode) {
        return sendJsonResponse(
          res,
          400,
          { ok: false, error: "Missing mode." },
          { "cache-control": "no-store" }
        );
      }

      const MODE_TO_TWITCH = {
        "!join.on": { titleKey: "join", gameName: "Roblox" },
        "!link.on": { titleKey: "link", gameName: "Roblox" },
        "!1v1.on": { titleKey: "1v1", gameName: "Roblox" },
        "!ticket.on": { titleKey: "ticket", gameName: "Roblox" },
        "!val.on": { titleKey: "val", gameName: "VALORANT" },
        "!reddit.on": { titleKey: "reddit", gameName: "Just Chatting" },
      };

      const cfg = MODE_TO_TWITCH[mode];
      if (!cfg) {
        return sendJsonResponse(
          res,
          400,
          { ok: false, error: `Unsupported mode: ${mode}` },
          { "cache-control": "no-store" }
        );
      }

      let settingsObj = {};
      try {
        const raw = fs.readFileSync(SETTINGS_FILE_PATH, "utf8");
        const parsed = safeJsonParse(raw, null);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          settingsObj = parsed;
        }
      } catch {}

      const mergedTitles = {
        ...(settingsObj?.titles && typeof settingsObj.titles === "object"
          ? settingsObj.titles
          : {}),
        ...(titles || {}),
      };

      const title = String(mergedTitles?.[cfg.titleKey] || "").trim();
      if (!title) {
        return sendJsonResponse(
          res,
          400,
          { ok: false, error: `No title set for titles.${cfg.titleKey}` },
          { "cache-control": "no-store" }
        );
      }

      const auth = await getRoleAccessToken({ role: TWITCH_ROLES.STREAMER });
      if (!auth?.accessToken || !auth?.clientId) {
        return sendJsonResponse(
          res,
          400,
          {
            ok: false,
            error: "Missing streamer OAuth token/client id. Link Twitch streamer first.",
          },
          { "cache-control": "no-store" }
        );
      }

      const broadcasterId = TWITCH_CHANNEL_ID || String(auth.userId || "").trim();
      if (!broadcasterId) {
        return sendJsonResponse(
          res,
          400,
          { ok: false, error: "Missing broadcaster id (set [twitch].channel_id)." },
          { "cache-control": "no-store" }
        );
      }

      const gameNameOverride = String(
        (modeGames && modeGames[mode]) ||
          (settingsObj?.modeGames && settingsObj.modeGames[mode]) ||
          cfg.gameName ||
          ""
      ).trim();

      const gameId = gameNameOverride
        ? await getGameIdByName({
          token: auth.accessToken,
          clientId: auth.clientId,
          name: gameNameOverride,
        })
        : null;

      await updateChannelInfo({
        broadcasterId,
        token: auth.accessToken,
        clientId: auth.clientId,
        title,
        gameId: gameId || undefined,
      });

      return sendJsonResponse(res, 200, { ok: true }, { "cache-control": "no-store" });
    } catch (e) {
      console.error("[WEB][ADMIN] apply-mode failed:", e);
      return sendJsonResponse(
        res,
        500,
        { ok: false, error: String(e?.message || e) },
        { "cache-control": "no-store" }
      );
    }
  }

  if (
    routePath === "/admin/spotify/add" ||
    routePath === "/admin/spotify/skip" ||
    routePath === "/api/spotify/add" ||
    routePath === "/api/spotify/skip"
  ) {
    if (!adminAllowed) {
      logSpotifyAdminAudit(req, {
        adminSession,
        action: routePath.includes("skip") ? "skip" : "add",
        routePath,
        ok: false,
        reason: "unauthorized",
      });
      return sendJsonResponse(
        res,
        401,
        { ok: false, error: "Unauthorized" },
        { "cache-control": "no-store" }
      );
    }

    if (method !== "POST") {
      logSpotifyAdminAudit(req, {
        adminSession,
        action: routePath.includes("skip") ? "skip" : "add",
        routePath,
        ok: false,
        reason: `method_not_allowed:${method}`,
      });
      return sendJsonResponse(
        res,
        405,
        { ok: false, error: "Method not allowed." },
        { "cache-control": "no-store" }
      );
    }

    const spotifySnapshot = getPublicSpotifyTokenSnapshot();
    if (!spotifySnapshot?.hasClientId || !spotifySnapshot?.hasClientSecret) {
      return sendJsonResponse(
        res,
        400,
        { ok: false, error: "Spotify API is not configured. Set [spotify] client_id + client_secret." },
        { "cache-control": "no-store" }
      );
    }
    if (!spotifySnapshot?.hasRefreshToken) {
      return sendJsonResponse(
        res,
        400,
        { ok: false, error: "Spotify is not linked. Visit /auth/spotify first." },
        { "cache-control": "no-store" }
      );
    }

    if (routePath === "/admin/spotify/skip" || routePath === "/api/spotify/skip") {
      try {
        const result = await SPOTIFY.skipNext();
        logSpotifyAdminAudit(req, {
          adminSession,
          action: "skip",
          routePath,
          ok: Boolean(result?.ok),
          spotifyStatus: Number(result?.status || 0) || null,
          reason: result?.ok ? "" : "spotify_skip_not_ok",
        });
        return sendJsonResponse(
          res,
          200,
          {
            ok: Boolean(result?.ok),
            action: "skip",
            spotifyStatus: Number(result?.status || 0) || null,
            raw: result?.raw ?? null,
          },
          { "cache-control": "no-store" }
        );
      } catch (e) {
        logSpotifyAdminAudit(req, {
          adminSession,
          action: "skip",
          routePath,
          ok: false,
          reason: String(e?.message || e),
        });
        console.error("[WEB][SPOTIFY] skip failed:", e);
        return sendJsonResponse(
          res,
          500,
          { ok: false, error: String(e?.message || e) },
          { "cache-control": "no-store" }
        );
      }
    }

    try {
      const body = await readJsonBody(req, { limitBytes: 64 * 1024 });
      const input = String(
        body?.input ?? body?.track ?? body?.query ?? ""
      ).trim();
      const searchLimit = Math.max(1, Math.min(10, Number(body?.limit) || 1));

      if (!input) {
        logSpotifyAdminAudit(req, {
          adminSession,
          action: "add",
          routePath,
          ok: false,
          reason: "missing_input",
        });
        return sendJsonResponse(
          res,
          400,
          { ok: false, error: "Missing input. Provide a Spotify URL/URI/id or search text." },
          { "cache-control": "no-store" }
        );
      }

      let uri = SPOTIFY.parseSpotifyTrackUri(input);
      let track = null;
      let source = "uri";

      if (!uri) {
        source = "search";
        const search = await SPOTIFY.searchTrack(input, searchLimit);
        track = search?.tracks?.[0] || null;
        uri = String(track?.uri || "").trim();
        if (!search?.ok || !uri) {
          logSpotifyAdminAudit(req, {
            adminSession,
            action: "add",
            routePath,
            ok: false,
            source,
            input,
            reason: "no_track_found",
          });
          return sendJsonResponse(
            res,
            400,
            { ok: false, error: "No Spotify track found for that input." },
            { "cache-control": "no-store" }
          );
        }
      }

      const result = await SPOTIFY.addToQueue(uri);
      logSpotifyAdminAudit(req, {
        adminSession,
        action: "add",
        routePath,
        ok: Boolean(result?.ok),
        source,
        input,
        uri,
        trackName: String(track?.name || ""),
        trackArtists: String(track?.artists || ""),
        spotifyStatus: Number(result?.status || 0) || null,
        reason: result?.ok ? "" : "spotify_add_not_ok",
      });
      return sendJsonResponse(
        res,
        200,
        {
          ok: Boolean(result?.ok),
          action: "add",
          source,
          input,
          uri,
          track: track
            ? {
              name: String(track?.name || ""),
              artists: String(track?.artists || ""),
              url: String(track?.url || ""),
            }
            : null,
          spotifyStatus: Number(result?.status || 0) || null,
          raw: result?.raw ?? null,
        },
        { "cache-control": "no-store" }
      );
    } catch (e) {
      logSpotifyAdminAudit(req, {
        adminSession,
        action: "add",
        routePath,
        ok: false,
        reason: String(e?.message || e),
      });
      console.error("[WEB][SPOTIFY] add failed:", e);
      return sendJsonResponse(
        res,
        500,
        { ok: false, error: String(e?.message || e) },
        { "cache-control": "no-store" }
      );
    }
  }

  const isRobloxFriendsApi =
    routePath === "/api/roblox/friends/tracked" ||
    routePath === "/api/roblox/friends/current" ||
    routePath === "/api/roblox/friends/add" ||
    routePath === "/api/roblox/friends/unfriend-all";

  if (isRobloxFriendsApi) {
    if (!adminAllowed) {
      return sendJsonResponse(
        res,
        401,
        { ok: false, error: "Unauthorized" },
        { "cache-control": "no-store" }
      );
    }

    if (routePath === "/api/roblox/friends/tracked") {
      if (method !== "GET") {
        return sendJsonResponse(
          res,
          405,
          { ok: false, error: "Method not allowed." },
          { "cache-control": "no-store" }
        );
      }

      const scopeRaw = String(parsedUrl.searchParams.get("scope") || "all")
        .trim()
        .toLowerCase();
      const validScopes = new Set(["all", "temp", "temporary", "perm", "permanent"]);
      if (!validScopes.has(scopeRaw)) {
        return sendJsonResponse(
          res,
          400,
          {
            ok: false,
            error: "Invalid scope. Use one of: all, temp, temporary, perm, permanent.",
          },
          { "cache-control": "no-store" }
        );
      }

      const entries = listTrackedRobloxFriends({ scope: scopeRaw });
      return sendJsonResponse(
        res,
        200,
        {
          ok: true,
          moduleEnabled: isRobloxModuleEnabled(),
          scope: scopeRaw,
          count: entries.length,
          entries,
        },
        { "cache-control": "no-store" }
      );
    }

    if (routePath === "/api/roblox/friends/current") {
      if (method !== "GET") {
        return sendJsonResponse(
          res,
          405,
          { ok: false, error: "Method not allowed." },
          { "cache-control": "no-store" }
        );
      }

      const snapshot = getPublicRobloxTokenSnapshot();
      const userIdQuery = Number(parsedUrl.searchParams.get("userId") || 0);
      const linkedUserId = userIdQuery > 0 ? userIdQuery : Number(snapshot?.bot?.userId || 0);

      if (!linkedUserId || !Number.isFinite(linkedUserId)) {
        return sendJsonResponse(
          res,
          400,
          {
            ok: false,
            error: "Roblox account is not linked. Link Roblox first or pass ?userId=...",
          },
          { "cache-control": "no-store" }
        );
      }

      const limit = Math.max(
        1,
        Math.min(5000, Number(parsedUrl.searchParams.get("limit") || 500) || 500)
      );

      try {
        const friends = await ROBLOX.getCurrentUserFriends(linkedUserId);
        const sliced = Array.isArray(friends) ? friends.slice(0, limit) : [];
        const entries = sliced.map((friend) => ({
          userId: String(friend?.id || ""),
          username: String(friend?.name || "").trim(),
          displayName: String(friend?.displayName || "").trim(),
          isBanned: Boolean(friend?.isBanned),
          created: String(friend?.created || "").trim() || null,
        }));

        return sendJsonResponse(
          res,
          200,
          {
            ok: true,
            linkedUserId: String(linkedUserId),
            count: entries.length,
            totalFetched: Array.isArray(friends) ? friends.length : 0,
            limit,
            entries,
          },
          { "cache-control": "no-store" }
        );
      } catch (e) {
        console.error("[WEB][ROBLOX] friends/current failed:", e);
        return sendJsonResponse(
          res,
          500,
          { ok: false, error: String(e?.message || e) },
          { "cache-control": "no-store" }
        );
      }
    }

    if (routePath === "/api/roblox/friends/add") {
      if (method !== "POST") {
        return sendJsonResponse(
          res,
          405,
          { ok: false, error: "Method not allowed." },
          { "cache-control": "no-store" }
        );
      }

      if (!isRobloxModuleEnabled()) {
        return sendJsonResponse(
          res,
          400,
          { ok: false, error: "Roblox module is disabled for this instance." },
          { "cache-control": "no-store" }
        );
      }

      try {
        const body = await readJsonBody(req, { limitBytes: 64 * 1024 });
        const targetName = String(body?.username ?? body?.targetName ?? "")
          .trim()
          .split(/\s+/)[0];
        const permanent = parseBooleanInput(body?.permanent, false);
        const source = String(body?.source || (permanent ? "permadd" : "api"))
          .trim()
          .toLowerCase();

        if (!targetName) {
          return sendJsonResponse(
            res,
            400,
            { ok: false, error: "Missing username." },
            { "cache-control": "no-store" }
          );
        }

        const result = await addTrackedRobloxFriend({
          targetName,
          requestedBy: String(adminSession?.login || "").trim(),
          permanent,
          source: source || (permanent ? "permadd" : "api"),
        });

        const ok = result?.status === "success" || result?.status === "already";
        const statusMap = {
          disabled: 400,
          missing_username: 400,
          validate_error: 502,
          invalid_username: 400,
          rate_limited: 429,
          send_error: 502,
          success: 200,
          already: 200,
        };
        const statusCode = Number(statusMap[result?.status]) || (ok ? 200 : 400);

        return sendJsonResponse(
          res,
          statusCode,
          { ok, result },
          { "cache-control": "no-store" }
        );
      } catch (e) {
        return sendJsonResponse(
          res,
          400,
          { ok: false, error: String(e?.message || e) },
          { "cache-control": "no-store" }
        );
      }
    }

    if (method !== "POST") {
      return sendJsonResponse(
        res,
        405,
        { ok: false, error: "Method not allowed." },
        { "cache-control": "no-store" }
      );
    }

    if (!isRobloxModuleEnabled()) {
      return sendJsonResponse(
        res,
        400,
        { ok: false, error: "Roblox module is disabled for this instance." },
        { "cache-control": "no-store" }
      );
    }

    try {
      const body = await readJsonBody(req, { limitBytes: 64 * 1024 });
      const includePermanent = parseBooleanInput(body?.includePermanent, false);
      const delayMs = Math.max(0, Math.min(10_000, Number(body?.delayMs) || 250));

      const outcome = await unfriendTrackedRobloxFriends({
        includePermanent,
        delayMs,
      });

      return sendJsonResponse(
        res,
        200,
        {
          ok: true,
          includePermanent,
          delayMs,
          result: outcome,
        },
        { "cache-control": "no-store" }
      );
    } catch (e) {
      return sendJsonResponse(
        res,
        400,
        { ok: false, error: String(e?.message || e) },
        { "cache-control": "no-store" }
      );
    }
  }

  if (lowerUrlPath.startsWith("/auth") && !adminAllowed) {
    // Allow OAuth callbacks without an admin session (the callback is what *creates* the session/tokens).
    if (
      routePath === "/auth/callback" ||
      routePath === "/auth/roblox/callback" ||
      routePath === "/auth/spotify/callback" ||
      (routePath === "/auth/success" && parsedUrl.searchParams.has("code"))
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

  // Use /auth as a shortcut to admin auth status.
  if (routePath === "/auth") {
    if (!adminAllowed) {
      const next = encodeURIComponent(`${routePath}${parsedUrl.search || ""}`);
      return sendRedirect(res, `/admin/login?next=${next}`);
    }
    if (!authManagerAllowed) {
      return sendErrorPage(
        res,
        403,
        "Forbidden",
        "Auth management is restricted to the owner, streamer account, or bot account."
      );
    }
    return sendRedirect(res, "/admin/auth");
  }

  if (routePath === "/auth/status" || routePath === "/api/auth/status") {
    const twitch = authSnapshot();
    const roblox = robloxAuthSnapshot();
    const spotify = spotifyAuthSnapshot();
    const ownerLogin = String(WEB_OWNER_LOGIN || "").trim().toLowerCase();
    const ownerUserId = String(WEB_OWNER_USER_ID || "").trim();

    return sendJsonResponse(
      res,
      200,
      {
        ...twitch,
        roblox,
        spotify,
        session: {
          allowed: Boolean(adminAllowed),
          canManageAuth: Boolean(adminAllowed && authManagerAllowed),
          login: adminAllowed ? String(adminSession?.login || "").trim().toLowerCase() : null,
          userId: adminAllowed ? String(adminSession?.userId || "").trim() : null,
          mode: adminAllowed ? String(adminSession?.mode || "").trim().toLowerCase() : null,
        },
        identities: {
          ownerLogin: ownerLogin || null,
          ownerUserId: ownerUserId || null,
          botLogin: String(twitch?.bot?.login || TWITCH_BOT_NAME || "").trim().toLowerCase() || null,
          botUserId: String(twitch?.bot?.userId || TWITCH_BOT_ID || "").trim() || null,
          streamerLogin: String(twitch?.streamer?.login || TWITCH_CHANNEL_NAME || "").trim().toLowerCase() || null,
          streamerUserId: String(twitch?.streamer?.userId || TWITCH_CHANNEL_ID || "").trim() || null,
        },
      },
      { "cache-control": "no-store" }
    );
  }

  if (routePath === "/auth/debug") {
    const reqIpInfo = getRequestIpInfo(req);
    return sendJsonResponse(
      res,
      200,
      {
        ok: true,
        requestOrigin,
        host: String(req?.headers?.host || ""),
        forwardedHost: String(req?.headers?.["x-forwarded-host"] || ""),
        forwardedProto: String(req?.headers?.["x-forwarded-proto"] || ""),
        requestIp: String(reqIpInfo?.ip || "unknown"),
        requestIpSource: String(reqIpInfo?.source || "unknown"),
        requestIpChain: Array.isArray(reqIpInfo?.chain) ? reqIpInfo.chain : [],
        webOriginOverride: String(process.env.WEB_ORIGIN || process.env.WEB_BASE_URL || "").trim() || null,
        twitch: {
          redirectUri: String(authSettings?.redirectUri || "").trim() || null,
          dynamicRedirect: String(process.env.TWITCH_AUTH_DYNAMIC_REDIRECT || "").trim() || null,
          configuredRedirectUri: String(process.env.TWITCH_AUTH_REDIRECT_URI || "").trim() || null,
        },
        roblox: {
          redirectUri: String(robloxAuthSettings?.redirectUri || "").trim() || null,
          dynamicRedirect: String(process.env.ROBLOX_AUTH_DYNAMIC_REDIRECT || "").trim() || null,
          configuredRedirectUri: String(process.env.ROBLOX_AUTH_REDIRECT_URI || "").trim() || null,
        },
        spotify: {
          redirectUri: String(spotifyAuthSettings?.redirectUri || "").trim() || null,
          dynamicRedirect: String(process.env.SPOTIFY_AUTH_DYNAMIC_REDIRECT || "").trim() || null,
          configuredRedirectUri: String(process.env.SPOTIFY_AUTH_REDIRECT_URI || "").trim() || null,
        },
      },
      { "cache-control": "no-store" }
    );
  }

  // Direct auth start endpoints (no landing pages).
  if (routePath === "/auth/spotify") {
    if (!authManagerAllowed) {
      return sendErrorPage(
        res,
        403,
        "Forbidden",
        "Spotify linking is restricted to the owner or streamer account."
      );
    }
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
    if (!authManagerAllowed) {
      return sendErrorPage(
        res,
        403,
        "Forbidden",
        "Roblox linking is restricted to the owner or streamer account."
      );
    }
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
    if (!authManagerAllowed) {
      return sendErrorPage(
        res,
        403,
        "Forbidden",
        "Twitch token linking is restricted to the owner, streamer account, or bot account."
      );
    }
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

        let isMod = false;
        try {
          if (TWITCH_CHANNEL_ID && user?.userId) {
            isMod = await isUserModerator({
              broadcasterId: TWITCH_CHANNEL_ID,
              userId: String(user.userId),
              preferredRole: "streamer",
            });
          }
        } catch {}

        const session = { userId: user.userId, login: user.login, mode: "twitch", isMod };
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
              `- allowed_users (comma separated logins), or\n` +
              `- make this user a moderator in the channel.\n\n` +
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
      if (stateMeta.provider === "roblox") {
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
      }

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
    const oauthError = String(parsedUrl.searchParams.get("error") || "").trim();
    const oauthErrorDescription = String(parsedUrl.searchParams.get("error_description") || "").trim();
    const redirectTarget = `/admin/auth${parsedUrl.search || ""}`;
    return sendHtmlResponse(
      res,
      oauthError ? 400 : 200,
      renderAuthSuccessRedirectHtml({
        targetPath: redirectTarget,
        success: !oauthError,
        errorText: oauthErrorDescription || oauthError,
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

  if (routePath === "/status" || routePath === "/api/status") {
    res.writeHead(200, {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    });
    return res.end(JSON.stringify(getStatusSnapshot()));
  }

  if (routePath === "/home" || routePath === "/index.html") {
    if (WEB_BUILD?.html) {
      return sendHtmlResponse(res, 200, WEB_BUILD.html);
    }
    const homePath = path.join(WEB_DIR, "index.html");
    try {
      const html = fs.readFileSync(homePath, "utf8");
      return sendHtmlResponse(res, 200, html);
    } catch (e) {
      return sendErrorPage(
        res,
        500,
        "Server Error",
        `Failed to load home page: ${String(e?.message || e)}`
      );
    }
  }

  if (routePath === "/admin.html") {
    return sendRedirect(res, "/admin");
  }

  if (routePath === "/static/admin.css" || routePath === "/admin.css") {
    // Old asset path from previous versions.
    return sendRedirect(res, "/static/style.css", 302);
  }

  if (routePath === "/static/style.css" || routePath === "/style.css") {
    if (WEB_BUILD?.cssFile) {
      return sendRedirect(res, `/static/gen/${WEB_BUILD.cssFile}`, 302);
    }

    const fallbackCss = compileScssToCssText();
    if (fallbackCss.trim()) {
      return sendCssResponse(res, 200, fallbackCss, SCSS_PATH, {
        "cache-control": "no-store",
      });
    }

    return sendErrorPage(res, 404, "Not Found", "Stylesheet not available yet.");
  }

  if (routePath === "/static/base.js" || routePath === "/base.js") {
    if (WEB_BUILD?.jsFile) {
      return sendRedirect(res, `/static/gen/${WEB_BUILD.jsFile}`, 302);
    }
  }

  if (routePath === "/") {
    return sendRedirect(res, "/home");
  }

  let filePath;
  {
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
