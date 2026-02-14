let chatArray = {}
import * as TWITCH_FUNCTIONS from "../api/twitch/helix.js";

const DEFAULT_FILTERS = {
  spam: {
    windowMs: 7000,
    minMessages: 5,
    strikeResetMs: 10 * 60 * 1000,
    timeoutFirstSec: 30,
    timeoutRepeatSec: 60,
    reason: "[AUTOMATIC] Please stop excessively spamming - MainsBot",
    messageFirst: "{atUser}, please stop excessively spamming.",
    messageRepeat: "{atUser} Please STOP excessively spamming.",
  },
  length: {
    maxChars: 400,
    strikeResetMs: 10 * 60 * 1000,
    timeoutFirstSec: 30,
    timeoutRepeatSec: 60,
    reason: "[AUTOMATIC] Message exceeds max character limit - MainsBot",
    message: "{atUser} Message exceeds max character limit.",
  },
  link: {
    strikeResetMs: 10 * 60 * 1000,
    timeoutFirstSec: 1,
    timeoutRepeatSec: 5,
    reason: "[AUTOMATIC] No links allowed - MainsBot",
    message: "{atUser} No links allowed in chat.",
  },
};

function normalizeLogin(value) {
  return String(value || "").trim().toLowerCase();
}

function getChannelLogin(channel) {
  return normalizeLogin(String(channel || "").replace(/^#/, ""));
}

function formatTemplate(template, twitchUsername) {
  const user = String(twitchUsername || "").trim();
  const atUser = user ? `@${user}` : "";
  return String(template || "")
    .replace(/\{atUser\}/gi, atUser)
    .replace(/\{user\}/gi, user)
    .trim();
}

function getLists(settings) {
  const exemptions = Array.isArray(settings?.filterExemptions)
    ? settings.filterExemptions.map((x) => normalizeLogin(x)).filter(Boolean)
    : [];
  const bots = Array.isArray(settings?.bots)
    ? settings.bots.map((x) => normalizeLogin(x)).filter(Boolean)
    : [];
  return { exemptions, bots };
}

function getFilterConfig(settings) {
  const cfg = settings?.filters && typeof settings.filters === "object" ? settings.filters : {};
  const spam = cfg?.spam && typeof cfg.spam === "object" ? cfg.spam : {};
  const length = cfg?.length && typeof cfg.length === "object" ? cfg.length : {};
  const link = cfg?.link && typeof cfg.link === "object" ? cfg.link : {};
  const int = (v, fallback) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : fallback;
  };
  const str = (v, fallback) => (v == null ? fallback : String(v)).trim();
  return {
    spam: {
      windowMs: int(spam.windowMs, DEFAULT_FILTERS.spam.windowMs),
      minMessages: int(spam.minMessages, DEFAULT_FILTERS.spam.minMessages),
      strikeResetMs: int(spam.strikeResetMs, DEFAULT_FILTERS.spam.strikeResetMs),
      timeoutFirstSec: int(spam.timeoutFirstSec, DEFAULT_FILTERS.spam.timeoutFirstSec),
      timeoutRepeatSec: int(spam.timeoutRepeatSec, DEFAULT_FILTERS.spam.timeoutRepeatSec),
      reason: str(spam.reason, DEFAULT_FILTERS.spam.reason),
      messageFirst: str(spam.messageFirst, DEFAULT_FILTERS.spam.messageFirst),
      messageRepeat: str(spam.messageRepeat, DEFAULT_FILTERS.spam.messageRepeat),
    },
    length: {
      maxChars: int(length.maxChars, DEFAULT_FILTERS.length.maxChars),
      strikeResetMs: int(length.strikeResetMs, DEFAULT_FILTERS.length.strikeResetMs),
      timeoutFirstSec: int(length.timeoutFirstSec, DEFAULT_FILTERS.length.timeoutFirstSec),
      timeoutRepeatSec: int(length.timeoutRepeatSec, DEFAULT_FILTERS.length.timeoutRepeatSec),
      reason: str(length.reason, DEFAULT_FILTERS.length.reason),
      message: str(length.message, DEFAULT_FILTERS.length.message),
    },
    link: {
      strikeResetMs: int(link.strikeResetMs, DEFAULT_FILTERS.link.strikeResetMs),
      timeoutFirstSec: int(link.timeoutFirstSec, DEFAULT_FILTERS.link.timeoutFirstSec),
      timeoutRepeatSec: int(link.timeoutRepeatSec, DEFAULT_FILTERS.link.timeoutRepeatSec),
      reason: str(link.reason, DEFAULT_FILTERS.link.reason),
      message: str(link.message, DEFAULT_FILTERS.link.message),
    },
  };
}

function isPrivileged(userstate, channel, twitchUsername) {
  const isMod = !!userstate?.mod;
  const isBroadcaster = normalizeLogin(twitchUsername) === getChannelLogin(channel);
  return isMod || isBroadcaster;
}

function stripTrailingPunct(value) {
  return String(value || "").trim().replace(/[)\],.>]+$/g, "");
}

