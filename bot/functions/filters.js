let chatArray = {}

const BOT_OAUTH = process.env.BOT_OAUTH// bot oauth token for performing actions
const COOKIE = process.env.COOKIE // <--- change this to your cookie

const BOT_NAME = process.env.BOT_NAME// bot username
const CHANNEL_NAME = process.env.CHANNEL_NAME// name of the channel for the bot to be in
const CHANNEL_ID = process.env.CHANNEL_ID // id of channel for the bot to be in
const BOT_ID = process.env.BOT_ID
const SPOTIFY_BOT_OAUTH = process.env.SPOTIFY_BOT_OAUTH
const SPOTIFY_BOT_NAME = process.env.SPOTIFY_BOT_NAME

const WAIT_REGISTER = process.env.WAIT_REGISTER// number of milliseconds, to wait before starting to get stream information

const COOLDOWN = process.env.COOLDOWN // number of milliseconds, cool down for replying to people
const MESSAGE_MEMORY = process.env.MESSAGE_MEMORY // number of milliseconds, until bot forgots message for spam filter

const MAX_MESSAGE_LENGTH = process.env.MAX_MESSAGE_LENGTH// max number of characters until timeout
const BASE_LENGTH_TIMEOUT = process.env.BASE_LENGTH_TIMEOUT // base timeout for using too many characters
const MAX_LENGTH_TIMEOUT = process.env.MAX_LENGTH_TIMEOUT// max timeout for using too many characters

const BASE_SPAM_TIMEOUT = process.env.BASE_SPAM_TIMEOUT // base timeout for spam, this would be for first time offenders
const MAX_SPAM_TIMEOUT = process.env.MAX_SPAM_TIMEOUT // max timeout for spam, this stops the timeout length doubling infinitely for repeat offenders

const MINIMUM_CHARACTERS = process.env.MINIMUM_CHARACTERS // [NOT IMPLEMENTED RN] minimum message length for bot to log message
const MAXIMUM_SIMILARITY = process.env.MAXIMUM_SIMILARITY // percentage similarity of spam for timeout to happen
const MINIMUM_MESSAGE_COUNT = process.env.MINIMUM_MESSAGE_COUNT // minimum number of messages for spam filter to start punishing

const MAINS_BOT_CLIENT_ID = process.env.MAINS_BOT_CLIENT_ID
const CHEEEZZ_BOT_CLIENT_ID = process.env.CHEEEZZ_BOT_CLIENT_ID
const APP_ACCESS_TOKEN = process.env.APP_ACCESS_TOKEN
// timers
const WAIT_UNTIL_FOC_OFF = process.env.WAIT_UNTIL_FOC_OFF // 2 minutes
const WAIT_UNTIL_FOC_OFF_RAID = process.env.WAIT_UNTIL_FOC_OFF_RAID // every 5 minutes
const SPAM_LINK = process.env.SPAM_LINK // every 5 minutes
const JOIN_TIMER = process.env.JOIN_TIMER // every 2 minutes
let MUTATED_JOIN_TIMER = 120000 // timer that uses the JOIN_TIMER to change the interval based on viewer count

const SONG_TIMER = process.env.SONG_TIMER


import fs from "fs";

let SETTINGS = JSON.parse(fs.readFileSync("./SETTINGS.json"));
let STREAMS = JSON.parse(fs.readFileSync("./STREAMS.json"));

import * as ROBLOX_FUNCTIONS from "../api/roblox/index.js";
import * as TWITCH_FUNCTIONS from "../api/twitch/helix.js";

const exemptions = SETTINGS.filterExemptions;

var streamNumber = Object.keys(STREAMS).length;
const bots = SETTINGS.bots

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


export async function lengthFilter(client, message, twitchUsername, userstate) {
  const user = String(twitchUsername || "").toLowerCase();
  if (!user) return;

  if (exemptions.includes(user)) return;
  if (bots.includes(user)) return;

  if (!message || message.length <= MAX_MESSAGE_LENGTH) return;

  // Ensure stream + map exist
  STREAMS[streamNumber] ??= {};
  STREAMS[streamNumber].repeatLengthOffenders ??= {};

  const offenders = STREAMS[streamNumber].repeatLengthOffenders;

  const strikes = Number(offenders[user] || 0);
  const timeoutLen = strikes > 0 ? 60 : 30;

  offenders[user] = strikes + 1;

  const reason = "[AUTOMATIC] Message exceeds max character limit - MainsBot";
  const timeoutMessage = `@${twitchUsername} Message exceeds max character limit.`;

  TWITCH_FUNCTIONS.timeoutEXP(twitchUsername, reason, timeoutLen, () => {
    client.say(CHANNEL_NAME, timeoutMessage);
  });

  fs.writeFileSync("./STREAMS.json", JSON.stringify(STREAMS));
}

