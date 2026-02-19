let chatByUser = {};

import { initDiscord, EmbedBuilder } from "./discord/index.js";

const DISCORD = initDiscord({ logger: console });
const webhookClient = DISCORD.webhookClient;
const discordMessenger = DISCORD.discordMessenger;
const DISCORD_ANNOUNCE_CHANNEL_ID = DISCORD.announceChannelId;
const logDiscordModAction = DISCORD.logModAction;

import fs from "fs";
import fetch from "node-fetch";
import { setTimeout as delay } from "timers/promises";

import path from "path";
import { fileURLToPath } from "url";

import { flushStateNow } from "../data/postgres/stateInterceptor.js";

//functions
import * as ROBLOX_FUNCTIONS from "./api/roblox/index.js";
import * as TWITCH_FUNCTIONS from "./api/twitch/helix.js";
import {
  attachClientEventLogs,
  createTmiClient,
} from "./api/twitch/irc.js";
import { buildLinkCommandText, setFossabotCommand } from "./api/fossabot/index.js";
import { setNightbotCommand } from "./api/nightbot/index.js";
import * as FILTERS from "./functions/filters.js";
import * as RESPONSES from "./functions/responses.js";
import {
  hasTemporaryFilterPermit,
} from "./functions/filterPermit.js";
import * as PLAYTIME from "./functions/playtime.js";
import * as SPOTIFY from "./api/spotify/index.js";
import { getChatPerms } from "./functions/permissions.js";
import { registerSpotifyCommands, isSpotifyModuleEnabled } from "./modules/spotifyCommands.js";
import { isGamepingModuleEnabled, registerGamepingModule } from "./modules/gameping.js";
import { isPubsubModuleEnabled, startTwitchPubsub } from "./modules/twitchPubsub.js";
import { isAlertsModuleEnabled, registerAlertsModule } from "./modules/alerts.js";
import { tryHandlePermitCommand } from "./modules/permit.js";
import { handleFilterToggles } from "./modules/filterToggles.js";
import { handleLinkModeMessage, tryHandleLinkCommand } from "./modules/linkMode.js";
import {
  getContextKillswitchState,
  handleKillswitchToggle,
  handleKeywordsToggle,
  handleTimersToggle,
} from "./modules/toggles.js";
import { isAubreyTabModuleEnabled, registerAubreyTabModule } from "./modules/aubreytab.js";
import { handleFirstMessageWelcome } from "./modules/welcome.js";
import { tryHandleQuotesModCommand, tryHandleQuotesUserCommand } from "./modules/quotes.js";
import { tryHandleGlobalCommands } from "./modules/globalCommands.js";
import { startTimers } from "./functions/timers.js";
import { createCommandCounter } from "./functions/commandCounts.js";
import { createNamedCountStore } from "./functions/namedCounts.js";
import { getBuildInfo } from "./functions/buildInfo.js";
import { startWebServer } from "./web/server.js";
import { isCustomCommandsModuleEnabled, registerCustomCommandsModule } from "./modules/customCommands.js";
import {
  addTrackedRobloxFriend,
  getRobloxFriendCooldownMs,
  getRobloxFriendCooldownRemainingMs,
  getRobloxGamesPlayedCooldownRemainingMs,
  handleRobloxModCommands,
  isRobloxModuleEnabled,
  registerRobloxModule,
} from "./modules/roblox.js";
import {
  getTokenStorePath,
  readTokenStore,
  getRoleAccessToken,
  TWITCH_ROLES,
} from "./api/twitch/auth.js";
import {
  getPublicRobloxTokenSnapshot,
} from "./api/roblox/auth.js";

const ROBLOX_UNLINKED_CHAT_MESSAGE = "Streamer hasn't linked Roblox yet.";
function resolveTrackedRobloxUserId() {
  const snapshot = getPublicRobloxTokenSnapshot();
  const fromTokenStore = Number(snapshot?.bot?.userId || 0);
  if (Number.isInteger(fromTokenStore) && fromTokenStore > 0) {
    return { userId: fromTokenStore, source: "roblox_oauth" };
  }

  return { userId: null, source: "unlinked" };
}

let trackedRobloxUserId = null;
function refreshTrackedRobloxUserId(logChange = false) {
  const resolved = resolveTrackedRobloxUserId();
  const previous = trackedRobloxUserId;
  trackedRobloxUserId = resolved.userId;

  if (logChange && previous !== trackedRobloxUserId) {
    if (trackedRobloxUserId) {
      console.log(
        `[ROBLOX] Presence target user set to ${trackedRobloxUserId} (${resolved.source})`
      );
    } else {
      console.log(
        "[ROBLOX] Presence target user cleared (streamer has not linked Roblox OAuth)."
      );
    }
  }

  return trackedRobloxUserId;
}
function getTrackedRobloxUserId() {
  const userId = Number(refreshTrackedRobloxUserId(false) || 0);
  return Number.isInteger(userId) && userId > 0 ? userId : null;
}

const IS_BOT = /^(1|true|yes|on)$/i.test(String(process.env.IS_BOT ?? "").trim());
const bot = IS_BOT ? "[??] " : "";

refreshTrackedRobloxUserId(true);
setInterval(() => {
  refreshTrackedRobloxUserId(false);
}, 15_000);

function normalizeAuthToken(value) {
  return String(value || "")
    .trim()
    .replace(/^oauth:/i, "")
    .replace(/^bearer\s+/i, "");
}

const TWITCH_TOKEN_STORE = readTokenStore(getTokenStorePath());
const TWITCH_BOT_STORE = TWITCH_TOKEN_STORE?.bot || {};
const TWITCH_STREAMER_STORE = TWITCH_TOKEN_STORE?.streamer || {};

const BOT_TOKEN =
  process.env.BOT_TOKEN ||
  process.env.BOT_OAUTH ||
  normalizeAuthToken(TWITCH_BOT_STORE.access_token); // keep IRC auth stable, fallback to token store if env is missing
const BOT_OAUTH = BOT_TOKEN; // legacy alias kept to avoid rewriting the whole codebase
const BOT_NAME = process.env.BOT_NAME || String(TWITCH_BOT_STORE.login || "").trim(); // bot username
const BOT_ID = process.env.BOT_ID || String(TWITCH_BOT_STORE.user_id || "").trim(); // bot user-id

const CHANNEL_NAME =
  process.env.CHANNEL_NAME ||
  String(TWITCH_STREAMER_STORE.login || "").trim(); // name of the channel for the bot to be in
const CHANNEL_NAME_DISPLAY = process.env.CHANNEL_NAME_DISPLAY;
const STREAMER_DISPLAY_NAME =
  String(CHANNEL_NAME_DISPLAY || CHANNEL_NAME || "").trim() || "Streamer";
const CHANNEL_ID =
  process.env.CHANNEL_ID ||
  String(TWITCH_STREAMER_STORE.user_id || "").trim(); // id of channel for the bot to be in
const WEB_PUBLIC_URL = String(process.env.WEB_PUBLIC_URL || "").trim();
const REDDIT_RECAP_URL = String(process.env.REDDIT_RECAP_URL || "").trim();
const DISCORD_TIMEZONE_DEFAULT = "EST";
const DISCORD_TIMEZONE_ALIASES = Object.freeze({
  EST: "America/New_York",
  EDT: "America/New_York",
  ET: "America/New_York",
  "US EST": "America/New_York",
  EASTERN: "America/New_York",
  "US EASTERN": "America/New_York",
  CST: "America/Chicago",
  CDT: "America/Chicago",
  CT: "America/Chicago",
  CENTRAL: "America/Chicago",
  "US CENTRAL": "America/Chicago",
  MST: "America/Denver",
  MDT: "America/Denver",
  MT: "America/Denver",
  MOUNTAIN: "America/Denver",
  "US MOUNTAIN": "America/Denver",
  PST: "America/Los_Angeles",
  PDT: "America/Los_Angeles",
  PT: "America/Los_Angeles",
  PACIFIC: "America/Los_Angeles",
  "US PACIFIC": "America/Los_Angeles",
});

function normalizeDiscordTimeZoneKey(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ");
}

function resolveIanaTimeZone(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: raw })
      .resolvedOptions()
      .timeZone;
  } catch {
    return "";
  }
}

function resolveDiscordTimeZone(value) {
  const raw = String(value || "").trim();
  const key = normalizeDiscordTimeZoneKey(raw);
  if (key && DISCORD_TIMEZONE_ALIASES[key]) {
    return { iana: DISCORD_TIMEZONE_ALIASES[key], label: key };
  }

  const iana = resolveIanaTimeZone(raw);
  if (iana) return { iana, label: raw };

  return {
    iana: DISCORD_TIMEZONE_ALIASES[DISCORD_TIMEZONE_DEFAULT],
    label: DISCORD_TIMEZONE_DEFAULT,
  };
}

function formatDiscordCurrentTime(tz = DISCORD_TIMEZONE) {
  const timeZone = String(tz?.iana || "").trim() || DISCORD_TIMEZONE_ALIASES[DISCORD_TIMEZONE_DEFAULT];
  const label = String(tz?.label || "").trim() || DISCORD_TIMEZONE_DEFAULT;
  try {
    const current = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(new Date());
    return `${current} ${label}`;
  } catch {
    const fallback = new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(new Date());
    return `${fallback} ${DISCORD_TIMEZONE_DEFAULT}`;
  }
}

function getHourInTimezone(tz = DISCORD_TIMEZONE) {
  const timeZone =
    String(tz?.iana || "").trim() ||
    DISCORD_TIMEZONE_ALIASES[DISCORD_TIMEZONE_DEFAULT];

  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "numeric",
      hour12: false,
    }).formatToParts(new Date());

    const hourPart = parts.find(p => p.type === "hour");
    return Number(hourPart?.value ?? 0);
  } catch {
    return new Date().getHours(); // fallback
  }
}

function getTimeEmote(tz) {
  const hour = getHourInTimezone(tz);

  if (hour >= 5 && hour < 12) {
    return "<:tibb12Caveman:1011823057939210270>"
  }

  if (hour >= 12 && hour < 17) {
    return "<:tibb12Fax:1011823130559402045><:JuiceTime:1012867071241097276>"
  }

  if (hour >= 17 && hour < 21) {
    return "<:MLADY:1012866938403291156>"
  }

  return "<:Wankge:938438777066647622>"
}

const DISCORD_TIMEZONE = resolveDiscordTimeZone(
  process.env.DISCORD_TIMEZONE || DISCORD_TIMEZONE_DEFAULT
);

const STREAMER_TOKEN =
  normalizeAuthToken(TWITCH_STREAMER_STORE.access_token) ||
  process.env.STRAMER_TOKEN ||
  process.env.STREAMER_TOKEN;
const TWITCH_CHAT_ALLOW_IRC_FALLBACK = flagFromEnv(
  process.env.TWITCH_CHAT_ALLOW_IRC_FALLBACK ?? "false"
);

const WAIT_REGISTER = 5 * 60 * 1000; // number of milliseconds, to wait before starting to get stream information
const PLAYTIME_TICK_MS = 60 * 1000; // how often to persist playtime and check game changes

const COOLDOWN = process.env.COOLDOWN; // number of milliseconds, cool down for replying to people
const GAMES_PLAYED_COUNT_MAX = Math.min(
  10,
  Math.max(1, Number(process.env.GAMES_PLAYED_COUNT_MAX) || 5)
);
const GAMES_PLAYED_CHAT_COOLDOWN_MS = Math.max(
  0,
  Number(process.env.GAMES_PLAYED_CHAT_COOLDOWN_MS) || 15_000
);


const CLIENT_ID = String(
  process.env.CLIENT_ID ||
    process.env.TWITCH_CHAT_CLIENT_ID ||
    process.env.CHEEEZZ_BOT_CLIENT_ID ||
    process.env.MAINS_BOT_CLIENT_ID ||
    ""
).trim();

const COMMAND_GLOBAL_COOLDOWN_MS = 10_000;
const COMMAND_USER_COOLDOWN_MS = 30_000;
let commandGlobalCooldownUntil = 0;
const commandCooldownByUser = new Map();
const missingKeywordResponseWarned = new Set();

const INSTANCE_NAME =
  String(process.env.INSTANCE_NAME || "default").trim() || "default";
const BOT_STARTUP_MESSAGE = String(process.env.BOT_STARTUP_MESSAGE || "").trim();
const BOT_SHUTDOWN_MESSAGE = String(process.env.BOT_SHUTDOWN_MESSAGE || "").trim();

const COMMAND_COUNTER = createCommandCounter({ instance: INSTANCE_NAME });
const NAMED_COUNTERS = createNamedCountStore({ instance: INSTANCE_NAME });