function ensureHttps(value) {
  if (!value) return value;
  if (/^https?:\/\//i.test(value)) return value;
  return `https://${value}`;
}

function normalizeDomain(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^www\./, "");
}

function normalizePath(pathname) {
  if (!pathname || pathname === "/") return "";
  return pathname.replace(/\/+$/, "");
}

function normalizeSearch(url) {
  const entries = [];
  url.searchParams.forEach((value, key) => {
    entries.push([key, value]);
  });

  if (!entries.length) return "";

  entries.sort((a, b) => {
    const keyCmp = a[0].localeCompare(b[0]);
    return keyCmp !== 0 ? keyCmp : a[1].localeCompare(b[1]);
  });

  const params = new URLSearchParams();
  for (const [key, value] of entries) {
    params.append(key, value);
  }

  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

function normalizeUrlForMatch(raw) {
  const cleaned = stripTrailingPunct(raw);
  if (!cleaned) return null;

  const withScheme = ensureHttps(cleaned);
  let url;

  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") return null;

  const host = normalizeDomain(url.hostname);
  if (!host) return null;

  const port = url.port ? `:${url.port}` : "";
  const path = normalizePath(url.pathname);
  const search = normalizeSearch(url);

  return `https://${host}${port}${path}${search}`;
}

function isDomainAllowlistEntry(value) {
  return value && !/[\/?#:]/.test(value);
}

export function normalizeAllowlistEntry(input) {
  const cleaned = stripTrailingPunct(input);
  if (!cleaned) return null;

  if (isDomainAllowlistEntry(cleaned)) {
    const domain = normalizeDomain(cleaned);
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)) return null;
    return domain;
  }

  return normalizeUrlForMatch(cleaned);
}

function isUrlAllowedByAllowlist(rawUrl, allowlist) {
  if (!Array.isArray(allowlist) || allowlist.length === 0) return false;

  const normalizedUrl = normalizeUrlForMatch(rawUrl);
  if (!normalizedUrl) return false;

  const parsed = new URL(normalizedUrl);
  const host = normalizeDomain(parsed.hostname);

  for (const entry of allowlist) {
    const normalizedEntry = normalizeAllowlistEntry(entry);
    if (!normalizedEntry) continue;

    if (isDomainAllowlistEntry(normalizedEntry)) {
      if (host === normalizedEntry || host.endsWith(`.${normalizedEntry}`)) {
        return true;
      }
      continue;
    }

    if (normalizedEntry === normalizedUrl) return true;
  }

  return false;
}