export async function onUntimedOut(twitchUsername) {
  for (const chatter in chatArray){
    if (chatter == twitchUsername.toLowerCase()){
      chatArray[chatter][1] = false
    }
  }
}

const SPAM_WINDOW_MS = 7000;
const STRIKE_RESET_MS = 10 * 60 * 1000; // reset strikes after 10 min of behaving

const chatBuckets = new Map();
const linkBuckets = new Map();
const LINK_STRIKE_RESET_MS = 10 * 60 * 1000;

export function spamFilter(client, message, twitchUsername, userstate) {
  const user = String(twitchUsername || "").toLowerCase();
  if (!user) return;
  if (bots.includes(user)) return;

  const now = Date.now();

  let bucket = chatBuckets.get(user);
  if (!bucket) {
    bucket = { msgs: [], cooling: false, strikes: 0, lastStrikeAt: 0 };
    chatBuckets.set(user, bucket);
  }

  if (bucket.lastStrikeAt && now - bucket.lastStrikeAt > STRIKE_RESET_MS) {
    bucket.strikes = 0;
  }

  bucket.msgs.push(now);

  while (bucket.msgs.length && now - bucket.msgs[0] > SPAM_WINDOW_MS) {
    bucket.msgs.shift();
  }

  if (bucket.cooling) return;

  const minCount = Number(MINIMUM_MESSAGE_COUNT) || 5;
  if (bucket.msgs.length <= minCount) return;

  bucket.cooling = true;

  const strikes = Number(bucket.strikes || 0);
  const timeoutLen = strikes > 0 ? 60 : 30;

  bucket.strikes = strikes + 1;
  bucket.lastStrikeAt = now;

  const reason = "[AUTOMATIC] Please stop excessively spamming - MainsBot"
  const timeoutMessage =
    strikes > 0
      ? `@${twitchUsername} Please STOP excessively spamming.`
      : `@${twitchUsername}, please stop excessively spamming.`;

  TWITCH_FUNCTIONS.timeoutEXP(twitchUsername, reason, timeoutLen, () => {
    client.say(CHANNEL_NAME, timeoutMessage);

    bucket.msgs.length = 0;
    bucket.cooling = false;
  });
}

export function linkFilter(client, message, twitchUsername, userstate, settingsOverride) {
  const user = String(twitchUsername || "").toLowerCase();
  if (!user) return false;

  const settings = settingsOverride ?? SETTINGS ?? {};

  if (settings?.linkFilter === false) return false;

  const isMod = !!userstate?.mod;
  const isBroadcaster =
    userstate?.username?.toLowerCase() === CHANNEL_NAME.toLowerCase();
  if (isMod || isBroadcaster) return false;

  const urls = extractUrls(message);
  if (!urls.length) return false;

  const allowlist = Array.isArray(settings?.linkAllowlist)
    ? settings.linkAllowlist
    : Array.isArray(settings?.allowedLinks)
      ? settings.allowedLinks
      : [];

  const allAllowed = urls.every((u) => isUrlAllowedByAllowlist(u, allowlist));
  if (allAllowed) return false;

  const reason = "[AUTOMATIC] No links allowed - MainsBot";
  const now = Date.now();

  let linkState = linkBuckets.get(user);
  if (!linkState) {
    linkState = { strikes: 0, lastStrikeAt: 0 };
    linkBuckets.set(user, linkState);
  }

  if (linkState.lastStrikeAt && now - linkState.lastStrikeAt > LINK_STRIKE_RESET_MS) {
    linkState.strikes = 0;
  }

  const isRepeatOffense = linkState.strikes >= 1;
  linkState.strikes += 1;
  linkState.lastStrikeAt = now;

  // First strike: delete message only (1s timeout). After that: fixed 5s timeout.
  const timeoutLen = isRepeatOffense ? 5 : 1;
  TWITCH_FUNCTIONS.timeoutEXP(twitchUsername, reason, timeoutLen, () => {
    if (!isRepeatOffense) {
      client.say(
        CHANNEL_NAME,
        `@${twitchUsername} No links allowed in chat.`
      );
    } else {
      client.say(CHANNEL_NAME, `@${twitchUsername} No links allowed in chat.`)
    }
  });
  return true;
}