const PLAYTIME_PATH = String(
  process.env.PLAYTIME_PATH || "./playtime.json"
).trim();
const SETTINGS_PATH = String(process.env.SETTINGS_PATH || "./SETTINGS.json").trim();
const STREAMS_PATH = String(process.env.STREAMS_PATH || "./STREAMS.json").trim();
const DEFAULT_GLOBAL_WORDS_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "data",
  "WORDS.json"
);
const LEGACY_ARCHIVE_WORDS_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "archive",
  "WORDS.json"
);
const WORDS_PATH = path.resolve(
  String(
    process.env.WORDS_PATH ||
      process.env.GLOBAL_WORDS_PATH ||
      (fs.existsSync(DEFAULT_GLOBAL_WORDS_PATH)
        ? DEFAULT_GLOBAL_WORDS_PATH
        : LEGACY_ARCHIVE_WORDS_PATH)
  ).trim()
);
const DEFAULT_VALID_MODES = ["!join.on", "!link.on", "!1v1.on", "!ticket.on", "!val.on", "!reddit.on"];
const DEFAULT_SPECIAL_MODES = [
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
const DEFAULT_CUSTOM_MODES = ["!xqcchat.on", "!xqcchat.off"];
const DEFAULT_IGNORE_MODES = [
  "!spamfilter.on",
  "!spamfilter.off",
  "!lengthfilter.on",
  "!lengthfilter.off",
  "!linkfilter.on",
  "!linkfilter.off",
  "!sleep.on",
];

const ver = '2.4'
const BUILD_INFO = getBuildInfo({ appVersion: ver });

function formatLifecycleMessage(template = "", { signal = "" } = {}) {
  const src = String(template || "").trim();
  if (!src) return "";
  return src
    .replaceAll("{channel}", String(CHANNEL_NAME || "").trim())
    .replaceAll("{channel_display}", String(STREAMER_DISPLAY_NAME || CHANNEL_NAME || "").trim())
    .replaceAll("{instance}", String(INSTANCE_NAME || "").trim())
    .replaceAll("{signal}", String(signal || "").trim() || "shutdown");
}

async function sendLifecycleChatMessage(template = "", ctx = {}) {
  const text = formatLifecycleMessage(template, ctx);
  if (!text) return;
  try {
    await client.say(CHANNEL_NAME, text);
  } catch (e) {
    console.warn("[lifecycle] chat message failed:", String(e?.message || e));
  }
}

function flagFromEnv(value) {
  return /^(1|true|yes|on)$/i.test(String(value || "").trim());
}

function isPrivilegedChatUser(userstate = {}) {
  return getChatPerms(userstate, { channelLogin: CHANNEL_NAME }).isPermitted;
}

function isSharedCommandCooldownActive(userstate = {}) {
  if (isPrivilegedChatUser(userstate)) return false;

  const now = Date.now();
  if (now < commandGlobalCooldownUntil) return true;

  const userKey = String(userstate?.username || "").toLowerCase();
  if (userKey) {
    const userCooldownUntil = Number(commandCooldownByUser.get(userKey) || 0);
    if (now < userCooldownUntil) return true;
  }

  commandGlobalCooldownUntil = now + COMMAND_GLOBAL_COOLDOWN_MS;
  if (userKey) {
    commandCooldownByUser.set(userKey, now + COMMAND_USER_COOLDOWN_MS);
  }

  return false;
}

function normalizeKeywordText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[`'’]+/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function messageContainsKeywordPhrase(message, phrase, normalizedMessage = "") {
  const rawMessage = String(message || "").toLowerCase();
  const rawPhrase = String(phrase || "").toLowerCase().trim();
  if (!rawPhrase) return false;
  if (rawMessage.includes(rawPhrase)) return true;

  const normalizedPhrase = normalizeKeywordText(rawPhrase);
  if (!normalizedPhrase) return false;
  const normalized = normalizedMessage || normalizeKeywordText(rawMessage);
  return normalized.includes(normalizedPhrase);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");

const LOG_PATH = path.join(ROOT_DIR, "chat.log");
const CHAT_LOG_ROTATE_TIMEZONE = "America/New_York";
const CHAT_LOG_ROTATE_LOOKAHEAD_MS = 36 * 60 * 60 * 1000;
const COMMAND_LOG_WINDOW_MS = 15000;
const lastCommandByChannel = new Map();
let chatLogRotateTimer = null;

function sanitizeLogText(value) {
  return String(value ?? "").replace(/[\r\n]+/g, " ").trim();
}

function normalizeCommandChannelKey(channel) {
  return String(channel || "")
    .trim()
    .replace(/^#/, "")
    .toLowerCase();
}

function recordCommandUsage(channel, userstate, commandText) {
  const key = normalizeCommandChannelKey(channel);
  const rawText = sanitizeLogText(commandText);
  if (!key || !rawText.startsWith("!")) return;

  const command = rawText.split(/\s+/)[0].toLowerCase();
  const user =
    String(userstate?.["display-name"] || userstate?.["username"] || "unknown")
      .trim() || "unknown";

  lastCommandByChannel.set(key, {
    user,
    command,
    at: Date.now(),
  });

  try {
    COMMAND_COUNTER?.record?.(command);
  } catch {}

  console.log(`[TWITCH][CMD] ${user} used ${command} in #${key}`);
}

function logRecentCommandResponse(channel, responseText, transport = "irc") {
  const key = normalizeCommandChannelKey(channel);
  if (!key) return;

  const ctx = lastCommandByChannel.get(key);
  if (!ctx) return;

  const ageMs = Date.now() - Number(ctx.at || 0);
  lastCommandByChannel.delete(key);
  if (!Number.isFinite(ageMs) || ageMs > COMMAND_LOG_WINDOW_MS) return;

  const clean = sanitizeLogText(responseText);
  if (!clean) return;

  console.log(
    `[TWITCH][${String(transport || "irc").toUpperCase()}] ${ctx.user} used ${ctx.command} RESPONSE: ${clean}`
  );
}

function appendLog(type, message) {
  const ts = new Date().toISOString();
  const line = `[${ts}] [${type}] ${sanitizeLogText(message)}`;
  fs.appendFile(LOG_PATH, line + "\n", () => {});
}

function getDateKeyInTimeZone(ms, timeZone = CHAT_LOG_ROTATE_TIMEZONE) {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date(ms));

    const year = parts.find((p) => p.type === "year")?.value;
    const month = parts.find((p) => p.type === "month")?.value;
    const day = parts.find((p) => p.type === "day")?.value;

    if (year && month && day) return `${year}-${month}-${day}`;
  } catch (e) {
    console.warn("[LOG] timezone date key failed:", String(e?.message || e));
  }

  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getMsUntilNextMidnightInTimeZone(timeZone = CHAT_LOG_ROTATE_TIMEZONE) {
  const now = Date.now();
  const currentKey = getDateKeyInTimeZone(now, timeZone);

  let low = 1000;
  let high = CHAT_LOG_ROTATE_LOOKAHEAD_MS;

  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    const keyAtMid = getDateKeyInTimeZone(now + mid, timeZone);
    if (keyAtMid === currentKey) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }

  return low;
}

function rotateChatLog() {
  try {
    if (fs.existsSync(LOG_PATH)) {
      fs.unlinkSync(LOG_PATH);
    }
    fs.writeFileSync(LOG_PATH, "", "utf8");
    appendLog("LOG", `Rotated chat.log at ${CHAT_LOG_ROTATE_TIMEZONE} midnight`);
    console.log(`[LOG] Rotated chat.log at ${new Date().toISOString()}`);
  } catch (e) {
    console.error("[LOG] Failed to rotate chat.log:", String(e?.message || e));
  }
}

function scheduleChatLogRotation() {
  if (chatLogRotateTimer) {
    clearTimeout(chatLogRotateTimer);
  }

  const delayMs = getMsUntilNextMidnightInTimeZone(CHAT_LOG_ROTATE_TIMEZONE);
  const runAt = new Date(Date.now() + delayMs).toISOString();
  console.log(
    `[LOG] Next chat.log rotation at ${runAt} (${CHAT_LOG_ROTATE_TIMEZONE} midnight)`
  );

  chatLogRotateTimer = setTimeout(() => {
    rotateChatLog();
    scheduleChatLogRotation();
  }, delayMs);

  if (typeof chatLogRotateTimer?.unref === "function") {
    chatLogRotateTimer.unref();
  }
}

if (!fs.existsSync(LOG_PATH)) {
  fs.writeFileSync(LOG_PATH, "", "utf8");
}
scheduleChatLogRotation();

function withSettingsDefaults(input = {}) {
  const base =
    input && typeof input === "object" && !Array.isArray(input) ? { ...input } : {};

  const arr = (value) =>
    Array.isArray(value) ? value.map((v) => String(v || "").trim()).filter(Boolean) : [];

  base.validModes = arr(base.validModes);
  if (!base.validModes.length) base.validModes = [...DEFAULT_VALID_MODES];

  base.specialModes = arr(base.specialModes);
  if (!base.specialModes.length) base.specialModes = [...DEFAULT_SPECIAL_MODES];

  base.customModes = arr(base.customModes);
  if (!base.customModes.length) base.customModes = [...DEFAULT_CUSTOM_MODES];

  base.ignoreModes = arr(base.ignoreModes);
  if (!base.ignoreModes.length) base.ignoreModes = [...DEFAULT_IGNORE_MODES];

  return base;
}

function readSettingsFromDisk() {
  try {
    const parsed = JSON.parse(fs.readFileSync(SETTINGS_PATH, "utf8"));
    return withSettingsDefaults(parsed);
  } catch {
    return withSettingsDefaults({});
  }
}

function readWordsFromDisk() {
  try {
    const parsed = JSON.parse(fs.readFileSync(WORDS_PATH, "utf8"));
    const words =
      parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    if (Object.keys(words).length > 0) return words;
  } catch {}

  try {
    if (fs.existsSync(DEFAULT_GLOBAL_WORDS_PATH)) {
      const fallbackParsed = JSON.parse(fs.readFileSync(DEFAULT_GLOBAL_WORDS_PATH, "utf8"));
      if (fallbackParsed && typeof fallbackParsed === "object" && !Array.isArray(fallbackParsed)) {
        return fallbackParsed;
      }
    }
  } catch {}

  try {
    if (fs.existsSync(LEGACY_ARCHIVE_WORDS_PATH)) {
      const fallbackParsed = JSON.parse(fs.readFileSync(LEGACY_ARCHIVE_WORDS_PATH, "utf8"));
      if (fallbackParsed && typeof fallbackParsed === "object" && !Array.isArray(fallbackParsed)) {
        return fallbackParsed;
      }
    }
  } catch {
    return {};
  }
  return {};
}

let SETTINGS = readSettingsFromDisk();
let STREAMS = JSON.parse(fs.readFileSync(STREAMS_PATH));
let WORDS = readWordsFromDisk();
console.log(`[KEYWORDS] loaded ${Object.keys(WORDS || {}).length} categories from ${WORDS_PATH}`);
try {
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(SETTINGS, null, 2), "utf8");
} catch {}

function loadSettings() {
  return withSettingsDefaults(SETTINGS);
}

function saveSettings(next) {
  if (!next || typeof next !== "object") return;
  SETTINGS = withSettingsDefaults(next);
  try {
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(SETTINGS, null, 2), "utf8");
  } catch {}
}

let lastSettingsSnapshot = null;
let EXTERNAL_STATUS = {
  twitchLive: null,
  twitchUptime: null,
  roblox: { game: null, placeId: null, presenceType: null },
  spotify: { playing: false, isPlaying: false, name: null, artists: null },
  updatedAt: null,
  errors: {},
};

function readSettingsSnapshot() {
  try {
    const s = readSettingsFromDisk();
    return {
      ks: !!s.ks,
      timers: !!s.timers,
      keywords: !!s.keywords,
      currentMode: s.currentMode ?? null,
      currentGame: s.currentGame ?? null,
    };
  } catch {
    return null;
  }
}

function logSettingsChanges(prev, next) {
  if (!prev || !next) return;
  const keys = ["ks", "timers", "keywords", "currentMode", "currentGame"];
  for (const key of keys) {
    if (prev[key] !== next[key]) {
      appendLog(
        "SETTINGS",
        `${key}: ${String(prev[key])} -> ${String(next[key])}`
      );
    }
  }
}

function startSettingsWatch() {
  lastSettingsSnapshot = readSettingsSnapshot();
  fs.watchFile(SETTINGS_PATH, { interval: 2000 }, () => {
    const next = readSettingsSnapshot();
    if (!next) return;
    if (!lastSettingsSnapshot) {
      lastSettingsSnapshot = next;
      return;
    }
    logSettingsChanges(lastSettingsSnapshot, next);
    lastSettingsSnapshot = next;
  });
}

startSettingsWatch();