function extractUrls(text) {
  const s = String(text || "");

  // Match only link-like tokens:
  // 1) explicit protocol URLs (http/https)
  // 2) www-prefixed URLs
  // 3) bare domains with alphabetic TLD (avoids matching decimals like "1.0")
  const protocolRe = /\bhttps?:\/\/[^\s<>()]+/gi;
  const wwwRe = /\bwww\.[^\s<>()]+/gi;
  const bareDomainRe =
    /\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}(?::\d{2,5})?(?:[/?#][^\s<>()]*)?/gi;

  // Ignore mode command tokens like !link.on / join.off while still
  // catching real domains such as twitch.tv.
  const isModeToggleToken = (index, token) => {
    const raw = String(token || "").trim();
    if (!raw) return false;

    // Plain mode toggle token in message text (e.g. "join.on", "ks.off")
    if (/^[a-z0-9_-]+\.(?:on|off)$/i.test(raw)) return true;

    // Bang-prefixed command where regex match starts after "!" (e.g. "!join.on")
    if (!Number.isInteger(index) || index <= 0) return false;
    if (s[index - 1] !== "!") return false;
    return /^[a-z0-9_-]+\.(?:on|off)$/i.test(raw);
  };

  const collectMatches = (regex, { ignoreModeTokens = false } = {}) => {
    const out = [];
    for (const m of s.matchAll(regex)) {
      const token = String(m?.[0] || "");
      const index = Number(m?.index);
      if (!token) continue;
      if (ignoreModeTokens && isModeToggleToken(index, token)) continue;
      out.push(token);
    }
    return out;
  };

  const matches = [
    ...collectMatches(protocolRe),
    ...collectMatches(wwwRe),
    ...collectMatches(bareDomainRe, { ignoreModeTokens: true }),
  ];

  // normalize: if it doesn't have scheme, add https:// so URL() can parse
  return Array.from(
    new Set(
      matches
        .map((u) => stripTrailingPunct(u))
        .filter(Boolean)
        .map((u) => ensureHttps(u))
    )
  );
}

/* YouTube moderation removed (2026-02-11)
function isYouTubeMessage(userstate) {
  return String(userstate?.platform || "").toLowerCase() === "youtube";
}

function getYouTubeMessageId(userstate) {
  return String(userstate?.["yt-message-id"] || userstate?.id || "").trim();
}

function getYouTubeAuthorChannelId(userstate) {
  return String(
    userstate?.["yt-author-channel-id"] || userstate?.["user-id"] || ""
  ).trim();
}

const YT_DELETE_COOLDOWN_MS = 5000;
const YT_TIMEOUT_COOLDOWN_MS = 8000;
const YT_MODERATION_CACHE_TTL_MS = 60 * 1000;
const ytDeleteAttemptAt = new Map();
const ytTimeoutAttemptAt = new Map();

function pruneOldAttempts(map, now = Date.now()) {
  for (const [key, at] of map) {
    if (!at || now - at > YT_MODERATION_CACHE_TTL_MS) {
      map.delete(key);
    }
  }
}

function markAttemptIfNotCooling(map, key, cooldownMs, now = Date.now()) {
  const normalizedKey = String(key || "").trim();
  if (!normalizedKey) return false;

  const previous = Number(map.get(normalizedKey) || 0);
  if (previous && now - previous < cooldownMs) {
    return false;
  }

  map.set(normalizedKey, now);
  return true;
}

async function youtubeDeleteMessage(userstate) {
  if (!YOUTUBE_ENABLED) return false;
  const messageId = getYouTubeMessageId(userstate);
  if (!messageId) return false;

  const now = Date.now();
  pruneOldAttempts(ytDeleteAttemptAt, now);
  if (!markAttemptIfNotCooling(ytDeleteAttemptAt, messageId, YT_DELETE_COOLDOWN_MS, now)) {
    return false;
  }

  const result = await deleteYouTubeLiveChatMessage({
    messageId,
    accessToken: YOUTUBE_ACCESS_TOKEN,
    refreshToken: YOUTUBE_REFRESH_TOKEN,
    clientId: YOUTUBE_CLIENT_ID,
    clientSecret: YOUTUBE_CLIENT_SECRET,
  }).catch(() => null);

  if (result?.accessToken) {
    YOUTUBE_ACCESS_TOKEN = result.accessToken;
  }

  return !!result?.ok;
}

async function youtubeTimeoutUser(userstate, durationSeconds) {
  if (!YOUTUBE_ENABLED) return false;
  const targetChannelId = getYouTubeAuthorChannelId(userstate);
  if (!targetChannelId) return false;

  const now = Date.now();
  pruneOldAttempts(ytTimeoutAttemptAt, now);
  if (
    !markAttemptIfNotCooling(
      ytTimeoutAttemptAt,
      targetChannelId,
      YT_TIMEOUT_COOLDOWN_MS,
      now
    )
  ) {
    return false;
  }

  const result = await timeoutYouTubeLiveChatUser({
    targetChannelId,
    durationSeconds,
    liveChatId: YOUTUBE_LIVE_CHAT_ID,
    apiKey: YOUTUBE_API_KEY,
    channelId: YOUTUBE_CHANNEL_ID,
    broadcastId: process.env.YOUTUBE_BROADCAST_ID,
    accessToken: YOUTUBE_ACCESS_TOKEN,
    refreshToken: YOUTUBE_REFRESH_TOKEN,
    clientId: YOUTUBE_CLIENT_ID,
    clientSecret: YOUTUBE_CLIENT_SECRET,
  }).catch(() => null);

  if (result?.accessToken) {
    YOUTUBE_ACCESS_TOKEN = result.accessToken;
  }

  return !!result?.ok;
}
*/


const spamBuckets = new Map();
const linkBuckets = new Map();
const lengthBuckets = new Map();

export async function lengthFilter(client, channel, message, twitchUsername, userstate, settingsOverride) {
  const user = normalizeLogin(twitchUsername);
  if (!user) return;

  const settings = settingsOverride && typeof settingsOverride === "object" ? settingsOverride : {};
  const { exemptions, bots } = getLists(settings);
  if (exemptions.includes(user)) return;
  if (bots.includes(user)) return;
  if (isPrivileged(userstate, channel, user)) return;

  const cfg = getFilterConfig(settings).length;
  const maxChars = Number(cfg.maxChars) || 0;
  if (!message || (maxChars > 0 && message.length <= maxChars)) return;

  const now = Date.now();
  let bucket = lengthBuckets.get(user);
  if (!bucket) {
    bucket = { strikes: 0, lastStrikeAt: 0 };
    lengthBuckets.set(user, bucket);
  }

  if (bucket.lastStrikeAt && now - bucket.lastStrikeAt > cfg.strikeResetMs) {
    bucket.strikes = 0;
  }

  const isRepeat = Number(bucket.strikes || 0) > 0;
  const timeoutLen = isRepeat ? cfg.timeoutRepeatSec : cfg.timeoutFirstSec;
  bucket.strikes = Number(bucket.strikes || 0) + 1;
  bucket.lastStrikeAt = now;

  const reason = cfg.reason || DEFAULT_FILTERS.length.reason;
  const timeoutMessage = formatTemplate(cfg.message || DEFAULT_FILTERS.length.message, twitchUsername);

  TWITCH_FUNCTIONS.timeoutEXP(twitchUsername, reason, timeoutLen, () => {
    if (timeoutMessage) client.say(channel, timeoutMessage);
  });
}

export async function onUntimedOut(twitchUsername) {
  const user = normalizeLogin(twitchUsername);
  if (!user) return;
  spamBuckets.delete(user);
  linkBuckets.delete(user);
  lengthBuckets.delete(user);
}

export function spamFilter(client, channel, message, twitchUsername, userstate, settingsOverride) {
  const user = normalizeLogin(twitchUsername);
  if (!user) return;

  const settings = settingsOverride && typeof settingsOverride === "object" ? settingsOverride : {};
  const { exemptions, bots } = getLists(settings);
  if (exemptions.includes(user)) return;
  if (bots.includes(user)) return;
  if (isPrivileged(userstate, channel, user)) return;

  const cfg = getFilterConfig(settings).spam;
  const now = Date.now();

  let bucket = spamBuckets.get(user);
  if (!bucket) {
    bucket = { msgs: [], cooling: false, strikes: 0, lastStrikeAt: 0 };
    spamBuckets.set(user, bucket);
  }

  if (bucket.lastStrikeAt && now - bucket.lastStrikeAt > cfg.strikeResetMs) {
    bucket.strikes = 0;
  }

  bucket.msgs.push(now);
  while (bucket.msgs.length && now - bucket.msgs[0] > cfg.windowMs) {
    bucket.msgs.shift();
  }
  if (bucket.cooling) return;

  const minCount = Number(cfg.minMessages) || 0;
  if (bucket.msgs.length <= minCount) return;

  bucket.cooling = true;

  const isRepeat = Number(bucket.strikes || 0) > 0;
  const timeoutLen = isRepeat ? cfg.timeoutRepeatSec : cfg.timeoutFirstSec;
  bucket.strikes = Number(bucket.strikes || 0) + 1;
  bucket.lastStrikeAt = now;

  const reason = cfg.reason || DEFAULT_FILTERS.spam.reason;
  const tmpl = isRepeat ? cfg.messageRepeat : cfg.messageFirst;
  const timeoutMessage = formatTemplate(tmpl || (isRepeat ? DEFAULT_FILTERS.spam.messageRepeat : DEFAULT_FILTERS.spam.messageFirst), twitchUsername);

  TWITCH_FUNCTIONS.timeoutEXP(twitchUsername, reason, timeoutLen, () => {
    if (timeoutMessage) client.say(channel, timeoutMessage);
    bucket.msgs.length = 0;
    bucket.cooling = false;
  });
}

export function linkFilter(client, channel, message, twitchUsername, userstate, settingsOverride) {
  const user = normalizeLogin(twitchUsername);
  if (!user) return false;

  const settings = settingsOverride && typeof settingsOverride === "object" ? settingsOverride : {};
  if (settings?.linkFilter === false) return false;
  if (isPrivileged(userstate, channel, user)) return false;

  const urls = extractUrls(message);
  if (!urls.length) return false;

  const allowlist = Array.isArray(settings?.linkAllowlist)
    ? settings.linkAllowlist
    : Array.isArray(settings?.allowedLinks)
      ? settings.allowedLinks
      : [];
  const allAllowed = urls.every((u) => isUrlAllowedByAllowlist(u, allowlist));
  if (allAllowed) return false;

  const cfg = getFilterConfig(settings).link;
  const now = Date.now();

  let linkState = linkBuckets.get(user);
  if (!linkState) {
    linkState = { strikes: 0, lastStrikeAt: 0 };
    linkBuckets.set(user, linkState);
  }

  if (linkState.lastStrikeAt && now - linkState.lastStrikeAt > cfg.strikeResetMs) {
    linkState.strikes = 0;
  }

  const isRepeatOffense = Number(linkState.strikes || 0) >= 1;
  linkState.strikes = Number(linkState.strikes || 0) + 1;
  linkState.lastStrikeAt = now;

  const timeoutLen = isRepeatOffense ? cfg.timeoutRepeatSec : cfg.timeoutFirstSec;
  const reason = cfg.reason || DEFAULT_FILTERS.link.reason;
  const timeoutMessage = formatTemplate(cfg.message || DEFAULT_FILTERS.link.message, twitchUsername);

  TWITCH_FUNCTIONS.timeoutEXP(twitchUsername, reason, timeoutLen, () => {
    if (timeoutMessage) client.say(channel, timeoutMessage);
  });
  return true;
}