async function refreshExternalStatus() {
  const next = {
    twitchLive: null,
    twitchUptime: null,
    roblox: { game: null, placeId: null, presenceType: null },
    spotify: { playing: false, isPlaying: false, name: null, artists: null },
    updatedAt: null,
    errors: {},
  };

  try {
    const twitchChannel = String(CHANNEL_NAME || "")
      .replace(/^#/, "")
      .trim();
    if (!twitchChannel) throw new Error("CHANNEL_NAME is not set.");
    const uptimeUrl = `https://decapi.me/twitch/uptime/${encodeURIComponent(twitchChannel)}`;
    const r = await fetch(uptimeUrl);
    const text = (await r.text()).trim();
    if (!r.ok) throw new Error(`DecAPI ${r.status}: ${text}`);

    if (/is offline/i.test(text) || /offline/i.test(text)) {
      next.twitchLive = false;
      next.twitchUptime = null;
    } else {
      next.twitchLive = true;
      const m = text.match(/has been live for\s+(.+)/i);
      let uptime = m ? m[1] : text;
      uptime = String(uptime).replace(/[.!?]\s*$/, "").trim();
      next.twitchUptime = uptime || null;
    }
  } catch (e) {
    next.errors.twitch = String(e?.message || e);
  }

  try {
    const linkedRobloxUserId = getTrackedRobloxUserId();
    if (linkedRobloxUserId) {
      const p = await ROBLOX_FUNCTIONS.getPresence(linkedRobloxUserId);
      const resolvedGame = await ROBLOX_FUNCTIONS.resolvePresenceLocation(p);
      next.roblox = {
        game: resolvedGame ?? null,
        placeId: p?.placeId ?? null,
        presenceType: p?.userPresenceType ?? null,
      };
    }
  } catch (e) {
    next.errors.roblox = String(e?.message || e);
  }

  if (isSpotifyModuleEnabled()) {
    try {
      const sp = await SPOTIFY.getNowPlaying();
      if (sp?.playing) {
        next.spotify = {
          playing: true,
          isPlaying: !!sp.isPlaying,
          name: sp.name ?? null,
          artists: sp.artists ?? null,
        };
      }
    } catch (e) {
      next.errors.spotify = String(e?.message || e);
    }
  }

  next.updatedAt = Date.now();
  EXTERNAL_STATUS = next;
}

refreshExternalStatus();
setInterval(refreshExternalStatus, 30000);

var commandsList = ["!join", "!link", "!ticket", "!1v1"];

const initialTrackedRobloxUserId = getTrackedRobloxUserId();
// IMPORTANT: don't block startup on Roblox presence lookups (this prevents the web server from starting).
let current = { placeId: null, lastLocation: null };
let gameArray = {
  oldGame: null,
  newGame: null,
  oldGameName: null,
  newGameName: null,
};

if (initialTrackedRobloxUserId) {
  ROBLOX_FUNCTIONS.monitorGetPresence(initialTrackedRobloxUserId)
    .then((r) => {
      if (r && typeof r === "object") current = r;
      gameArray.oldGame = current.placeId ?? null;
      gameArray.newGame = current.placeId ?? null;
      gameArray.oldGameName = current.lastLocation ?? null;
      gameArray.newGameName = current.lastLocation ?? null;
    })
    .catch(() => {});
}

const POLL_MS = 4000;

const STABLE_MS = 8000;
const REJOIN_WINDOW_MS = 20000;
const EVENT_COOLDOWN_MS = 15000;

let hasRobloxPresenceSnapshot = false;

let stable = {
  type: 0,
  placeId: null,
  name: null,
  ts: 0,
};

let candidate = {
  type: 0,
  placeId: null,
  name: null,
  firstSeenTs: 0,
};

let lastLeft = {
  placeId: null,
  name: null,
  ts: 0,
};

const lastEventSentAt = {
  presence_left: 0,
  presence_joined: 0,
};


var streamNumber = Object.keys(STREAMS).length;

// ---------- TWITCH / IRC (tmi.js) ----------
const client = createTmiClient({
  username: BOT_NAME,
  oauthToken: BOT_OAUTH,
  channelName: CHANNEL_NAME,
  debug: false,
});

// Optional: allow commands typed in Discord to be relayed to the bot.
// Default mode is "simulate" (runs handlers without sending to Twitch chat).
// Relay mode is always simulated (no secondary chat account).
let DISCORD_RELAY_OUT = {
  discordChannelId: "",
  discordMessage: null,
  expiresAt: 0,
  remaining: 0,
};
const DISCORD_RELAY_OUT_TTL_MS = 10_000;
const DISCORD_RELAY_OUT_MAX_MESSAGES = 6;

function normalizeChan(value) {
  return String(value || "").trim().replace(/^#/, "").toLowerCase();
}

function parseRawPrivmsgLine(rawLine) {
  const line = String(rawLine || "");
  const m = /\bPRIVMSG\s+#?([^\s]+)\s+:(.*)$/.exec(line);
  if (!m) return { channel: "", text: "" };
  return { channel: normalizeChan(m[1]), text: String(m[2] || "").trim() };
}

function setDiscordRelayOutput(discordMessage) {
  const id = String(discordMessage?.channel?.id || "").trim();
  if (!id) return;
  DISCORD_RELAY_OUT = {
    discordChannelId: id,
    discordMessage,
    expiresAt: Date.now() + DISCORD_RELAY_OUT_TTL_MS,
    remaining: DISCORD_RELAY_OUT_MAX_MESSAGES,
  };
}

function normalizeDiscordCommandTarget(rawValue) {
  const raw = String(rawValue || "").trim();
  if (!raw) return "";

  const mentionMatch = /^<@!?(\d+)>$/.exec(raw);
  if (mentionMatch) return mentionMatch[1];

  return raw.replace(/^@+/, "").replace(/[^\w.-]+$/g, "").trim();
}

function pickRandom(list) {
  const items = Array.isArray(list) ? list.filter(Boolean) : [];
  if (!items.length) return "";
  return String(items[Math.floor(Math.random() * items.length)]);
}

function formatDurationShort(ms) {
  const totalSeconds = Math.max(0, Math.floor(Number(ms || 0) / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0 || days > 0) parts.push(`${hours}h`);
  if (minutes > 0 || hours > 0 || days > 0) parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);
  return parts.join(" ");
}

function getLatestStreamEndMs() {
  try {
    const entries =
      STREAMS && typeof STREAMS === "object" && !Array.isArray(STREAMS)
        ? Object.values(STREAMS)
        : [];
    let latest = 0;
    for (const entry of entries) {
      const end = Number(entry?.streamEnd || 0);
      if (Number.isFinite(end) && end > latest) latest = end;
    }
    return latest;
  } catch {
    return 0;
  }
}

function getLinkedStreamerLogin() {
  try {
    const latestStore = readTokenStore(getTokenStorePath());
    const linkedLogin = String(latestStore?.streamer?.login || "")
      .trim()
      .toLowerCase();
    if (linkedLogin) return linkedLogin;
  } catch {}

  return String(CHANNEL_NAME || "").replace(/^#/, "").trim().toLowerCase();
}

async function fetchDecapiText(pathSuffix, login) {
  const target = String(login || "").trim().toLowerCase();
  if (!target) return "";
  try {
    const url = `https://decapi.me/twitch/${pathSuffix}/${encodeURIComponent(target)}`;
    const response = await fetch(url);
    const text = String(await response.text()).trim();
    if (!response.ok) return "";
    return text;
  } catch {
    return "";
  }
}

async function replyToDiscordCommand(discordMessage, text) {
  const out = String(text || "").trim();
  if (!out) return;
  if (discordMessage && typeof discordMessage.reply === "function") {
    await discordMessage.reply({ content: out, allowedMentions: { repliedUser: false } });
    return;
  }
  const discordChannelId = String(discordMessage?.channel?.id || "").trim();
  if (discordChannelId && discordMessenger) {
    await discordMessenger.send(discordChannelId, { content: out, allowedMentions: { parse: [] } });
  }
}

async function tryHandleDiscordOnlyCommand(text, ctx = {}) {
  const messageText = String(text || "").trim();
  if (!messageText.startsWith("!")) return false;

  const discordMessage = ctx?.discordMessage;
  if (!discordMessage) return false;

  const parts = messageText.split(/\s+/).filter(Boolean);
  const command = String(parts[0] || "").toLowerCase();
  const senderLogin =
    String(discordMessage?.author?.username || "")
      .trim()
      .toLowerCase() || "discord_user";
  const arg1 = normalizeDiscordCommandTarget(parts[1] || "");
  const channelDisplay = String(STREAMER_DISPLAY_NAME || CHANNEL_NAME_DISPLAY || CHANNEL_NAME || "Streamer").trim();

  if (command === "!fight") {
    if (!arg1) {
      await replyToDiscordCommand(discordMessage, "Usage: !fight <user>");
      return true;
    }
    const winner = pickRandom([senderLogin, arg1]) || senderLogin;
    const hype = pickRandom([":Pog:", ":PogU:", ":PogChamp:", ":PagMan:"]) || ":Pog:";
    await replyToDiscordCommand(
      discordMessage,
      `${winner} won the fight ${hype} peepoSmash`
    );
    return true;
  }

  if (command === "!never") {
    const target = arg1 || senderLogin;
    await replyToDiscordCommand(
      discordMessage,
      `${target} {Never} A term used by Tibb12 when he does not want something to happen, or when he wants to piss off the fans. ex. "We will NEVER play crim again, but only for a big donation."`
    );
    return true;
  }

  if (command === "!soon") {
    const target = arg1 || senderLogin;
    await replyToDiscordCommand(
      discordMessage,
      `${target} A term used by Tibb12 when he does not have a clue when something is going to occur or when he wants to piss off the fans. (EX: "We will play Arsenal SOON, but not yet.")`
    );
    return true;
  }

  if (command === "!cum") {
    const target = arg1 || senderLogin;
    await replyToDiscordCommand(
      discordMessage,
      `Ew whats wrong with you ${target} <:MonkaShake:975633261156007936>`
    );
    return true;
  }

  if (command === "!time") {
    const emote = getTimeEmote(DISCORD_TIMEZONE);
    await replyToDiscordCommand(
      discordMessage,
      `${emote} It is currently ${formatDiscordCurrentTime()} for ${channelDisplay}. `
    );
    return true;
  }

  if (command === "!uptime") {
    const linkedStreamerLogin = getLinkedStreamerLogin();
    if (!linkedStreamerLogin) {
      await replyToDiscordCommand(discordMessage, "No linked Twitch streamer account found.");
      return true;
    }

    const uptimeRaw = await fetchDecapiText("uptime", linkedStreamerLogin);
    if (uptimeRaw && !/is offline|offline/i.test(uptimeRaw)) {
      const uptimeMatch = uptimeRaw.match(/has been live for\s+(.+)/i);
      const uptime = String(uptimeMatch ? uptimeMatch[1] : uptimeRaw)
        .replace(/[.!?]\s*$/, "")
        .trim();
      await replyToDiscordCommand(
        discordMessage,
        `${channelDisplay} has been live for ${uptime || uptimeRaw}. :Okayge:`
      );
      return true;
    }

    await replyToDiscordCommand(discordMessage, `${channelDisplay} is currently offline. :Sadge:`);
    return true;
  }

  if (command === "!downtime") {
    const linkedStreamerLogin = getLinkedStreamerLogin();
    if (!linkedStreamerLogin) {
      await replyToDiscordCommand(discordMessage, "No linked Twitch streamer account found.");
      return true;
    }

    const uptimeRaw = await fetchDecapiText("uptime", linkedStreamerLogin);
    if (uptimeRaw && !/is offline|offline/i.test(uptimeRaw)) {
      await replyToDiscordCommand(discordMessage, `${channelDisplay} is currently live. :Okayge:`);
      return true;
    }

    const downtimeRaw = await fetchDecapiText("downtime", linkedStreamerLogin);
    if (downtimeRaw) {
      await replyToDiscordCommand(discordMessage, downtimeRaw);
      return true;
    }

    const lastEnd = getLatestStreamEndMs();
    if (lastEnd > 0) {
      const offlineFor = formatDurationShort(Date.now() - lastEnd);
      await replyToDiscordCommand(
        discordMessage,
        `${channelDisplay} has been offline for ${offlineFor}. :Sadge:`
      );
      return true;
    }

    await replyToDiscordCommand(
      discordMessage,
      `${linkedStreamerLogin} is offline (downtime unavailable). :Sadge:`
    );
    return true;
  }

  return false;
}

async function mirrorToDiscordIfActive(channelLogin, text) {
  try {
    const out = String(text || "").trim();
    if (!out) return false;

    const ctx = DISCORD_RELAY_OUT;
    if (!ctx?.discordChannelId) return false;
    if (Date.now() > Number(ctx.expiresAt || 0)) return false;
    if (Number(ctx.remaining || 0) <= 0) return false;

    const chan = normalizeChan(channelLogin);
    if (chan && chan !== normalizeChan(CHANNEL_NAME)) return false;

    // When a command is typed in Discord, we want all bot output to reply to that Discord message.
    // Never leak simulated output into Twitch chat.
    try {
      const msg = ctx?.discordMessage;
      if (msg && typeof msg.reply === "function") {
        await msg.reply({ content: out, allowedMentions: { repliedUser: false } });
      } else if (discordMessenger) {
        await discordMessenger.send(ctx.discordChannelId, { content: out });
      }
    } catch (e) {
      console.warn("[discord][relay] mirror send failed:", String(e?.message || e));
    }

    ctx.remaining = Number(ctx.remaining || 0) - 1;
    DISCORD_RELAY_OUT = ctx;
    return true;
  } catch (e) {
    console.warn("[discord][relay] mirror failed:", String(e?.message || e));
    // Suppress Twitch output even if Discord mirroring fails.
    return true;
  }
}

try {
  DISCORD?.registerCommandRelay?.({
    relayToTwitch: async (text, ctx) => {
      const mode = String(process.env.DISCORD_RELAY_MODE || "simulate").trim().toLowerCase();
      const debug = /^(1|true|yes|on)$/i.test(String(process.env.DISCORD_RELAY_DEBUG || "0").trim());
      const msg = String(text || "").trim();
      if (!msg) return;

      if (await tryHandleDiscordOnlyCommand(msg, ctx)) {
        return;
      }

      if (mode === "tmi") {
        console.warn("[discord][relay] relay_mode=tmi is no longer supported; using simulate mode.");
      }

      // simulate (default): run handlers without sending a chat message from a second account
      const discordMessage = ctx?.discordMessage;
      const discordChannelId = String(discordMessage?.channel?.id || "").trim();
      const discordAuthor = discordMessage?.author;
      const isPrivileged = Boolean(ctx?.isPrivileged);

      const syntheticUser = String(discordAuthor?.username || "").trim().toLowerCase() || "discord_user";
      const syntheticDisplay = String(discordAuthor?.globalName || discordAuthor?.displayName || discordAuthor?.username || "DiscordUser");
      const syntheticId = String(discordAuthor?.id || "");

      const userstate = {
        username: syntheticUser,
        "display-name": syntheticDisplay,
        "user-id": syntheticId,
        mod: isPrivileged,
        badges: isPrivileged ? { moderator: "1" } : {},
        id: "",
        "client-nonce": "",
        __discordRelay: true,
      };

      // Route bot output to the same Discord channel for a short window.
      if (discordMessage) setDiscordRelayOutput(discordMessage);

      if (debug) console.log("[discord][relay] simulate -> handlers:", msg, { user: syntheticUser, mod: isPrivileged });
      client.emit("message", `#${CHANNEL_NAME}`, userstate, msg, false);
    },
  });
} catch (e) {
  console.warn("[discord][relay] init failed:", String(e?.message || e));
}

TWITCH_FUNCTIONS.installHelixChatTransport({
  client,
  label: "main_client",
  channelName: CHANNEL_NAME,
  onSay: ({ channel, message, via }) => {
    logRecentCommandResponse(channel, message, via || "helix");
  },
  onAction: ({ channel, message, via }) => {
    logRecentCommandResponse(channel, message, via || "helix");
  },
  onRaw: ({ parsed, via }) => {
    if (!parsed?.text) return;
    logRecentCommandResponse(parsed.channel || CHANNEL_NAME, parsed.text, via || "helix");
  },
  onError: ({ source, error }) => {
    console.warn(
      `[TWITCH][HELIX_CHAT] ${source} send failed (${TWITCH_CHAT_ALLOW_IRC_FALLBACK ? "IRC fallback on" : "IRC fallback off"}): ${String(error?.message || error)}`
    );
  },
  allowIrcFallback: TWITCH_CHAT_ALLOW_IRC_FALLBACK,
});

try {
  const diag = TWITCH_FUNCTIONS.getHelixChatDiagnostics?.() || null;
  if (diag) {
    const status = diag.missingConfig?.length ? "NOT READY" : "READY";
    const extra = diag.missingConfig?.length ? ` missing: ${diag.missingConfig.join(", ")}` : "";
    console.log(
      `[TWITCH][HELIX_CHAT] ${status} (app_token=${diag.useAppToken ? "on" : "off"} fallback=${diag.allowIrcFallback ? "on" : "off"}) broadcaster=${diag.broadcasterLogin || "?"} senderId=${diag.senderId || "?"}.${extra}`
    );
  }
} catch {}

// Suppress Twitch chat output for Discord-simulated commands, and mirror it to Discord instead.
try {
  const baseSay = client.say.bind(client);
  client.say = async (channel, message, ...rest) => {
    const chan = normalizeChan(channel || CHANNEL_NAME);
    if (await mirrorToDiscordIfActive(chan, message)) return null;
    return baseSay(channel, message, ...rest);
  };

  const baseAction = client.action?.bind(client);
  if (typeof baseAction === "function") {
    client.action = async (channel, message, ...rest) => {
      const chan = normalizeChan(channel || CHANNEL_NAME);
      if (await mirrorToDiscordIfActive(chan, message)) return null;
      return baseAction(channel, message, ...rest);
    };
  }

  const baseRaw = client.raw?.bind(client);
  if (typeof baseRaw === "function") {
    client.raw = async (rawLine, ...rest) => {
      const parsed = parseRawPrivmsgLine(rawLine);
      if (parsed.text && (await mirrorToDiscordIfActive(parsed.channel || CHANNEL_NAME, parsed.text))) {
        return null;
      }
      return baseRaw(rawLine, ...rest);
    };
  }
} catch (e) {
  console.warn("[discord][relay] output mirror wrap failed:", String(e?.message || e));
}

  // ---------- OPTIONAL MODULES ----------
try {
  if (isSpotifyModuleEnabled()) {
    registerSpotifyCommands({
      client,
      channelName: CHANNEL_NAME,
      botPrefix: bot || "",
      streamerDisplayName: STREAMER_DISPLAY_NAME,
      isSharedCommandCooldownActive,
      getChatPerms,
      logModAction: logDiscordModAction,
    });
    console.log("[modules] spotify=on");
  } else {
    console.log("[modules] spotify=off");
  }
} catch (e) {
  console.warn("[modules] spotify init failed:", String(e?.message || e));
}

try {
  if (isGamepingModuleEnabled()) {
    registerGamepingModule({
      client,
      channelName: CHANNEL_NAME,
      getChatPerms,
      getSettings: () => loadSettings(),
      getRobloxPresenceName: () => String(EXTERNAL_STATUS?.roblox?.game || "").trim(),
      webhookClient,
      discordMessenger,
      discordChannelId: DISCORD_ANNOUNCE_CHANNEL_ID,
      EmbedBuilder,
    });
    console.log("[modules] gameping=on");
  } else {
    console.log("[modules] gameping=off");
  }
} catch (e) {
  console.warn("[modules] gameping init failed:", String(e?.message || e));
}

try {
  if (isRobloxModuleEnabled()) {
    registerRobloxModule({
      client,
      channelName: CHANNEL_NAME,
      channelNameDisplay: CHANNEL_NAME_DISPLAY,
      botPrefix: bot || "",
      streamerDisplayName: STREAMER_DISPLAY_NAME,
      settingsPath: SETTINGS_PATH,
      streamsPath: STREAMS_PATH,
      playtimePath: PLAYTIME_PATH,
      playtimeTickMs: PLAYTIME_TICK_MS,
      gamesPlayedCountMax: GAMES_PLAYED_COUNT_MAX,
      gamesPlayedChatCooldownMs: GAMES_PLAYED_CHAT_COOLDOWN_MS,
      getChatPerms,
      isSharedCommandCooldownActive,
      getTrackedRobloxUserId,
      twitchFunctions: TWITCH_FUNCTIONS,
      logRecentCommandResponse,
    });
    console.log("[modules] roblox=on");
  } else {
    console.log("[modules] roblox=off");
  }
} catch (e) {
  console.warn("[modules] roblox init failed:", String(e?.message || e));
}

try {
  if (isAubreyTabModuleEnabled()) {
    registerAubreyTabModule({
      client,
      channelName: CHANNEL_NAME,
      getChatPerms,
    });
    console.log("[modules] tab=on");
  } else {
    console.log("[modules] tab=off");
  }
} catch (e) {
  console.warn("[modules] tab init failed:", String(e?.message || e));
}

try {
  if (isCustomCommandsModuleEnabled()) {
    registerCustomCommandsModule({
      client,
      channelName: CHANNEL_NAME,
      getChatPerms,
      commandCounter: COMMAND_COUNTER,
      countStore: NAMED_COUNTERS,
      logger: console,
    });
    console.log("[modules] custom_commands=on");
  } else {
    console.log("[modules] custom_commands=off");
  }
} catch (e) {
  console.warn("[modules] custom_commands init failed:", String(e?.message || e));
}

let alertsController = null;
try {
  if (isAlertsModuleEnabled()) {
    alertsController = registerAlertsModule({
      client,
      channelName: CHANNEL_NAME,
      twitchFunctions: TWITCH_FUNCTIONS,
      loadSettings,
      saveSettings,
      getContextKillswitchState,
    });
    console.log("[modules] alerts=on");
  } else {
    console.log("[modules] alerts=off");
  }
} catch (e) {
  console.warn("[modules] alerts init failed:", String(e?.message || e));
}

attachClientEventLogs({
  tmiClient: client,
  label: "BOT",
  appendLog,
  logRecentCommandResponse,
  defaultChannelName: CHANNEL_NAME,
});

client.once("connected", () => {
  if (!BOT_STARTUP_MESSAGE) return;
  void sendLifecycleChatMessage(BOT_STARTUP_MESSAGE, { signal: "startup" });
});

client.connect();

client.on("message", (channel, userstate, message, self) => {
  if (self) return;
  if (userstate?.__discordRelay) return;
  const msg = String(message || "").trim();
  if (!msg.startsWith("!")) return;
  recordCommandUsage(channel, userstate, msg);
});

// Twitch chat -> Discord logging should be independent of the main command handler, so it still
// works even when other handlers return early or error out.
client.on("message", (channel, userstate, message, self) => {
  try {
    if (self) return;
    if (userstate?.__discordRelay) return;
    const msg = String(message || "").trim();
    if (!msg) return;
    const configuredChannel = String(CHANNEL_NAME || "")
      .replace(/^#/, "")
      .trim()
      .toLowerCase();
    const incomingChannel = String(channel || "")
      .replace(/^#/, "")
      .trim()
      .toLowerCase();
    if (configuredChannel && incomingChannel && configuredChannel !== incomingChannel) {
      return;
    }

    const badges = userstate?.badges && typeof userstate.badges === "object" ? userstate.badges : {};
    const isBroadcaster = badges?.broadcaster === "1" || badges?.broadcaster === 1;
    const isVip = badges?.vip === "1" || badges?.vip === 1;
    const isMod = Boolean(userstate?.mod) || badges?.moderator === "1" || badges?.moderator === 1;
    const isSubscriber = Boolean(userstate?.subscriber);

    void DISCORD?.logTwitchChat?.({
      channelName: String(incomingChannel || configuredChannel || ""),
      message: msg,
      isVip,
      isMod,
      isBroadcaster,
      isSubscriber,
      user: {
        login: String(userstate?.username || "").toLowerCase(),
        displayName: String(userstate?.["display-name"] || userstate?.username || ""),
        id: String(userstate?.["user-id"] || ""),
      },
    });
  } catch {}
});


// --------------------------------------------------------------------------------------------------

// Roblox playtime tracking now runs from bot/modules/roblox.js when enabled.

// timers (join/promo) moved to bot/functions/timers.js
const TIMERS = startTimers({
  client,
  channelName: CHANNEL_NAME,
  twitchFunctions: TWITCH_FUNCTIONS,
  robloxFunctions: ROBLOX_FUNCTIONS,
  getTrackedRobloxUserId,
  settingsPath: SETTINGS_PATH,
  streamsPath: STREAMS_PATH,
});

// (killswitch/keywords/timers toggles moved to bot/modules/toggles.js)

async function logHandler(
  message,
  twitchUsername,
  twitchDisplayName,
  twitchUserId,
  isVip,
  isMod,
  isBroadcaster,
  isFirstMessage,
  isSubscriber,
  messageId
) {
  let isLive = false;
  try {
    isLive = await TWITCH_FUNCTIONS.isLive();
  } catch {}

  let stamp = isLive ? "live" : "offline";
  const streamStart = STREAMS?.[streamNumber]?.streamStart;
  if (isLive && streamStart) {
    const timeDifference = (Date.now() - streamStart) / 1000;
    const hourMark = Math.floor(timeDifference / (60 * 60));
    const minuteMark = Math.floor((timeDifference - hourMark * 60 * 60) / 60);
    const secondMark = Math.floor(
      timeDifference - hourMark * 60 * 60 - minuteMark * 60
    );

    const zeroFilledHour = ("00" + hourMark).slice(-2);
    const zeroFilledMinute = ("00" + minuteMark).slice(-2);
    const zeroFilledSecond = ("00" + secondMark).slice(-2);

    stamp = `${zeroFilledHour}:${zeroFilledMinute}:${zeroFilledSecond}`;
  }

  appendLog(
    "CHAT",
    `${stamp} ${twitchDisplayName} (${twitchUsername}): ${message}`
  );

  if (!isLive) return;

  if (Object.keys(chatByUser).length == 0) {
    chatByUser[twitchUsername] = [];
    chatByUser[twitchUsername][0] = {
      displayName: twitchDisplayName,
      messageTime: new Date().getTime(),
      message: message,
      twitchUserId: twitchUserId,
      isMod: isMod,
      isBroadcaster: isBroadcaster,
      isFirstMessage: isFirstMessage,
      isSubscriber: isSubscriber,
      messageId: messageId,
    };
  } else {
    if (chatByUser[twitchUsername] == null) {
      chatByUser[twitchUsername] = [];
      chatByUser[twitchUsername][0] = {
        displayName: twitchDisplayName,
        messageTime: new Date().getTime(),
        message: message,
        twitchUserId: twitchUserId,
        isMod: isMod,
        isBroadcaster: isBroadcaster,
        isFirstMessage: isFirstMessage,
        isSubscriber: isSubscriber,
        messageId: messageId,
      };
    } else {
      chatByUser[twitchUsername][chatByUser[twitchUsername].length] = {
        displayName: twitchDisplayName,
        messageTime: new Date().getTime(),
        message: message,
        twitchUserId: twitchUserId,
        isMod: isMod,
        isBroadcaster: isBroadcaster,
        isFirstMessage: isFirstMessage,
        isSubscriber,
        messageId: messageId,
      };
    }
  }
}


// Aubrey tab moved to bot/modules/aubreytab.js

async function customModFunctions(client, message, twitchUsername, userstate) {
  var messageArray = ([] = message.toLowerCase().split(" "));

  const reply = (text) =>
    client.raw(
      `@client-nonce=${userstate["client-nonce"]};reply-parent-msg-id=${userstate["id"]} ` +
      `PRIVMSG #${CHANNEL_NAME} :${bot}${text}`
    );

  if (tryHandlePermitCommand({ message, reply })) return;

  if (tryHandleQuotesModCommand({ message, twitchUsername, reply })) return;

  const trimmedMessage = String(message || "").trim();
  const parseIntervalMs = (raw) => {
    const text = String(raw || "").trim().toLowerCase();
    const m = text.match(/^(\d+(?:\.\d+)?)(ms|s|m)?$/i);
    if (!m) return null;
    const n = Number(m[1]);
    if (!Number.isFinite(n) || n <= 0) return null;
    const unit = String(m[2] || "s").toLowerCase();
    if (unit === "ms") return Math.round(n);
    if (unit === "m") return Math.round(n * 60_000);
    return Math.round(n * 1000);
  };

  if (trimmedMessage.toLowerCase() === "!autofoc") {
    const enabled = SETTINGS?.autoFocOffEnabled !== false;
    const delayMsRaw = Number(SETTINGS?.autoFocOffDelayMs);
    const delayMs = Number.isFinite(delayMsRaw) && delayMsRaw >= 0
      ? Math.floor(delayMsRaw)
      : Math.max(0, Number(process.env.WAIT_UNTIL_FOC_OFF) || 0);
    return reply(
      `Auto FOC OFF: ${enabled ? "ON" : "OFF"} | Delay: ${Math.round(
        delayMs / 1000
      )}s (${delayMs}ms)`
    );
  }

  if (trimmedMessage.toLowerCase() === "!autofoc.on") {
    SETTINGS.autoFocOffEnabled = true;
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(SETTINGS, null, 2));
    return reply("Auto FOC OFF is now ON.");
  }

  if (trimmedMessage.toLowerCase() === "!autofoc.off") {
    SETTINGS.autoFocOffEnabled = false;
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(SETTINGS, null, 2));
    return reply("Auto FOC OFF is now OFF.");
  }

  if (trimmedMessage.toLowerCase().startsWith("!autofoc.interval")) {
    const raw = trimmedMessage.slice("!autofoc.interval".length).trim();
    const delayMs = parseIntervalMs(raw);
    if (delayMs == null) {
      return reply("Usage: !autofoc.interval <number>[ms|s|m] (default unit: seconds)");
    }
    SETTINGS.autoFocOffDelayMs = delayMs;
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(SETTINGS, null, 2));
    return reply(`Auto FOC OFF delay set to ${Math.round(delayMs / 1000)}s (${delayMs}ms).`);
  }

  const addKeyMatch = trimmedMessage.match(/^!addkey\s+(.+)$/i);
  if (addKeyMatch) {
    const rawPayload = String(addKeyMatch[1] || "").replace(/[\r\n]+/g, " ").trim();
    if (!rawPayload) {
      return reply("Usage: !addkey [category] phrase");
    }

    let category = "";
    let phrase = "";

    if (rawPayload.startsWith("[")) {
      const closeIdx = rawPayload.indexOf("]");
      if (closeIdx > 1) {
        category = rawPayload.slice(1, closeIdx).trim().toLowerCase();
        phrase = rawPayload.slice(closeIdx + 1).trim();
      }
    }

    if (!category) {
      const splitIdx = rawPayload.search(/\s/);
      if (splitIdx === -1) {
        category = rawPayload.toLowerCase();
        phrase = "";
      } else {
        category = rawPayload.slice(0, splitIdx).trim().toLowerCase();
        phrase = rawPayload.slice(splitIdx + 1).trim();
      }
    }

    if (!category || !phrase) {
      return reply("Usage: !addkey [category] phrase");
    }

    let wordsData = {};
    try {
      const rawWords = JSON.parse(fs.readFileSync(WORDS_PATH, "utf8"));
      if (!rawWords || typeof rawWords !== "object" || Array.isArray(rawWords)) {
        return reply("WORDS.json is not in a valid object format.");
      }
      wordsData = rawWords;
    } catch {
      return reply("Couldn't read WORDS.json right now.");
    }

    if (!Object.prototype.hasOwnProperty.call(wordsData, category)) {
      return reply(`Unknown keyword category: ${category}`);
    }

    if (!Array.isArray(wordsData[category])) {
      return reply(`Keyword category ${category} is not a list.`);
    }

    const normalizedPhrase = phrase.toLowerCase().trim();
    if (!normalizedPhrase) {
      return reply("Usage: !addkey [category] phrase");
    }

    const exists = wordsData[category].some(
      (entry) => String(entry || "").toLowerCase().trim() === normalizedPhrase
    );

    if (exists) {
      return reply(`Phrase already exists in ${category}.`);
    }

    wordsData[category].push(normalizedPhrase);

    fs.writeFileSync(WORDS_PATH, JSON.stringify(wordsData, null, 2));
    WORDS = wordsData;

    return reply(`Added phrase to ${category}: ${normalizedPhrase}`);
  }

  if (messageArray[0] == "!addlink") {
    const raw = message.slice("!addlink".length).trim();
    if (!raw) return reply("Usage: !addlink <domain or full url>");

    const normalized = FILTERS.normalizeAllowlistEntry(raw);
    if (!normalized) {
      return reply("That link/domain doesn't look valid. Try !addlink example.com or !addlink https://example.com/path");
    }

    SETTINGS = JSON.parse(fs.readFileSync("./SETTINGS.json"));
    const allowlist = Array.isArray(SETTINGS.linkAllowlist)
      ? SETTINGS.linkAllowlist
      : [];

    const exists = allowlist.some(
      (entry) =>
        String(entry || "").toLowerCase() === String(normalized).toLowerCase()
    );

    if (exists) return reply(`Already allowed: ${normalized}`);

    allowlist.push(normalized);
    SETTINGS.linkAllowlist = allowlist;

    fs.writeFileSync("./SETTINGS.json", JSON.stringify(SETTINGS, null, 2));
    return reply(`Added allowed link: ${normalized}`);
  }

  if (messageArray[0] == "!remlink") {
    const raw = message.slice("!remlink".length).trim();
    if (!raw) return reply("Usage: !remlink <domain or full url>");

    const normalized = FILTERS.normalizeAllowlistEntry(raw);
    if (!normalized) {
      return reply("That link/domain doesn't look valid. Try !remlink example.com or !remlink https://example.com/path");
    }

    SETTINGS = JSON.parse(fs.readFileSync("./SETTINGS.json"));
    const allowlist = Array.isArray(SETTINGS.linkAllowlist)
      ? SETTINGS.linkAllowlist
      : [];

    const next = allowlist.filter(
      (entry) =>
        String(entry || "").toLowerCase() !== String(normalized).toLowerCase()
    );

    if (next.length === allowlist.length) {
      return reply(`Not found in allowlist: ${normalized}`);
    }

    SETTINGS.linkAllowlist = next;
    fs.writeFileSync("./SETTINGS.json", JSON.stringify(SETTINGS, null, 2));
    return reply(`Removed allowed link: ${normalized}`);
  }

  if (messageArray[0] == "!listlinks") {
    SETTINGS = JSON.parse(fs.readFileSync("./SETTINGS.json"));
    const allowlist = Array.isArray(SETTINGS.linkAllowlist)
      ? SETTINGS.linkAllowlist
      : [];

    if (!allowlist.length) return reply("No allowed links set.");

    return reply(`Allowed links: ${allowlist.join(", ")}`);
  }

  if (
    message.toLowerCase() == "!foc" ||
    message.toLowerCase() == "!foc on" ||
    message.toLowerCase() == "!focon"
  ) {
    await TWITCH_FUNCTIONS.setFollowersOnlyMode(true).catch((e) => {
      console.warn(
        "[helix] failed to enable followers-only:",
        String(e?.message || e)
      );
    });
  } else if (
    message.toLowerCase() == "!foc off" ||
    message.toLowerCase() == "!focoff"
  ) {
    await TWITCH_FUNCTIONS.setFollowersOnlyMode(false).catch((e) => {
      console.warn(
        "[helix] failed to disable followers-only:",
        String(e?.message || e)
      );
    });
  }

  if (
    message.toLowerCase() == "!follower.on" ||
    message.toLowerCase() == "!followers.on"
  ) {
    SETTINGS["followerOnlyMode"] = true;
    fs.writeFileSync("./SETTINGS.json", JSON.stringify(SETTINGS));
    SETTINGS = JSON.parse(fs.readFileSync("./SETTINGS.json"));
  } else if (
    message.toLowerCase() == "!follower.off" ||
    message.toLowerCase() == "!followers.off"
  ) {
    SETTINGS["followerOnlyMode"] = false;
    fs.writeFileSync("./SETTINGS.json", JSON.stringify(SETTINGS));
    SETTINGS = JSON.parse(fs.readFileSync("./SETTINGS.json"));
  }
  // if (messageArray[0] == "!announce") {
  //   if (messageArray.length < 2)
  //     return client.raw(
  //       `@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Please include a message to announce, e.g. !announce test`
  //     );

  //   messageArray.splice(0, 1);

  //   TWITCH_FUNCTIONS.makeAnnouncement(messageArray.join(" "));
  // }

  if (messageArray[0] == "!delpoll") {
    TWITCH_FUNCTIONS.deleteCurrentPoll();
  }
  if (messageArray[0] == "!endpoll") {
    TWITCH_FUNCTIONS.deleteCurrentPoll();
  }
  if (
    await handleRobloxModCommands({
      messageArray,
      trimmedMessage,
      twitchUsername,
      reply,
    })
  ) {
    return;
  }
}



async function customUserFunctions(client, message, twitchUsername, userid, userstate) {
  var messageArray = ([] = message.toLowerCase().split(" "));

  if (
    tryHandleQuotesUserCommand({
      client,
      message,
      twitchUsername,
      channelName: CHANNEL_NAME,
      botPrefix: bot,
      userstate,
      isSharedCommandCooldownActive,
    })
  ) {
    return;
  }

  if (messageArray[0] == "!cptotime") {
    if (isSharedCommandCooldownActive(userstate)) return;

    if (messageArray[1] == undefined) {
      return client.say(
        CHANNEL_NAME,
        `${bot}@${twitchUsername}, please specify an amount of channel points to convert to farming time. If you want you can also specify what tier you want to check, for example !cptotime 1000 tier1`
      );
    } else if (isNaN(messageArray[1]) == true) {
      return client.say(
        CHANNEL_NAME,
        `${bot}@${twitchUsername}, number of channel points must be a number.`
      );
    } else {
      const cp = messageArray[1];

      if (
        messageArray[2] == "tier1" ||
        messageArray[2] == "tier2" ||
        messageArray[2] == "tier3" ||
        messageArray[2] == "nosub"
      ) {
        let tierToCheck = messageArray[2];

        const standardRate = 5.33333333;

        const t1Rate = 5.3333333 * 1.2;
        const t2Rate = 5.3333333 * 1.4;
        const t3Rate = 5.3333333 * 2;

        let rate;
        let sub;

        if (tierToCheck == "tier1") {
          rate = t1Rate;
          sub = "you had a Tier 1 sub";
        } else if (tierToCheck == "tier2") {
          rate = t2Rate;
          sub = "you had a Tier 2 sub";
        } else if (tierToCheck == "tier3") {
          rate = t3Rate;
          sub = "you had a Tier 3 sub";
        } else if (tierToCheck == "nosub") {
          rate = standardRate;
          sub = "you had no sub";
        }

        const test = cp / rate / (60 * 24 * 365);

        const cpToHours = ROBLOX_FUNCTIONS.timeToAgo(test);

        client.say(
          CHANNEL_NAME,
          `@${twitchUsername}, IF ${sub}, it would take ${
            cpToHours.timeString
          } to farm ${ROBLOX_FUNCTIONS.formatNumber(cp)} channel points.`
        );
      } else {
        const getSubStatus = await TWITCH_FUNCTIONS.getSubStatus(userid);

        const tier = getSubStatus.data;

        const standardRate = 5.33333333;

        const t1Rate = 5.3333333 * 1.2;
        const t2Rate = 5.3333333 * 1.4;
        const t3Rate = 5.3333333 * 2;

        let rate;
        let sub;

        if (tier.tier != null) {
          if (tier == 1000) {
            rate = t1Rate;
            sub = "you're a tier 1 sub";
          } else if (tier == 2000) {
            rate = t2Rate;
            sub = "you're a tier 2 sub";
          } else if (tier == 3000) {
            rate = t3Rate;
            sub = "you're a tier 3 sub";
          }
        } else {
          rate = standardRate;
          sub = "you dont have a sub";
        }

        const test = cp / rate / (60 * 24 * 365);

        const cpToHours = ROBLOX_FUNCTIONS.timeToAgo(test);

        client.say(
          CHANNEL_NAME,
          `@${twitchUsername}, since ${sub}, it would take ${
            cpToHours.timeString
          } to farm ${ROBLOX_FUNCTIONS.formatNumber(cp)} channel points.`
        );

        return;
      }
    }
  } else if (messageArray[0] === "!whogiftedme") {
      if (isSharedCommandCooldownActive(userstate)) return;

      const getSubStatus = await TWITCH_FUNCTIONS.getSubStatus(userid);
      const data = getSubStatus?.data || [];

      if (data.length) {
        const isGift = !!data[0]?.is_gift;
        if (!isGift) {
          return client.say(
            CHANNEL_NAME,
            `@${twitchUsername}, you were not gifted a sub, you subscribed yourself.`
          );
        }
      }

      // IMPORTANT: use the BROADCASTER/CHANNEL id here, not the chatter's userid
      const channelEmotes = await TWITCH_FUNCTIONS.getChannelEmotes(CHANNEL_ID);
      const emoteData = channelEmotes?.data || [];

      // helper: remove by name safely
      const removeByName = (arr, name) => {
        const idx = arr.findIndex(x => x?.name === name);
        if (idx >= 0) arr.splice(idx, 1);
      };

      // helper: pick 1 random emote name and remove it (so no duplicates)
      const pickRandomName = (arr) => {
        if (!arr.length) return null;
        const idx = Math.floor(Math.random() * arr.length);
        const name = arr[idx]?.name || null;
        arr.splice(idx, 1);
        return name;
      };

      // Build tier tables cleanly
      const tiers = {
        "Tier 1": { bonus: 20, emotes: [] },
        "Tier 2": { bonus: 40, emotes: [] },
        "Tier 3": { bonus: 100, emotes: [] },
      };

      for (const emote of emoteData) {
        const emoteTier = String(emote?.tier || "");
        if (emoteTier === "1000") tiers["Tier 1"].emotes.push(emote);
        else if (emoteTier === "2000") tiers["Tier 2"].emotes.push(emote);
        else if (emoteTier === "3000") tiers["Tier 3"].emotes.push(emote);
      }

      if (data.length) {
        const gifter = data[0]?.gifter_name || "Someone";
        const tierRaw = String(data[0]?.tier || "");

        let tier;
        if (tierRaw === "1000") tier = "Tier 1";
        else if (tierRaw === "2000") tier = "Tier 2";
        else if (tierRaw === "3000") tier = "Tier 3";
        else tier = "Tier 1"; // fallback

        // Make a copy so we can safely remove from it
        const pool = emoteData.slice();

        const randomEmote1 = pickRandomName(pool);
        const randomEmote2 = pickRandomName(pool);
        const randomEmote3 = pickRandomName(pool);

        const bonus = tiers[tier]?.bonus ?? 0;
        const emoteCount = (tiers[tier]?.emotes?.length ?? 0);

        return client.say(
          CHANNEL_NAME,
          `${bot}@${twitchUsername}, ${gifter} gifted you a ${tier} sub. ` +
          `As a ${tier} sub you have access to ${emoteCount} channel emotes and earn ${bonus}% more channel points. ` +
          `Here are three channel emotes you have: ${randomEmote1 || ""} ${randomEmote2 || ""} ${randomEmote3 || ""}`.trim()
        );
      }

      return client.say(CHANNEL_NAME, `${bot}@${twitchUsername}, you don't currently have a sub.`);
    }
}

const MODE_TO_TWITCH = {
  "!join.on":   { titleKey: "join",   gameName: "Roblox" },
  "!link.on":   { titleKey: "link",   gameName: "Roblox" },
  "!1v1.on":    { titleKey: "1v1",    gameName: "Roblox" },
  "!ticket.on": { titleKey: "ticket", gameName: "Roblox" },
  "!val.on":    { titleKey: "val",    gameName: "VALORANT" },
  "!reddit.on": { titleKey: "reddit", gameName: "Just Chatting" },
};

async function applyModeToTwitch({ client, mode, userstate }) {
  const cfg = MODE_TO_TWITCH[mode];
  if (!cfg) return false;

  // reload settings so we always use freshest titles
  const s = JSON.parse(fs.readFileSync(SETTINGS_PATH, "utf8"));

  const title = s?.titles?.[cfg.titleKey];
  if (!title) {
    console.warn(`[applyModeToTwitch] No title set for "${cfg.titleKey}" in settings.titles`);
    return false;
  }

  try {
    const auth = await getRoleAccessToken({ role: TWITCH_ROLES.STREAMER });
    if (!auth?.accessToken || !auth?.clientId) {
      throw new Error("Missing streamer OAuth token/client id (link streamer in /auth).");
    }

    const overrideGame =
      s?.modeGames && typeof s.modeGames === "object" ? String(s.modeGames[mode] || "").trim() : "";
    const gameName = overrideGame || cfg.gameName;

    const gameId = await TWITCH_FUNCTIONS.getGameIdByName({
      token: auth.accessToken,
      clientId: auth.clientId,
      name: gameName,
    });

    await TWITCH_FUNCTIONS.updateChannelInfo({
      broadcasterId: CHANNEL_ID,
      token: auth.accessToken,
      clientId: auth.clientId,
      title,
      gameId: gameId || undefined,
    });

    return true;
  } catch (err) {
    console.error("[applyModeToTwitch] failed:", err);
    return false;
  }
}

async function updateMode(client, message, twitchUsername, userstate) {
  const messageArray = message.toLowerCase().trim().split(/\s+/);
  const cmd = messageArray[0];
  const modeLabel = String(cmd).replace(/^!/, "").replace(/\.on$/, "");

  if (!cmd.startsWith("!")) return;
  if (!cmd.endsWith(".on")) return;

  // reload fresh settings
  SETTINGS = JSON.parse(fs.readFileSync(SETTINGS_PATH, "utf8"));

  const isValidMode = SETTINGS.validModes.includes(cmd);
  const isIgnoreMode = SETTINGS.ignoreModes.includes(cmd);
  const isSpecialMode = SETTINGS.specialModes.includes(cmd);
  const isCustomMode = SETTINGS.customModes.includes(cmd);

  if (isIgnoreMode || isSpecialMode || isCustomMode) return;

  if (!isValidMode) {
    return client.raw(
      `@client-nonce=${userstate["client-nonce"]};reply-parent-msg-id=${userstate["id"]} ` +
      `PRIVMSG #${CHANNEL_NAME} :${bot}${cmd} is not a valid mode. ` +
      `Valid Modes: ${SETTINGS.validModes.join(", ")}`
    );
  }

  if (SETTINGS.currentMode === cmd) {
    client.raw(
      `@client-nonce=${userstate["client-nonce"]};reply-parent-msg-id=${userstate["id"]} ` +
      `PRIVMSG #${CHANNEL_NAME} :${bot}${modeLabel} mode is already on.`
    );
    return;
  }

  if (SETTINGS.currentMode === "!link.on") {
    SETTINGS.currentLink = null;
    // Fossabot: delete the temporary !link command when leaving link mode.
    client.say(CHANNEL_NAME, `!cmd delete !link`);
  }

  SETTINGS.currentMode = cmd;

  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(SETTINGS, null, 2));

  client.raw(
    `@client-nonce=${userstate["client-nonce"]};reply-parent-msg-id=${userstate["id"]} ` +
    `PRIVMSG #${CHANNEL_NAME} :${bot}@${CHANNEL_NAME}, ${twitchUsername} has turned ${modeLabel} mode on.`
  );

  await applyModeToTwitch({
    client,
    mode: cmd,
    userstate,
  });

  if (cmd === "!reddit.on") {
    const fallbackUrl = CHANNEL_NAME
      ? `https://reddit.com/r/${String(CHANNEL_NAME).replace(/^#/, "").trim()}`
      : "";
    const recapUrl = REDDIT_RECAP_URL || fallbackUrl;
    const recapMsg = recapUrl ? `REDDIT RECAP TIME: ${recapUrl}` : "REDDIT RECAP TIME:";
    for (let i = 0; i < 3; i++) {
      client.say(CHANNEL_NAME, recapMsg);
    }
  }

  SETTINGS = JSON.parse(fs.readFileSync(SETTINGS_PATH, "utf8"));
}


async function joinHandler(
  message,
  twitchUsername,
  isModOrBroadcaster,
  twitchUserId
) {
  const currentMode = SETTINGS.currentMode;
  let responseLimit = 1;
  let responseCount = 0;
  const contextKillswitchOn = getContextKillswitchState(SETTINGS);
  const normalizedKeywordMessage = normalizeKeywordText(message);

  if (contextKillswitchOn) return;
  if (isModOrBroadcaster) return;
  if (!contextKillswitchOn) {
    for (const wordSet in WORDS) {
      if (responseLimit === 0) {
        break;
      }

      const phraseList = Array.isArray(WORDS[wordSet]) ? WORDS[wordSet] : [];
      if (
        !phraseList.some((word) => {
          return messageContainsKeywordPhrase(message, word, normalizedKeywordMessage);
        })
      ) {
        continue;
      }

      // Only mods/broadcaster are exempt from "join" keyword auto-responses.
      if (wordSet === "join" && isModOrBroadcaster) {
        continue;
      }

      const keywordHandler = RESPONSES?.responses?.[wordSet];
      if (typeof keywordHandler !== "function") {
        if (!missingKeywordResponseWarned.has(wordSet)) {
          missingKeywordResponseWarned.add(wordSet);
          console.warn(`[KEYWORDS] missing response handler for "${wordSet}"`);
        }
        continue;
      }

      try {
        if (wordSet === "corrections") {
          await keywordHandler(
            client,
            twitchUsername,
            message,
            isModOrBroadcaster
          );
        } else if (wordSet === "whogiftedme") {
          await keywordHandler(
            client,
            twitchUsername,
            message,
            isModOrBroadcaster,
            twitchUserId
          );
        } else if (wordSet === "game") {
          await keywordHandler(client, twitchUsername);
        } else {
          await keywordHandler(client, twitchUsername, message);
        }
        responseLimit -= 1;
      } catch (e) {
        console.error(
          `[KEYWORDS] response handler "${wordSet}" failed:`,
          e?.message || e
        );
      }
    }
  }

  if (responseCount > 4) {
    client.say(
      CHANNEL_NAME,
      `@${twitchUsername} stop trying to abuse keywords. [Keywords Detected: ${responseCount}]`
      );
    TWITCH_FUNCTIONS.timeoutUser(
      twitchUsername,
      "[AUTOMATIC] attempt to abuse keywords. - MainsBot",
      30
    );
  }
}

// TO DO: make it so that after !xqcchat.off it goes back to what modes it was orignally

async function customModeHandler(client, message, twitchUsername, userstate) {
  var messageArray = ([] = message.toLowerCase().split(" "));
  var duration = null;

  var customModes = SETTINGS.customModes;

  if (customModes.includes(messageArray[0]) == false) return;

  if (!Number.isNaN(messageArray[1])) {
    duration = messageArray[1];
  }

  if (messageArray[0] == "!xqcchat.on") {
    SETTINGS["spamFilter"] = false;
    SETTINGS["lengthFilter"] = false;

    if (duration != null) {
      client.raw(
        `@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Enabled xqcchat, all filters disabled for ${duration} seconds.`
      );
      fs.writeFileSync("./SETTINGS.json", JSON.stringify(SETTINGS));
      await delay(duration * 1000);
      SETTINGS["spamFilter"] = true;
      SETTINGS["lengthFilter"] = true;
      client.raw(
        `@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :@${CHANNEL_NAME}, xqcchat is now disabled as ${duration} seconds has passed, all filters enabled`
      );
      fs.writeFileSync("./SETTINGS.json", JSON.stringify(SETTINGS));
    } else {
      client.raw(
        `@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :@${CHANNEL_NAME}, xqcchat is now enabled until a mod or broadcaster disables it, all filters disabled`
      );
      fs.writeFileSync("./SETTINGS.json", JSON.stringify(SETTINGS));
    }
  } else if (messageArray[0] == "!xqcchat.off") {
    SETTINGS["spamFilter"] = true;
    SETTINGS["lengthFilter"] = true;
    client.raw(
      `@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Disabled xqcchat, all filters enabled`
    );
    fs.writeFileSync("./SETTINGS.json", JSON.stringify(SETTINGS));
  }
}

async function sendPresenceHelixMessage(message, source = "presence_monitor") {
  const text = String(message || "").trim();
  if (!text) return;

  try {
    await TWITCH_FUNCTIONS.sendHelixChatMessage({
      channel: CHANNEL_NAME,
      message: text,
      source,
      label: "presence_monitor",
    });
    logRecentCommandResponse(CHANNEL_NAME, text, "helix");
  } catch (e) {
    console.warn(
      `[TWITCH][HELIX_CHAT] ${source} failed: ${String(e?.message || e)}`
    );
  }
}

function nowMs() {
  return Date.now();
}

function isNotInGame(nextType, gameName) {
  return (
    nextType === 0 || // Offline
    nextType === 1 || // Online (website)
    nextType === 3 || // Studio
    gameName === "Website" ||
    gameName === "Roblox Studio"
  );
}

// choose how you compare "same game"
function sameGame(aPlaceId, aName, bPlaceId, bName) {
  // placeId is best when present; name can change slightly, so use it as fallback
  if (aPlaceId != null && bPlaceId != null) return aPlaceId === bPlaceId;
  return String(aName || "") === String(bName || "");
}

function canSend(eventKey) {
  const t = nowMs();
  if (t - (lastEventSentAt[eventKey] || 0) < EVENT_COOLDOWN_MS) return false;
  lastEventSentAt[eventKey] = t;
  return true;
}

setInterval(() => {
  // moved to bot/modules/roblox.js
  return;
  const linkedRobloxUserId = getTrackedRobloxUserId();
  if (!linkedRobloxUserId) {
    hasRobloxPresenceSnapshot = false;
    stable = { type: 0, placeId: null, name: null, ts: 0 };
    candidate = { type: 0, placeId: null, name: null, firstSeenTs: 0 };
    lastLeft = { placeId: null, name: null, ts: 0 };
    return;
  }

  ROBLOX_FUNCTIONS.monitorGetPresenceSync(linkedRobloxUserId, async function (presence) {
    if (!presence || presence.ok === false) return;

    const nextPlaceId = presence.placeId ?? null;
    const nextLocation = await ROBLOX_FUNCTIONS.resolvePresenceLocation(presence);
    const nextType = Number(presence.userPresenceType ?? 0);

    // snapshot init
    if (!hasRobloxPresenceSnapshot) {
      hasRobloxPresenceSnapshot = true;
      stable = { type: nextType, placeId: nextPlaceId, name: nextLocation, ts: nowMs() };
      candidate = { type: nextType, placeId: nextPlaceId, name: nextLocation, firstSeenTs: nowMs() };
      return;
    }

    if (SETTINGS.ks !== false) return;

    const candidateChanged =
      candidate.type !== nextType ||
      candidate.placeId !== nextPlaceId ||
      candidate.name !== nextLocation;

    if (candidateChanged) {
      candidate = {
        type: nextType,
        placeId: nextPlaceId,
        name: nextLocation,
        firstSeenTs: nowMs(),
      };
      return; // wait for stability
    }

    // not changed: check if it's been stable long enough
    if (nowMs() - candidate.firstSeenTs < STABLE_MS) return;

    // -------------------------
    // 2) Candidate is stable. Compare against last STABLE (accepted) state
    // -------------------------
    const stableChanged =
      stable.type !== candidate.type ||
      stable.placeId !== candidate.placeId ||
      stable.name !== candidate.name;

    if (!stableChanged) return; // nothing to do

    const prev = { ...stable };
    stable = { ...candidate, ts: nowMs() };

    const displayName = CHANNEL_NAME_DISPLAY || CHANNEL_NAME;

    const prevWasInGame = !isNotInGame(prev.type, prev.name);
    const nextIsInGame = !isNotInGame(stable.type, stable.name);


    const justLeftSameGameRecently =
      nowMs() - lastLeft.ts <= REJOIN_WINDOW_MS &&
      sameGame(lastLeft.placeId, lastLeft.name, stable.placeId, stable.name);


    if (prevWasInGame && !nextIsInGame) {
      lastLeft = { placeId: prev.placeId, name: prev.name, ts: nowMs() };

      if (!canSend("presence_left")) return;
      console.log("target left game with placeid =", prev.placeId);
      await sendPresenceHelixMessage(`${displayName} left the game.`, "presence_left");
      return;
    }

    if (!prevWasInGame && nextIsInGame) {
      if (justLeftSameGameRecently) {
        console.log("suppressed rejoin (same game) within window");
        return;
      }

      if (!canSend("presence_joined")) return;
      console.log("target joined game with placeid =", stable.placeId);
      await sendPresenceHelixMessage(
        `${displayName} is now playing ${stable.name}.`,
        "presence_joined"
      );
      return;
    }

    if (prevWasInGame && nextIsInGame) {
      // SWITCHED games (in-game -> in-game)
      // optional: also suppress if it was a quick drop + same game name flip
      if (justLeftSameGameRecently) {
        console.log("suppressed switch because it looks like a rejoin");
        return;
      }

      // if it's truly a different game, announce it (with cooldown)
      if (!canSend("presence_joined")) return;
      console.log("target switched games to placeid =", stable.placeId);
      await sendPresenceHelixMessage(
        `${displayName} is now playing ${stable.name}.`,
        "presence_joined"
      );
      return;
    }

  });
}, POLL_MS);

client.on("message", async (channel, userstate, message, self, viewers, target) => {
  if (self) return;
  SETTINGS = JSON.parse(fs.readFileSync("./SETTINGS.json"));
  STREAMS = JSON.parse(fs.readFileSync("./STREAMS.json"));

  const lowerMessage = message.toLowerCase();

  const isVip = (() => {
    if (userstate["badges"] && userstate["badges"].vip == 1) {
      return true;
    } else {
      return false;
    }
  })();

  const isSubscriber = userstate["subscriber"];
  const isFirstMessage = userstate["first-msg"];
  const subscriberMonths = (() => {
    if (isSubscriber) {
      return userstate["badge-info"].subscriber;
    } else {
      return null;
    }
  })();
  const hexNameColor = userstate.color;
  const badgeInfo = userstate["badge-info"];
  const messageId = userstate["id"];
  const twitchUserId = userstate["user-id"];
  const twitchUsername = userstate["username"];
  const twitchDisplayName = userstate["display-name"];
  const isTurbo = userstate["turbo"];

  const perms = getChatPerms(userstate, { channelLogin: CHANNEL_NAME });
  const isAdmin = perms.isAdmin;
  const isAllowed = perms.isAllowed;
  const isMod = perms.isMod;
  const isBroadcaster = perms.isBroadcaster;
  const isPermitted = perms.isPermitted;
  const ModOrBroadcaster = isMod || isBroadcaster;
  const isBot = SETTINGS.bots.includes(twitchUsername.toLowerCase());
  const contextKillswitchOn = getContextKillswitchState(SETTINGS);

  const userData = {
    isSubscriber: isSubscriber,
    isFirstMessage: isFirstMessage,
    subscriberMonths: subscriberMonths,
    hexNameColor: hexNameColor,
    badgeInfo: badgeInfo,
    messageId: messageId,
    twitchUserId: twitchUserId,
    twitchUsername: twitchUsername,
    twitchDisplayName: twitchDisplayName,
    isTurbo: isTurbo,
  };

  if (contextKillswitchOn && !isPermitted) {
    return;
  }

  streamNumber = Object.keys(STREAMS).length;

  if (isPermitted && !isBot) {
    handleKillswitchToggle({
      client,
      lowerMessage,
      channelName: CHANNEL_NAME,
      userstate,
      settings: SETTINGS,
    });
    handleKeywordsToggle({
      client,
      lowerMessage,
      channelName: CHANNEL_NAME,
      userstate,
      settings: SETTINGS,
    });
    handleTimersToggle({
      client,
      lowerMessage,
      channelName: CHANNEL_NAME,
      botPrefix: bot,
      userstate,
      settings: SETTINGS,
    });
    // accountHandler(client, lowerMessage, twitchUsername, userstate);
    updateMode(client, message, twitchUsername, userstate);
    {
      const filterRes = handleFilterToggles({
        client,
        message,
        userstate,
        channelName: CHANNEL_NAME,
        settings: SETTINGS,
        settingsPath: SETTINGS_PATH,
      });
      if (filterRes?.updated && filterRes.settings) SETTINGS = filterRes.settings;
    }
    customModeHandler(client, message, twitchUsername, userstate);
    {
      const linkRes = await handleLinkModeMessage({
        client,
        message,
        userstate,
        channelName: CHANNEL_NAME,
        settingsPath: SETTINGS_PATH,
        currentSettings: SETTINGS,
        getChatPerms,
        applyModeToTwitch,
        buildLinkCommandText,
        setFossabotCommand,
        setNightbotCommand,
      });
      if (linkRes?.updated && linkRes.settings) SETTINGS = linkRes.settings;
    }
    if (
      tryHandleLinkCommand({
        client,
        message,
        userstate,
        channelName: CHANNEL_NAME,
        settingsPath: SETTINGS_PATH,
        currentSettings: SETTINGS,
        botPrefix: bot,
      })
    ) {
      return;
    }
    customUserFunctions(client, message, twitchUsername, twitchUserId, userstate);
    customModFunctions(client, message, twitchUsername, userstate);

    if (lowerMessage == "!settings") {
      SETTINGS = JSON.parse(fs.readFileSync("./SETTINGS.json"));

      const ksState = SETTINGS.ks ? "On" : "Off";
      const timersState = SETTINGS.timers ? "On" : "Off";
      const keywordsState = SETTINGS.keywords ? "On" : "Off";

      client.raw(
        `@client-nonce=${userstate["client-nonce"]};reply-parent-msg-id=${userstate["id"]} ` +
        `PRIVMSG #${CHANNEL_NAME} :${bot}Current Settings: ` +
        `Twitch KS - ${ksState} | Timers - ${timersState} | Keywords - ${keywordsState}`
      );
    }

    if (lowerMessage === "!filters") {
      SETTINGS = JSON.parse(fs.readFileSync("./SETTINGS.json", "utf8"));

      const spamState   = SETTINGS.spamFilter ? "On" : "Off";
      const lengthState = SETTINGS.lengthFilter ? "On" : "Off";
      const linkState   = SETTINGS.linkFilter ? "On" : "Off";

      client.raw(
        `@client-nonce=${userstate["client-nonce"]};reply-parent-msg-id=${userstate["id"]} ` +
        `PRIVMSG #${CHANNEL_NAME} :${bot}Filters: ` +
        `Spam - ${spamState} | Length - ${lengthState} | Links - ${linkState}`
      );
    }

    if (message.toLowerCase() === "!currentmode") {
      const modeRaw = SETTINGS?.currentMode;

      if (!modeRaw) {
        client.raw(
          `@client-nonce=${userstate["client-nonce"]};reply-parent-msg-id=${userstate["id"]} ` +
          `PRIVMSG #${CHANNEL_NAME} :${bot}No current mode is set.`
        );
        return;
      }

      let niceMode = modeRaw.replace("!", "").replace(".on", "");

      client.raw(
        `@client-nonce=${userstate["client-nonce"]};reply-parent-msg-id=${userstate["id"]} ` +
        `PRIVMSG #${CHANNEL_NAME} :${bot}The bot is currently in ${niceMode} mode.`
      );

      return;
    }

    if (message.toLowerCase() === "!validmodes") {
      const modes = Array.isArray(SETTINGS?.validModes) ? SETTINGS.validModes : [];

      const text =
        modes.length > 0
          ? `${bot}Valid Modes: ${modes.join(", ")}`
          : `${bot}No validModes set in SETTINGS.json`;

      client.raw(
        `@client-nonce=${userstate["client-nonce"]};reply-parent-msg-id=${userstate["id"]} ` +
        `PRIVMSG #${CHANNEL_NAME} :${text}`
      );
      return;
    }
  } else if (!contextKillswitchOn) {
    void handleFirstMessageWelcome({
      client,
      channelName: CHANNEL_NAME,
      streamerDisplayName: STREAMER_DISPLAY_NAME,
      twitchUsername,
      isFirstMessage,
      userstate,
    });
    if (
      tryHandleLinkCommand({
        client,
        message,
        userstate,
        channelName: CHANNEL_NAME,
        settingsPath: SETTINGS_PATH,
        currentSettings: SETTINGS,
        botPrefix: bot,
      })
    ) {
      return;
    }
    customUserFunctions(client, message, twitchUsername, twitchUserId, userstate);
    const isFilterPermitted = hasTemporaryFilterPermit(twitchUsername);
    if (!isFilterPermitted && SETTINGS["spamFilter"] == true) {
      FILTERS.spamFilter(client, channel, message, twitchUsername, userstate, SETTINGS);
    }
    if (!isFilterPermitted && SETTINGS["lengthFilter"] == true) {
      void FILTERS.lengthFilter(client, channel, message, twitchUsername, userstate, SETTINGS);
    }
    if (!isFilterPermitted && SETTINGS["linkFilter"] == true) {
      FILTERS.linkFilter(client, channel, message, twitchUsername, userstate, SETTINGS);
    }
  }

  if (!userstate?.__discordRelay) {
    logHandler(
      message,
      twitchUsername,
      twitchDisplayName,
      twitchUserId,
      isVip,
      isMod,
      isBroadcaster,
      isFirstMessage,
      isSubscriber,
      messageId
    );
  }

  // if user on cooldown, return
  var keywords;

  const normalizedMessage = String(message || "").trim();
  const isBangCommand = normalizedMessage.startsWith("!");
  const normalizedKeywordMessage = normalizeKeywordText(message);
  const messageArray = normalizedMessage ? normalizedMessage.split(/\s+/) : [];
  var isCommand = commandsList.includes((messageArray[0] || "").toLowerCase());

  if (!isBangCommand) {
    for (const wordSet in WORDS) {
      const phraseList = Array.isArray(WORDS[wordSet]) ? WORDS[wordSet] : [];
      if (phraseList.some((word) => {
        return messageContainsKeywordPhrase(message, word, normalizedKeywordMessage);
      })) {
        keywords = true;
        continue;
      }
    }
  }

  const now = Date.now();
  const cooldownMs = Math.max(0, Number(COOLDOWN) || 0);
  const cooldownUserKey = String(twitchUsername || "").toLowerCase();
  const shouldTrackKeywordCooldown =
    !isPermitted && !!keywords;

  if (shouldTrackKeywordCooldown && user[cooldownUserKey]) {
    if (now - user[cooldownUserKey] < cooldownMs) {
      return;
    }
  }

  if (
    !isBangCommand &&
    !isBot &&
    !contextKillswitchOn &&
    SETTINGS.keywords == true &&
    !isPermitted
  ) {
    joinHandler(message, twitchUsername, isPermitted, twitchUserId);
  }

  if (shouldTrackKeywordCooldown) {
    user[cooldownUserKey] = now;
  }

  if (contextKillswitchOn && !isPermitted) {
    return;
  }
});

async function liveUpHandler() {
  // TO DO = first person to go to stream gets free channel points
  // DONE VIA BASEMENT POINTS
  client.say(
    `${CHANNEL_NAME}`,
    `${bot}${CHANNEL_NAME}, is now live. Logging will start ${
      WAIT_REGISTER / (60 * 1000)
    } minutes after this point to avoid false logging.`
  );

  await delay(WAIT_REGISTER);
  if (await TWITCH_FUNCTIONS.isLive()) {
    PLAYTIME.onStreamStart(PLAYTIME_PATH);

    try {
      const linkedRobloxUserId = getTrackedRobloxUserId();
      if (linkedRobloxUserId) {
        const presence = await ROBLOX_FUNCTIONS.getPresence(linkedRobloxUserId);
        const location = await ROBLOX_FUNCTIONS.resolvePresenceLocation(presence);
        const trackedGame =
          !location || location === "Website" ? null : location;

        PLAYTIME.onGameChange(trackedGame, PLAYTIME_PATH);
      } else {
        PLAYTIME.onGameChange(null, PLAYTIME_PATH);
      }
    } catch (e) {
      console.error("[playtime] getPresence failed on stream start:", e);
    }

    client.say(CHANNEL_NAME, `Logging now starts. There has been ${streamNumber} number of streams since logging started and this stream will be ${streamNumber + 1}`);

    const time = new Date();
    const startTime = time.getTime() - WAIT_REGISTER;

    streamNumber++;
    STREAMS[streamNumber] = JSON.parse(JSON.stringify(STREAMS?.[1] || {}));
    STREAMS[streamNumber]["date"] = time;
    STREAMS[streamNumber]["day"] = time.getDay();
    STREAMS[streamNumber]["ISODate"] = time.toISOString();
    STREAMS[streamNumber]["streamStart"] = time.getTime();
    fs.writeFileSync("./STREAMS.json", JSON.stringify(STREAMS));
  } else {
    client.say(`${CHANNEL_NAME}`, "false log.");
  }
}

async function liveDownHandler() {
  if (await TWITCH_FUNCTIONS.isLive()) {
    await delay(WAIT_REGISTER / 100);
    client.say(CHANNEL_NAME, `${CHANNEL_NAME}, is now offline. Logging has stopped. Games played totals are saved.`);

    PLAYTIME.onStreamEnd(PLAYTIME_PATH, false);

    const endTime = new Date().getTime();
    STREAMS[streamNumber]["streamEnd"] = endTime;
    STREAMS[streamNumber]["repeatLengthOffenders"] = {};
    STREAMS[streamNumber]["repeatSpamOffenders"] = {};
    fs.writeFileSync("./STREAMS.json", JSON.stringify(STREAMS));
  } else {
    client.say(CHANNEL_NAME, "false log.");
  }
}

let pubsubController = null;
try {
  if (isPubsubModuleEnabled()) {
    pubsubController = startTwitchPubsub({
      client,
      twitchFunctions: TWITCH_FUNCTIONS,
      botOauth: BOT_OAUTH,
      streamerOauth: STREAMER_TOKEN,
      channelId: CHANNEL_ID,
      botId: BOT_ID,
      channelName: CHANNEL_NAME,
      settingsPath: SETTINGS_PATH,
      streamsPath: STREAMS_PATH,
      liveUpHandler,
      liveDownHandler,
    });
    console.log("[modules] pubsub=on");
  } else {
    console.log("[modules] pubsub=off");
  }
} catch (e) {
  console.warn("[modules] pubsub init failed:", String(e?.message || e));
}

// Alerts moved to bot/modules/alerts.js

// (donation/sub/bits alert helpers moved to bot/modules/alerts.js)

// Roblox helpers moved to bot/modules/roblox.js

// More User Commands
client.on("message", async (channel, userstate, message, self, viewers) => {
  const twitchDisplayName = userstate["display-name"];
  const twitchUsername = userstate["username"];
  const perms = getChatPerms(userstate, { channelLogin: CHANNEL_NAME });
  const isAdmin = perms.isAdmin;
  const isMod = perms.isMod;
  const isBroadcaster = perms.isBroadcaster;
  const isPermitted = perms.isPermitted;
  const ModOrBroadcaster = isMod || isBroadcaster;
  const isVip = (() => {
    if (userstate["badges"] && userstate["badges"].vip == 1) {
      return true;
    } else {
      return false;
    }
  })();
  const lowerMessage = String(message || "").toLowerCase().trim();

  if (!getContextKillswitchState(SETTINGS)) {
    const handledGlobal = await tryHandleGlobalCommands({
      client,
      channelName: CHANNEL_NAME,
      userstate,
      message,
      botPrefix: bot,
      version: BUILD_INFO.summary,
      webPublicUrl: WEB_PUBLIC_URL,
      twitchFunctions: TWITCH_FUNCTIONS,
      isSharedCommandCooldownActive,
      isMod,
    });
    if (handledGlobal) return;

    if (
      lowerMessage == "1join" ||
      lowerMessage == "?join" ||
      lowerMessage == "`join" ||
      lowerMessage == "|join" ||
      lowerMessage == "[join" ||
      lowerMessage == "[join" ||
      lowerMessage == ";join" ||
      lowerMessage == "$join"
      ) {
        const linkedRobloxUserId = getTrackedRobloxUserId();
        if (!linkedRobloxUserId) {
          client.say(
            CHANNEL_NAME,
            `${bot}@${twitchUsername}, ${ROBLOX_UNLINKED_CHAT_MESSAGE}`
          );
          return;
        }

        client.say(
          CHANNEL_NAME,
          bot 
          +
          `@${twitchUsername}, follow ${STREAMER_DISPLAY_NAME} on Twitch and click here to play: roblox.com/users/${linkedRobloxUserId} (${CHANNEL_NAME}_TTV)`
        );
      }
      if (isAdmin || isBroadcaster) {
        if (lowerMessage == "!part" || lowerMessage == "!disconnect") {
          client.say(CHANNEL_NAME, `Left channel ${CHANNEL_NAME}.`);
          client.disconnect()
        } else if (lowerMessage == "!joinchannel") {
          client.connect()
          client.say(CHANNEL_NAME, `Joined channel ${CHANNEL_NAME}.`)
        }
      }
  }
});

// Corrections
client.on("message", async (channel, userstate, message, self, viewers) => {
  SETTINGS = JSON.parse(fs.readFileSync("./SETTINGS.json"));
  STREAMS = JSON.parse(fs.readFileSync("./STREAMS.json"));

  const twitchDisplayName = userstate["display-name"];
  const twitchUsername = userstate["username"];
  const perms = getChatPerms(userstate, { channelLogin: CHANNEL_NAME });
  const isMod = perms.isMod;
  const isBroadcaster = perms.isBroadcaster;
  const isPermitted = perms.isPermitted;
  const ModOrBroadcaster = isMod || isBroadcaster;

  var currentMode = SETTINGS.currentMode.replace('.on', '')
  currentMode = currentMode.replace('!', '')

  var responsesd = SETTINGS.main

  for (const key in responsesd) {
    if (key == currentMode) {
      if (!isPermitted && !getContextKillswitchState(SETTINGS)) {
        if (SETTINGS.currentMode == "!join.on") {
          if (message.toLowerCase() == "!link" || message.toLowerCase() == "!vip") {
            if (isSharedCommandCooldownActive(userstate)) return;

            client.raw(`@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :${bot}There is not currently a link. Use the !join command to get the join link.`);
            client.say(CHANNEL_NAME, `${responsesd[key]} @${twitchUsername}`)
          }
        }
      }
    }
  }
});

// ---------- BOT STATUS ----------
const BOT_STATUS = {
  online: true,
  startedAt: Date.now(),
  ks: SETTINGS?.ks,
  currentMode: SETTINGS?.currentMode,
  timers: SETTINGS?.timers,
  keywords: SETTINGS?.keywords,
  lastError: null,
  build: BUILD_INFO,
};

function setStatus(patch) {
  Object.assign(BOT_STATUS, patch);
}

function getStatusSnapshot() {
  let settings;
  try {
    settings = JSON.parse(fs.readFileSync("./SETTINGS.json"));
  } catch {}
  const now = Date.now();

  return {
    ...BOT_STATUS,
    instance: INSTANCE_NAME,
    channelName: CHANNEL_NAME || null,
    channelDisplayName: STREAMER_DISPLAY_NAME,
    webPublicUrl: WEB_PUBLIC_URL || null,
    build: BUILD_INFO,
    ks: settings?.ks ?? BOT_STATUS.ks,
    currentMode: settings?.currentMode ?? BOT_STATUS.currentMode,
    timers: settings?.timers ?? BOT_STATUS.timers,
    keywords: settings?.keywords ?? BOT_STATUS.keywords,
    twitchLive: EXTERNAL_STATUS.twitchLive,
    twitchUptime: EXTERNAL_STATUS.twitchUptime,
    roblox: EXTERNAL_STATUS.roblox,
    spotify: EXTERNAL_STATUS.spotify,
    externalUpdatedAt: EXTERNAL_STATUS.updatedAt,
    cooldowns: {
      commandGlobalMs: COMMAND_GLOBAL_COOLDOWN_MS,
      commandUserMs: COMMAND_USER_COOLDOWN_MS,
      gamesPlayedChatMs: GAMES_PLAYED_CHAT_COOLDOWN_MS,
      friendCommandMs: getRobloxFriendCooldownMs(),
      keywordReplyMs: Math.max(0, Number(COOLDOWN) || 0),
      activeCommandGlobalRemainingMs: Math.max(
        0,
        Number(commandGlobalCooldownUntil || 0) - now
      ),
      activeGamesPlayedRemainingMs: getRobloxGamesPlayedCooldownRemainingMs(now),
      activeFriendRemainingMs: getRobloxFriendCooldownRemainingMs(now),
    },
  };
}

// ---------- WEB SERVER ----------
// (moved to bot/web/server.js)
const WEB = startWebServer({ getStatusSnapshot, logDiscordModAction });

async function gracefulShutdown(signal = "shutdown") {
  try {
    console.log(`[shutdown] ${signal}: flushing state...`);
    if (BOT_SHUTDOWN_MESSAGE) {
      await sendLifecycleChatMessage(BOT_SHUTDOWN_MESSAGE, { signal });
      await delay(350);
    }
    try {
      WEB?.stop?.();
    } catch {}
    try {
      alertsController?.stop?.();
    } catch {}
    try {
      pubsubController?.stop?.();
    } catch {}
    try {
      TIMERS?.stop?.();
    } catch {}
    try {
      await DISCORD?.shutdown?.();
    } catch {}
    try {
      await COMMAND_COUNTER?.flushNow?.();
    } catch {}
    try {
      await NAMED_COUNTERS?.flushNow?.();
    } catch {}
    await flushStateNow();
  } catch (e) {
    console.warn("[shutdown] flush failed:", String(e?.message || e));
  } finally {
    process.exit(0);
  }
}

process.on("SIGINT", () => void gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => void gracefulShutdown("SIGTERM"));

// catch crashes -> status page shows them
process.on("uncaughtException", e =>
  setStatus({ lastError: String(e?.message || e) })
);
process.on("unhandledRejection", e =>
  setStatus({ lastError: String(e?.message || e) })
);




