import fs from "fs";
import path from "path";
import fetch from "node-fetch";
import pg from "pg";
import {
  TWITCH_ROLES,
  getRoleAccessToken,
  getTokenStorePath,
  readTokenStore,
} from "./auth.js";

const { Pool } = pg;

function normalizeTwitchToken(value) {
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
  normalizeTwitchToken(TWITCH_BOT_STORE.access_token); // legacy/auth token used by non-Helix helpers
const BOT_OAUTH = BOT_TOKEN; // legacy alias retained
const COOKIE = process.env.COOKIE; // <--- change this to your cookie

const BOT_NAME = process.env.BOT_NAME || String(TWITCH_BOT_STORE.login || "").trim(); // bot username
const CHANNEL_NAME =
  process.env.CHANNEL_NAME ||
  String(TWITCH_STREAMER_STORE.login || "").trim(); // name of the channel for the bot to be in
const CHANNEL_ID =
  process.env.CHANNEL_ID ||
  String(TWITCH_STREAMER_STORE.user_id || "").trim(); // id of channel for the bot to be in
const BOT_ID = process.env.BOT_ID || String(TWITCH_BOT_STORE.user_id || "").trim();
const SPOTIFY_BOT_OAUTH = process.env.SPOTIFY_BOT_OAUTH;
const SPOTIFY_BOT_NAME = process.env.SPOTIFY_BOT_NAME;
const CLIENT_ID = String(
  process.env.CLIENT_ID ||
    process.env.TWITCH_CHAT_CLIENT_ID ||
    process.env.CHEEEZZ_BOT_CLIENT_ID ||
    process.env.MAINS_BOT_CLIENT_ID ||
    ""
).trim();
const CLIENT_SECRET = String(
  process.env.CLIENT_SECRET || process.env.TWITCH_CLIENT_SECRET || ""
).trim();
const MAINS_BOT_CLIENT_ID = process.env.MAINS_BOT_CLIENT_ID || CLIENT_ID;
const CHEEEZZ_BOT_CLIENT_ID = process.env.CHEEEZZ_BOT_CLIENT_ID || CLIENT_ID;
const APP_ACCESS_TOKEN = process.env.APP_ACCESS_TOKEN;
const STREAMER_TOKEN =
  process.env.STRAMER_TOKEN ||
  process.env.STREAMER_TOKEN ||
  normalizeTwitchToken(TWITCH_STREAMER_STORE.access_token);
const TWITCH_CHAT_USE_HELIX = /^(1|true|yes|on)$/i.test(
  String(process.env.TWITCH_CHAT_USE_HELIX ?? "true").trim()
);
const TWITCH_CHAT_ALLOW_IRC_FALLBACK = /^(1|true|yes|on)$/i.test(
  String(process.env.TWITCH_CHAT_ALLOW_IRC_FALLBACK ?? "true").trim()
);
const TWITCH_CHAT_REQUIRE_TOKEN_STORE = /^(1|true|yes|on)$/i.test(
  String(
    process.env.TWITCH_CHAT_REQUIRE_TOKEN_STORE ??
      (TWITCH_CHAT_USE_HELIX && !TWITCH_CHAT_ALLOW_IRC_FALLBACK ? "true" : "false")
  ).trim()
);
const TWITCH_CHAT_REQUIRE_BOT_SCOPES = /^(1|true|yes|on)$/i.test(
  String(
    process.env.TWITCH_CHAT_REQUIRE_BOT_SCOPES ??
      (TWITCH_CHAT_USE_HELIX && !TWITCH_CHAT_ALLOW_IRC_FALLBACK ? "true" : "false")
  ).trim()
);
const TWITCH_CHAT_REQUIRE_STREAMER_SCOPES = /^(1|true|yes|on)$/i.test(
  String(
    process.env.TWITCH_CHAT_REQUIRE_STREAMER_SCOPES ??
      (TWITCH_CHAT_USE_HELIX && !TWITCH_CHAT_ALLOW_IRC_FALLBACK ? "true" : "false")
  ).trim()
);
const TWITCH_CHAT_CLIENT_ID =
  String(TWITCH_BOT_STORE.client_id || "").trim() ||
  String(TWITCH_STREAMER_STORE.client_id || "").trim() ||
  CLIENT_ID;
const TWITCH_CHAT_TOKEN =
  process.env.TWITCH_CHAT_TOKEN ||
  BOT_TOKEN ||
  "";
const TWITCH_CHAT_SENDER_ID =
  process.env.TWITCH_CHAT_SENDER_ID || BOT_ID || "";
const TWITCH_CHAT_BROADCASTER_ID =
  process.env.TWITCH_CHAT_BROADCASTER_ID || CHANNEL_ID || "";
const TWITCH_CHAT_BROADCASTER_LOGIN =
  process.env.TWITCH_CHAT_BROADCASTER_LOGIN || CHANNEL_NAME || "";
const TWITCH_OAUTH_TOKEN_ENDPOINT = "https://id.twitch.tv/oauth2/token";
const TWITCH_CHAT_USE_APP_TOKEN = /^(1|true|yes|on)$/i.test(
  String(process.env.TWITCH_CHAT_USE_APP_TOKEN ?? "true").trim()
);
const APP_TOKEN_REFRESH_SKEW_MS = 120_000;
let helixAppTokenCache = {
  token: normalizeTwitchToken(process.env.APP_ACCESS_TOKEN || APP_ACCESS_TOKEN || ""),
  expiresAt: 0,
  clientId: String(CLIENT_ID || "").trim(),
};

const WAIT_REGISTER = 5 * 60 * 1000; // number of milliseconds, to wait before starting to get stream information

const COOLDOWN = process.env.COOLDOWN; // number of milliseconds, cool down for replying to people
const MESSAGE_MEMORY = process.env.MESSAGE_MEMORY; // number of milliseconds, until bot forgots message for spam filter

const MAX_MESSAGE_LENGTH = process.env.MAX_MESSAGE_LENGTH; // max number of characters until timeout
const BASE_LENGTH_TIMEOUT = process.env.BASE_LENGTH_TIMEOUT; // base timeout for using too many characters
const MAX_LENGTH_TIMEOUT = process.env.MAX_LENGTH_TIMEOUT; // max timeout for using too many characters

const BASE_SPAM_TIMEOUT = process.env.BASE_SPAM_TIMEOUT; // base timeout for spam, this would be for first time offenders
const MAX_SPAM_TIMEOUT = process.env.MAX_SPAM_TIMEOUT; // max timeout for spam, this stops the timeout length doubling infinitely for repeat offenders

const MINIMUM_CHARACTERS = process.env.MINIMUM_CHARACTERS; // [NOT IMPLEMENTED RN] minimum message length for bot to log message
const MAXIMUM_SIMILARITY = process.env.MAXIMUM_SIMILARITY; // percentage similarity of spam for timeout to happen
const MINIMUM_MESSAGE_COUNT = process.env.MINIMUM_MESSAGE_COUNT; // minimum number of messages for spam filter to start punishing

// timers
const WAIT_UNTIL_FOC_OFF = process.env.WAIT_UNTIL_FOC_OFF; // 2 minutes
const WAIT_UNTIL_FOC_OFF_RAID = process.env.WAIT_UNTIL_FOC_OFF_RAID; // every 5 minutes
const SPAM_LINK = process.env.SPAM_LINK; // every 5 minutes
const JOIN_TIMER = process.env.JOIN_TIMER; // every 2 minutes
let MUTATED_JOIN_TIMER = 120000; // timer that uses the JOIN_TIMER to change the interval based on viewer count

const SONG_TIMER = process.env.SONG_TIMER;

import { timeToAgo } from "../roblox/index.js";

function normalizeTwitchChannel(value) {
  return String(value || "").trim().replace(/^#/, "").toLowerCase();
}

function safeInvoke(callback, payload) {
  if (typeof callback !== "function") return;
  try {
    callback(payload);
  } catch {}
}

function normalizeScopes(scopes) {
  if (!Array.isArray(scopes)) return [];
  return scopes
    .map((s) => String(s || "").trim())
    .filter(Boolean);
}

function hasAllScopes(scopes, required) {
  const have = new Set(normalizeScopes(scopes).map((s) => s.toLowerCase()));
  return (required || []).every((s) => have.has(String(s || "").trim().toLowerCase()));
}

function getStaticAppAccessToken() {
  return normalizeTwitchToken(process.env.APP_ACCESS_TOKEN || APP_ACCESS_TOKEN || "");
}

function hasValidCachedAppToken(clientId = "") {
  const expectedClientId = String(clientId || "").trim();
  if (!helixAppTokenCache?.token) return false;
  if (!helixAppTokenCache?.expiresAt) return false;
  if (helixAppTokenCache.expiresAt <= Date.now()) return false;
  if (!expectedClientId) return true;
  return String(helixAppTokenCache.clientId || "").trim() === expectedClientId;
}

async function requestAppAccessToken({ clientId, clientSecret }) {
  const cid = String(clientId || "").trim();
  const csec = String(clientSecret || "").trim();
  if (!cid || !csec) {
    throw new Error("missing CLIENT_ID/CLIENT_SECRET for app token");
  }

  const body = new URLSearchParams();
  body.set("client_id", cid);
  body.set("client_secret", csec);
  body.set("grant_type", "client_credentials");

  const response = await fetch(TWITCH_OAUTH_TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body,
  });

  const payloadText = await response.text().catch(() => "");
  let payload = null;
  if (payloadText) {
    try {
      payload = JSON.parse(payloadText);
    } catch {}
  }

  if (!response.ok || !payload?.access_token) {
    const reason =
      payload?.message ||
      payload?.error_description ||
      payload?.error ||
      payloadText ||
      response.statusText ||
      "token_request_failed";
    throw new Error(`app token HTTP ${response.status}: ${reason}`);
  }

  const token = normalizeTwitchToken(payload.access_token);
  const expiresInSec = Math.max(0, Number(payload.expires_in || 0));
  const expiresAt = expiresInSec
    ? Date.now() + Math.max(0, expiresInSec * 1000 - APP_TOKEN_REFRESH_SKEW_MS)
    : Date.now() + 55 * 60 * 1000;

  helixAppTokenCache = {
    token,
    expiresAt,
    clientId: cid,
  };
  return token;
}

async function resolveHelixChatBearerToken(config) {
  if (config?.useAppToken) {
    const clientId = String(config?.clientId || "").trim();
    const staticAppToken = getStaticAppAccessToken();

    if (hasValidCachedAppToken(clientId)) {
      return { token: helixAppTokenCache.token, mode: "app_cached" };
    }

    if (clientId && config?.clientSecret) {
      try {
        const token = await requestAppAccessToken({
          clientId,
          clientSecret: config.clientSecret,
        });
        return { token, mode: "app_client_credentials" };
      } catch (e) {
        console.warn(
          `[TWITCH][HELIX_CHAT] app token fetch failed, falling back to user token: ${String(
            e?.message || e
          )}`
        );
      }
    }

    if (staticAppToken) {
      return { token: staticAppToken, mode: "app_static" };
    }
  }

  return { token: String(config?.token || "").trim(), mode: "user" };
}

export function parseRawPrivmsg(rawLine) {
  const payload = String(rawLine || "");
  const channelMatch = payload.match(/(?:^|\s)PRIVMSG\s+#([^\s]+)\s+:/i);
  const textMatch = payload.match(/(?:^|\s)PRIVMSG\s+#[^\s]+\s+:(.*)$/i);
  const replyParentMatch = payload.match(/reply-parent-msg-id=([^;\s]+)/i);

  return {
    channel: channelMatch ? channelMatch[1] : "",
    text: textMatch ? textMatch[1] : "",
    replyParentId: replyParentMatch ? replyParentMatch[1] : "",
  };
}

export function getHelixChatConfig(overrides = {}) {
  // Read token store per call so OAuth callback updates are picked up without restart.
  const runtimeStore = readTokenStore(getTokenStorePath());
  const runtimeBotStore =
    runtimeStore?.bot && typeof runtimeStore.bot === "object"
      ? runtimeStore.bot
      : {};
  const runtimeStreamerStore =
    runtimeStore?.streamer && typeof runtimeStore.streamer === "object"
      ? runtimeStore.streamer
      : {};

  const runtimeClientId =
    String(runtimeBotStore.client_id || "").trim() ||
    String(runtimeStreamerStore.client_id || "").trim();
  const runtimeToken = normalizeTwitchToken(runtimeBotStore.access_token || "");
  const runtimeBotScopes = normalizeScopes(runtimeBotStore.scopes || runtimeBotStore.scope || []);
  const runtimeStreamerScopes = normalizeScopes(runtimeStreamerStore.scopes || runtimeStreamerStore.scope || []);
  const runtimeSenderId = String(runtimeBotStore.user_id || "").trim();
  const runtimeBroadcasterId = String(runtimeStreamerStore.user_id || "").trim();
  const runtimeBroadcasterLogin = normalizeTwitchChannel(
    runtimeStreamerStore.login || ""
  );

  const requiredBotScopes = ["user:write:chat", "user:bot"];
  const requiredStreamerScopes = ["channel:bot"];
  const botScopesOk = hasAllScopes(runtimeBotScopes, requiredBotScopes);
  const streamerScopesOk = hasAllScopes(runtimeStreamerScopes, requiredStreamerScopes);

  const allowLegacyTokenFallback =
    !TWITCH_CHAT_REQUIRE_TOKEN_STORE &&
    /^(1|true|yes|on)$/i.test(String(process.env.TWITCH_CHAT_ALLOW_LEGACY_TOKENS ?? "true").trim());

  return {
    useHelix:
      typeof overrides.useHelix === "boolean"
        ? overrides.useHelix
        : TWITCH_CHAT_USE_HELIX,
    useAppToken:
      typeof overrides.useAppToken === "boolean"
        ? overrides.useAppToken
        : TWITCH_CHAT_USE_APP_TOKEN,
    clientId: String(
      overrides.clientId ||
        runtimeClientId ||
        process.env.CLIENT_ID ||
        process.env.TWITCH_CHAT_CLIENT_ID ||
        TWITCH_CHAT_CLIENT_ID
    ).trim(),
    clientSecret: String(
      overrides.clientSecret ||
        process.env.CLIENT_SECRET ||
        process.env.TWITCH_CLIENT_SECRET ||
        CLIENT_SECRET
    ).trim(),
    token: normalizeTwitchToken(
      overrides.token ||
        (TWITCH_CHAT_REQUIRE_TOKEN_STORE ? runtimeToken : runtimeToken || (allowLegacyTokenFallback ? (process.env.TWITCH_CHAT_TOKEN || TWITCH_CHAT_TOKEN) : "")) ||
        ""
    ),
    senderId: String(
      overrides.senderId ||
        runtimeSenderId ||
        process.env.TWITCH_CHAT_SENDER_ID ||
        TWITCH_CHAT_SENDER_ID
    ).trim(),
    broadcasterId: String(
      overrides.broadcasterId ||
        runtimeBroadcasterId ||
        process.env.TWITCH_CHAT_BROADCASTER_ID ||
        TWITCH_CHAT_BROADCASTER_ID
    ).trim(),
    broadcasterLogin: normalizeTwitchChannel(
      overrides.broadcasterLogin ||
        runtimeBroadcasterLogin ||
        process.env.TWITCH_CHAT_BROADCASTER_LOGIN ||
        TWITCH_CHAT_BROADCASTER_LOGIN
    ),
    requireTokenStore: TWITCH_CHAT_REQUIRE_TOKEN_STORE,
    requireBotScopes: TWITCH_CHAT_REQUIRE_BOT_SCOPES,
    requireStreamerScopes: TWITCH_CHAT_REQUIRE_STREAMER_SCOPES,
    botScopesOk,
    streamerScopesOk,
    missingBotScopes: botScopesOk ? [] : requiredBotScopes,
    missingStreamerScopes: streamerScopesOk ? [] : requiredStreamerScopes,
  };
}

function validateHelixChatConfig(config) {
  const missing = [];
  if (!config.useHelix) {
    missing.push("TWITCH_CHAT_USE_HELIX=false");
    return missing;
  }
  if (!config.clientId) missing.push("CLIENT_ID/TWITCH_CHAT_CLIENT_ID");
  if (config.useAppToken) {
    const hasStaticAppToken = Boolean(getStaticAppAccessToken());
    if (!config.clientSecret && !hasStaticAppToken) {
      missing.push("CLIENT_SECRET/TWITCH_CLIENT_SECRET or APP_ACCESS_TOKEN");
    }
    if (!config.token && !hasStaticAppToken && !config.clientSecret) {
      missing.push("TWITCH_CHAT_TOKEN or secrets/twitch_tokens.json");
    }
  } else if (!config.token) {
    missing.push("TWITCH_CHAT_TOKEN or secrets/twitch_tokens.json");
  }
  if (!config.senderId) missing.push("TWITCH_CHAT_SENDER_ID/BOT_ID");
  if (!config.broadcasterId) missing.push("TWITCH_CHAT_BROADCASTER_ID/CHANNEL_ID");
  if (config.requireTokenStore && !config.token) {
    missing.push("Link bot via /auth/twitch/bot (token store required)");
  }
  if (config.requireBotScopes && config.missingBotScopes?.length) {
    missing.push(`Bot missing scopes: ${config.missingBotScopes.join(", ")} (reauth /auth/twitch/bot)`);
  }
  if (config.requireStreamerScopes && config.missingStreamerScopes?.length) {
    missing.push(`Streamer missing scopes: ${config.missingStreamerScopes.join(", ")} (reauth /auth/twitch/streamer)`);
  }
  return missing;
}

export function getHelixChatDiagnostics({ configOverrides = {} } = {}) {
  const config = getHelixChatConfig(configOverrides);
  const missing = validateHelixChatConfig(config);
  return {
    useHelix: config.useHelix,
    useAppToken: Boolean(config.useAppToken),
    allowIrcFallback: TWITCH_CHAT_ALLOW_IRC_FALLBACK,
    requireTokenStore: config.requireTokenStore,
    requireBotScopes: config.requireBotScopes,
    requireStreamerScopes: config.requireStreamerScopes,
    clientIdPresent: Boolean(String(config.clientId || "").trim()),
    clientSecretPresent: Boolean(String(config.clientSecret || "").trim()),
    tokenPresent: Boolean(String(config.token || "").trim()),
    senderId: String(config.senderId || "").trim(),
    broadcasterId: String(config.broadcasterId || "").trim(),
    broadcasterLogin: String(config.broadcasterLogin || "").trim(),
    botScopesOk: Boolean(config.botScopesOk),
    streamerScopesOk: Boolean(config.streamerScopesOk),
    missingBotScopes: Array.isArray(config.missingBotScopes) ? config.missingBotScopes : [],
    missingStreamerScopes: Array.isArray(config.missingStreamerScopes) ? config.missingStreamerScopes : [],
    missingConfig: missing,
  };
}

function isChannelMatch(config, channelName) {
  const channel = normalizeTwitchChannel(channelName);
  if (!channel || !config.broadcasterLogin) return true;
  return channel === config.broadcasterLogin;
}

const helixMissingConfigByLabel = new Set();
const helixReadyByLabel = new Set();

export async function sendHelixChatMessage({
  channel = CHANNEL_NAME,
  message = "",
  replyParentId = "",
  source = "say",
  configOverrides = {},
  label = "tmi_client",
} = {}) {
  const text = String(message || "").replace(/[\r\n]+/g, " ").trim();
  if (!text) return null;

  const config = getHelixChatConfig(configOverrides);
  const missing = validateHelixChatConfig(config);
  if (missing.length > 0) {
    throw new Error(
      `[TWITCH][HELIX_CHAT] missing config: ${missing.join(", ")}`
    );
  }

  if (!isChannelMatch(config, channel)) {
    throw new Error(
      `channel mismatch (${normalizeTwitchChannel(channel)} != ${config.broadcasterLogin})`
    );
  }

  const body = {
    broadcaster_id: String(config.broadcasterId),
    sender_id: String(config.senderId),
    message: text,
  };

  const parentId = String(replyParentId || "").trim();
  if (parentId) {
    body.reply_parent_message_id = parentId;
  }

  const sendRequest = (bearerToken) =>
    fetch("https://api.twitch.tv/helix/chat/messages", {
      method: "POST",
      headers: {
        "Client-Id": config.clientId,
        Authorization: `Bearer ${bearerToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

  let auth = await resolveHelixChatBearerToken(config);
  if (!auth?.token) {
    throw new Error("missing bearer token for Helix chat");
  }

  let response = await sendRequest(auth.token);

  // If app-token auth fails, retry once with user token so chat still works.
  if (
    !response.ok &&
    [401, 403].includes(Number(response.status || 0)) &&
    auth.mode !== "user" &&
    config.token &&
    config.token !== auth.token
  ) {
    response = await sendRequest(config.token);
    auth = { token: config.token, mode: "user_fallback" };
  }

  const payloadText = await response.text().catch(() => "");
  let payload = null;
  if (payloadText) {
    try {
      payload = JSON.parse(payloadText);
    } catch {}
  }

  if (!response.ok) {
    throw new Error(
      `HTTP ${response.status} (${source}): ${payloadText || response.statusText || "request_failed"}`
    );
  }

  const result = payload?.data?.[0];
  if (result && result.is_sent === false) {
    const dropCode = String(result?.drop_reason?.code || "unknown_drop");
    const dropMessage = String(
      result?.drop_reason?.message || "message was rejected by Twitch"
    );
    throw new Error(`${dropCode}: ${dropMessage}`);
  }

  const readyKey = `${label}:${auth.mode}`;
  if (!helixReadyByLabel.has(readyKey)) {
    console.log(
      `[TWITCH][HELIX_CHAT] ${label} sending chat via Helix (${auth.mode}).`
    );
    helixReadyByLabel.add(readyKey);
  }

  return result || payload || null;
}

export function installHelixChatTransport({
  client,
  label = "tmi_client",
  channelName = CHANNEL_NAME,
  configOverrides = {},
  onSay,
  onAction,
  onRaw,
  onError,
  allowIrcFallback = true,
} = {}) {
  if (!client || typeof client.say !== "function") {
    throw new Error("installHelixChatTransport requires a valid tmi client");
  }

  const baseSay = client.say.bind(client);
  const baseAction = client.action?.bind(client);
  const baseRaw = client.raw?.bind(client);

  const warnMissingConfig = () => {
    const config = getHelixChatConfig(configOverrides);
    const missing = validateHelixChatConfig(config);
    if (!missing.length) return;
    if (helixMissingConfigByLabel.has(label)) return;
    console.warn(
      `[TWITCH][HELIX_CHAT] ${label} Helix send not ready (${allowIrcFallback ? "IRC fallback on" : "IRC fallback off"}); missing: ${missing.join(", ")}`
    );
    helixMissingConfigByLabel.add(label);
  };

  const fallbackSay = (channel, message, rest) => {
    if (!allowIrcFallback) return null;
    return baseSay(channel, message, ...(rest || []));
  };

  const fallbackAction = (channel, message, rest) => {
    if (!allowIrcFallback || typeof baseAction !== "function") return null;
    return baseAction(channel, message, ...(rest || []));
  };

  const fallbackRaw = (rawLine, rest) => {
    if (!allowIrcFallback || typeof baseRaw !== "function") return null;
    return baseRaw(rawLine, ...(rest || []));
  };

  client.say = async function patchedSay(channel, message, ...rest) {
    try {
      const result = await sendHelixChatMessage({
        channel: channel || channelName,
        message,
        source: "say",
        configOverrides,
        label,
      });
      safeInvoke(onSay, { channel: channel || channelName, message, via: "helix" });
      return result;
    } catch (e) {
      warnMissingConfig();
      safeInvoke(onError, { source: "say", error: e });
      const result = fallbackSay(channel, message, rest);
      safeInvoke(onSay, { channel: channel || channelName, message, via: "irc" });
      return result;
    }
  };

  if (typeof baseAction === "function") {
    client.action = async function patchedAction(channel, message, ...rest) {
      const actionText = String(message || "").trim();
      const helixMessage = actionText.toLowerCase().startsWith("/me ")
        ? actionText
        : `/me ${actionText}`;

      try {
        const result = await sendHelixChatMessage({
          channel: channel || channelName,
          message: helixMessage,
          source: "action",
          configOverrides,
          label,
        });
        safeInvoke(onAction, { channel: channel || channelName, message, via: "helix" });
        return result;
      } catch (e) {
        warnMissingConfig();
        safeInvoke(onError, { source: "action", error: e });
        const result = fallbackAction(channel, message, rest);
        safeInvoke(onAction, { channel: channel || channelName, message, via: "irc" });
        return result;
      }
    };
  }

  if (typeof baseRaw === "function") {
    client.raw = async function patchedRaw(rawLine, ...rest) {
      const parsed = parseRawPrivmsg(rawLine);
      if (!parsed.text) {
        return fallbackRaw(rawLine, rest);
      }

      try {
        const result = await sendHelixChatMessage({
          channel: parsed.channel || channelName,
          message: parsed.text,
          replyParentId: parsed.replyParentId,
          source: "raw",
          configOverrides,
          label,
        });
        safeInvoke(onRaw, { rawLine, parsed, via: "helix" });
        return result;
      } catch (e) {
        warnMissingConfig();
        safeInvoke(onError, { source: "raw", error: e, rawLine, parsed });
        const result = fallbackRaw(rawLine, rest);
        safeInvoke(onRaw, { rawLine, parsed, via: "irc" });
        return result;
      }
    };
  }

  return {
    restore() {
      client.say = baseSay;
      if (typeof baseAction === "function") {
        client.action = baseAction;
      }
      if (typeof baseRaw === "function") {
        client.raw = baseRaw;
      }
    },
  };
}

function normalizeTwitchLogin(value) {
  return String(value || "")
    .trim()
    .replace(/^@+/, "")
    .toLowerCase();
}

function safeJsonParse(text, fallback = null) {
  try {
    return JSON.parse(String(text ?? ""));
  } catch {
    return fallback;
  }
}

async function fetchHelixJson({ url, method = "GET", clientId, accessToken, body }) {
  const response = await fetch(url, {
    method,
    headers: {
      "Client-Id": clientId,
      Authorization: `Bearer ${accessToken}`,
      ...(body != null ? { "Content-Type": "application/json" } : {}),
    },
    body: body != null ? JSON.stringify(body) : undefined,
  });

  const text = await response.text().catch(() => "");
  const json = text ? safeJsonParse(text, null) : null;

  if (!response.ok) {
    const message =
      (json && (json.message || json.error)) ||
      text ||
      response.statusText ||
      "request_failed";
    throw new Error(`Helix HTTP ${response.status}: ${message}`);
  }

  return json;
}

async function resolveHelixModeratorAuth({ preferred = "auto", minTtlSec = 120 } = {}) {
  const pref = String(preferred || "auto").trim().toLowerCase();
  const order =
    pref === "bot"
      ? [TWITCH_ROLES.BOT, TWITCH_ROLES.STREAMER]
      : pref === "streamer"
        ? [TWITCH_ROLES.STREAMER, TWITCH_ROLES.BOT]
        : [TWITCH_ROLES.STREAMER, TWITCH_ROLES.BOT];

  for (const role of order) {
    const auth = await getRoleAccessToken({ role, minTtlSec }).catch(() => null);
    if (auth?.accessToken && auth?.clientId && auth?.userId) return auth;
  }

  return null;
}

function resolveBroadcasterId(auth) {
  const id = String(
    process.env.TWITCH_CHAT_BROADCASTER_ID || CHANNEL_ID || ""
  ).trim();
  if (id) return id;
  if (auth?.role === TWITCH_ROLES.STREAMER && auth?.userId) return String(auth.userId);
  return "";
}

export async function isUserModerator({ broadcasterId, userId, preferredRole = "streamer" } = {}) {
  const targetBroadcasterId = String(broadcasterId || "").trim();
  const targetUserId = String(userId || "").trim();
  if (!targetBroadcasterId || !targetUserId) return false;

  const auth = await resolveHelixModeratorAuth({ preferred: preferredRole });
  if (!auth?.accessToken || !auth?.clientId) return false;

  const url = new URL("https://api.twitch.tv/helix/moderation/moderators");
  url.searchParams.set("broadcaster_id", targetBroadcasterId);
  url.searchParams.set("user_id", targetUserId);

  const json = await fetchHelixJson({
    url: url.toString(),
    method: "GET",
    clientId: auth.clientId,
    accessToken: auth.accessToken,
  });

  return Array.isArray(json?.data) && json.data.length > 0;
}

export async function listChannelModerators({
  broadcasterId,
  preferredRole = "auto",
  limit = 500,
} = {}) {
  const targetBroadcasterId = String(broadcasterId || "").trim();
  if (!targetBroadcasterId) return [];

  const auth = await resolveHelixModeratorAuth({ preferred: preferredRole });
  if (!auth?.accessToken || !auth?.clientId) return [];

  const maxItems = Math.max(1, Math.min(2000, Number(limit) || 500));
  const out = [];
  let cursor = "";

  while (out.length < maxItems) {
    const url = new URL("https://api.twitch.tv/helix/moderation/moderators");
    url.searchParams.set("broadcaster_id", targetBroadcasterId);
    url.searchParams.set("first", "100");
    if (cursor) url.searchParams.set("after", cursor);

    const json = await fetchHelixJson({
      url: url.toString(),
      method: "GET",
      clientId: auth.clientId,
      accessToken: auth.accessToken,
    });

    const page = Array.isArray(json?.data) ? json.data : [];
    for (const row of page) {
      const userId = String(row?.user_id || "").trim();
      const login = normalizeTwitchLogin(row?.user_login || "");
      if (!userId && !login) continue;
      out.push({ userId, login });
      if (out.length >= maxItems) break;
    }

    cursor = String(json?.pagination?.cursor || "").trim();
    if (!cursor || page.length === 0) break;
  }

  const dedup = new Map();
  for (const row of out) {
    const key = row.userId ? `id:${row.userId}` : `login:${row.login}`;
    if (!dedup.has(key)) dedup.set(key, row);
  }
  return Array.from(dedup.values());
}

const helixUserIdCache = new Map();
const HELIX_USER_ID_TTL_MS = 60 * 60 * 1000;

async function getHelixUserIdByLogin({ login, auth, preferredRole } = {}) {
  const normalized = normalizeTwitchLogin(login);
  if (!normalized) return null;

  const cached = helixUserIdCache.get(normalized);
  if (cached && cached.expiresAt > Date.now() && cached.userId) {
    return cached.userId;
  }

  const resolvedAuth =
    auth || (await resolveHelixModeratorAuth({ preferred: preferredRole }));
  if (!resolvedAuth) {
    throw new Error("Missing Twitch OAuth token (bot/streamer) for Helix request");
  }

  const url = `https://api.twitch.tv/helix/users?login=${encodeURIComponent(normalized)}`;
  const json = await fetchHelixJson({
    url,
    method: "GET",
    clientId: resolvedAuth.clientId,
    accessToken: resolvedAuth.accessToken,
  });

  const userId = String(json?.data?.[0]?.id || "").trim() || null;
  helixUserIdCache.set(normalized, { userId, expiresAt: Date.now() + HELIX_USER_ID_TTL_MS });
  return userId;
}

export async function updateChatSettings(patch = {}, { preferredRole = "auto" } = {}) {
  const auth = await resolveHelixModeratorAuth({ preferred: preferredRole });
  if (!auth) {
    throw new Error(
      "Missing Twitch OAuth token (need bot+moderator or streamer token)"
    );
  }

  const broadcasterId = resolveBroadcasterId(auth);
  if (!broadcasterId) {
    throw new Error("Missing broadcaster id (set CHANNEL_ID/TWITCH_CHAT_BROADCASTER_ID)");
  }

  const moderatorId = String(auth.userId || "").trim();
  if (!moderatorId) {
    throw new Error("Missing moderator user id in token store");
  }

  const url = new URL("https://api.twitch.tv/helix/chat/settings");
  url.searchParams.set("broadcaster_id", broadcasterId);
  url.searchParams.set("moderator_id", moderatorId);

  return fetchHelixJson({
    url: url.toString(),
    method: "PATCH",
    clientId: auth.clientId,
    accessToken: auth.accessToken,
    body: patch,
  });
}

export async function setFollowersOnlyMode(enabled, durationMinutes = 0, options = {}) {
  return updateChatSettings(
    enabled
      ? {
          follower_mode: true,
          follower_mode_duration: Math.max(0, Number(durationMinutes) || 0),
        }
      : { follower_mode: false },
    options
  );
}

export async function setSlowMode(enabled, waitSeconds = 0, options = {}) {
  return updateChatSettings(
    enabled
      ? {
          slow_mode: true,
          slow_mode_wait_time: Math.max(0, Number(waitSeconds) || 0),
        }
      : { slow_mode: false },
    options
  );
}

export async function setSubscriberMode(enabled, options = {}) {
  return updateChatSettings(
    enabled ? { subscriber_mode: true } : { subscriber_mode: false },
    options
  );
}

export async function setEmoteMode(enabled, options = {}) {
  return updateChatSettings(
    enabled ? { emote_mode: true } : { emote_mode: false },
    options
  );
}

export async function sendHelixAnnouncement(
  message,
  {
    color = "primary",
    preferredRole = "auto",
    fallbackToChat = true,
    channel = CHANNEL_NAME,
  } = {}
) {
  const text = String(message || "").replace(/[\r\n]+/g, " ").trim();
  if (!text) return null;

  const auth = await resolveHelixModeratorAuth({ preferred: preferredRole });
  if (!auth) {
    throw new Error(
      "Missing Twitch OAuth token (need bot+moderator or streamer token)"
    );
  }

  const broadcasterId = resolveBroadcasterId(auth);
  if (!broadcasterId) {
    throw new Error("Missing broadcaster id (set CHANNEL_ID/TWITCH_CHAT_BROADCASTER_ID)");
  }

  const moderatorId = String(auth.userId || "").trim();
  if (!moderatorId) {
    throw new Error("Missing moderator user id in token store");
  }

  const url = new URL("https://api.twitch.tv/helix/chat/announcements");
  url.searchParams.set("broadcaster_id", broadcasterId);
  url.searchParams.set("moderator_id", moderatorId);

  const body = { message: text };
  const normalizedColor = String(color || "").trim().toLowerCase();
  if (normalizedColor) {
    body.color = normalizedColor;
  }

  try {
    return await fetchHelixJson({
      url: url.toString(),
      method: "POST",
      clientId: auth.clientId,
      accessToken: auth.accessToken,
      body,
    });
  } catch (e) {
    if (!fallbackToChat) throw e;
    return sendHelixChatMessage({
      channel,
      message: text,
      source: "announce_fallback",
      label: "helix_announcement_fallback",
    });
  }
}

export async function timeoutUserByLogin(
  targetLogin,
  durationSeconds = 60,
  reason = "",
  { preferredRole = "auto" } = {}
) {
  const auth = await resolveHelixModeratorAuth({ preferred: preferredRole });
  if (!auth) {
    throw new Error(
      "Missing Twitch OAuth token (need bot+moderator or streamer token)"
    );
  }

  const broadcasterId = resolveBroadcasterId(auth);
  if (!broadcasterId) {
    throw new Error("Missing broadcaster id (set CHANNEL_ID/TWITCH_CHAT_BROADCASTER_ID)");
  }

  const moderatorId = String(auth.userId || "").trim();
  if (!moderatorId) {
    throw new Error("Missing moderator user id in token store");
  }

  const targetUserId = await getHelixUserIdByLogin({
    login: targetLogin,
    auth,
    preferredRole,
  });
  if (!targetUserId) {
    throw new Error(`Unknown Twitch user: ${targetLogin}`);
  }

  const url = new URL("https://api.twitch.tv/helix/moderation/bans");
  url.searchParams.set("broadcaster_id", broadcasterId);
  url.searchParams.set("moderator_id", moderatorId);

  const duration = Math.max(1, Math.floor(Number(durationSeconds) || 0));
  const reasonText = String(reason || "").replace(/[\r\n]+/g, " ").trim().slice(0, 500);

  return fetchHelixJson({
    url: url.toString(),
    method: "POST",
    clientId: auth.clientId,
    accessToken: auth.accessToken,
    body: {
      data: {
        user_id: targetUserId,
        duration,
        ...(reasonText ? { reason: reasonText } : {}),
      },
    },
  });
}

export const getChatroomStatus = async () => {
  const r = await fetch("https://gql.twitch.tv/gql#origin=twilight", {
    headers: {
      "Client-Id": "kimne78kx3ncx6brgo4mv6wki5h1ko",
      Authorization: `OAuth ${BOT_OAUTH}`,
    },
    body: `[{\"operationName\":\"ChatRoomState\",\"variables\":{\"login\":\"${BOT_NAME}\"},\"extensions\":{\"persistedQuery\":{\"version\":1,\"sha256Hash\":\"04cc4f104a120ea0d9f9d69be8791233f2188adf944406783f0c3a3e71aff8d2\"}}}]`,
    method: "POST",
  });
  const json = r.json();
  const states = json.then((json) => {
    return json.channel;
  });
};

export const isLive = async () => {
  const r = await fetch("https://gql.twitch.tv/gql", {
    headers: {
      authorization: `OAuth ${BOT_OAUTH}`,
      "client-id": "kimne78kx3ncx6brgo4mv6wki5h1ko",
    },
    body: `[{"operationName":"VideoPlayerStreamInfoOverlayChannel","variables":{"channel":"${CHANNEL_NAME}"},"extensions":{"persistedQuery":{"version":1,"sha256Hash":"a5f2e34d626a9f4f5c0204f910bab2194948a9502089be558bb6e779a9e1b3d2"}}}]`,
    method: "POST",
  });

  const json = await r.json().then((d) => {
    return d[0].data.user.stream;
  });
  const isLive = (() => {
    if (json == null) {
      return false;
    } else if (json != null) {
      return true;
    }
  })();
  return isLive;
};

export const getTwitchUsernameFromUserId = async (userid) => {
  const id = String(userid || "").trim();
  if (!id) return false;

  try {
    const auth = await resolveHelixModeratorAuth({ preferred: "auto" });
    if (!auth) return false;

    const json = await fetchHelixJson({
      url: `https://api.twitch.tv/helix/users?id=${encodeURIComponent(id)}`,
      method: "GET",
      clientId: auth.clientId,
      accessToken: auth.accessToken,
    });

    if (Array.isArray(json?.data) && json.data.length) {
      return json.data[0];
    }

    return false;
  } catch {
    return false;
  }
};

export const getTwitchIdFromUsername = async (username) => {
  try {
    const userId = await getHelixUserIdByLogin({
      login: username,
      preferredRole: "auto",
    });
    return userId || null;
  } catch {
    return null;
  }
};

export const timeoutUser = async (target, reason = null, duration) => {
  if (reason != null) {
    reason = '"' + reason + '"';
  }
  const weeks = Math.floor(duration / (60 * 60 * 24 * 7));
  const days = Math.floor(
    (duration - weeks * 60 * 60 * 24 * 7) / (60 * 60 * 24)
  );
  const hours = Math.floor(
    (duration - weeks * 60 * 60 * 24 * 7 - days * 60 * 60 * 24) / (60 * 60)
  );
  const minutes = Math.floor(
    (duration -
      weeks * 60 * 60 * 24 * 7 -
      days * 60 * 60 * 24 -
      hours * 60 * 60) /
      60
  );
  const seconds = Math.floor(
    duration -
      weeks * 60 * 60 * 24 * 7 -
      days * 60 * 60 * 24 -
      hours * 60 * 60 -
      minutes * 60
  );

  const formatted = {
    weeks: [weeks, "w"],
    days: [days, "d"],
    hours: [hours, "h"],
    minutes: [minutes, "m"],
    seconds: [seconds, "s"],
  };
  var formattedDuration = "";

  for (const key in formatted) {
    if (formatted[key][0] == 0) {
      delete formatted[key];
    } else {
      formattedDuration += formatted[key][0] + formatted[key][1];
    }
  }

  const r = await fetch("https://gql.twitch.tv/gql#origin=twilight", {
    headers: {
      "Client-Id": "kimne78kx3ncx6brgo4mv6wki5h1ko",
      Authorization: `OAuth ${BOT_OAUTH}`,
    },
    body: `[{\"operationName\":\"Chat_BanUserFromChatRoom\",\"variables\":{\"input\":{\"channelID\":\"${CHANNEL_ID}\",\"bannedUserLogin\":\"${target}\",\"expiresIn\":\"${formattedDuration}\",\"reason\":${reason}}},\"extensions\":{\"persistedQuery\":{\"version\":1,\"sha256Hash\":\"d7be2d2e1e22813c1c2f3d9d5bf7e425d815aeb09e14001a5f2c140b93f6fb67\"}}}]`,
    method: "POST",
  });

  const isOk = await r.ok;

  return isOk;
};

export function timeoutEXP(target, reason = null, duration, cb) {
  if (reason != null) {
    reason = '"' + reason + '"';
  }
  const weeks = Math.floor(duration / (60 * 60 * 24 * 7));
  const days = Math.floor(
    (duration - weeks * 60 * 60 * 24 * 7) / (60 * 60 * 24)
  );
  const hours = Math.floor(
    (duration - weeks * 60 * 60 * 24 * 7 - days * 60 * 60 * 24) / (60 * 60)
  );
  const minutes = Math.floor(
    (duration -
      weeks * 60 * 60 * 24 * 7 -
      days * 60 * 60 * 24 -
      hours * 60 * 60) /
      60
  );
  const seconds = Math.floor(
    duration -
      weeks * 60 * 60 * 24 * 7 -
      days * 60 * 60 * 24 -
      hours * 60 * 60 -
      minutes * 60
  );

  const formatted = {
    weeks: [weeks, "w"],
    days: [days, "d"],
    hours: [hours, "h"],
    minutes: [minutes, "m"],
    seconds: [seconds, "s"],
  };
  var formattedDuration = "";

  for (const key in formatted) {
    if (formatted[key][0] == 0) {
      delete formatted[key];
    } else {
      formattedDuration += formatted[key][0] + formatted[key][1];
    }
  }

  fetch("https://gql.twitch.tv/gql#origin=twilight", {
    headers: {
      "Client-Id": "kimne78kx3ncx6brgo4mv6wki5h1ko",
      Authorization: `OAuth ${BOT_OAUTH}`,
    },
    body: `[{\"operationName\":\"Chat_BanUserFromChatRoom\",\"variables\":{\"input\":{\"channelID\":\"${CHANNEL_ID}\",\"bannedUserLogin\":\"${target}\",\"expiresIn\":\"${formattedDuration}\",\"reason\":${reason}}},\"extensions\":{\"persistedQuery\":{\"version\":1,\"sha256Hash\":\"d7be2d2e1e22813c1c2f3d9d5bf7e425d815aeb09e14001a5f2c140b93f6fb67\"}}}]`,
    method: "POST",
  })
    .then((r) => {
      return r.json();
    })
    .then((json) => {
      cb(json[0].errors == null);
    });
}

const scuffedSystem = [];

export function scuffedTimeout(target, reason = null, duration, test = null) {
  if (test != null) {
    scuffedSystem.splice(scuffedSystem.indexOf(target), 1);
  } else if (scuffedSystem.includes(target) != null) {
    scuffedSystem.push(target);
    if (reason != null) {
      reason = '"' + reason + '"';
    }
    const weeks = Math.floor(duration / (60 * 60 * 24 * 7));
    const days = Math.floor(
      (duration - weeks * 60 * 60 * 24 * 7) / (60 * 60 * 24)
    );
    const hours = Math.floor(
      (duration - weeks * 60 * 60 * 24 * 7 - days * 60 * 60 * 24) / (60 * 60)
    );
    const minutes = Math.floor(
      (duration -
        weeks * 60 * 60 * 24 * 7 -
        days * 60 * 60 * 24 -
        hours * 60 * 60) /
        60
    );
    const seconds = Math.floor(
      duration -
        weeks * 60 * 60 * 24 * 7 -
        days * 60 * 60 * 24 -
        hours * 60 * 60 -
        minutes * 60
    );

    const formatted = {
      weeks: [weeks, "w"],
      days: [days, "d"],
      hours: [hours, "h"],
      minutes: [minutes, "m"],
      seconds: [seconds, "s"],
    };
    var formattedDuration = "";

    for (const key in formatted) {
      if (formatted[key][0] == 0) {
        delete formatted[key];
      } else {
        formattedDuration += formatted[key][0] + formatted[key][1];
      }
    }

    fetch("https://gql.twitch.tv/gql#origin=twilight", {
      headers: {
        "Client-Id": "kimne78kx3ncx6brgo4mv6wki5h1ko",
        Authorization: `OAuth ${BOT_OAUTH}`,
      },
      body: `[{\"operationName\":\"Chat_BanUserFromChatRoom\",\"variables\":{\"input\":{\"channelID\":\"${CHANNEL_ID}\",\"bannedUserLogin\":\"${target}\",\"expiresIn\":\"${formattedDuration}\",\"reason\":${reason}}},\"extensions\":{\"persistedQuery\":{\"version\":1,\"sha256Hash\":\"d7be2d2e1e22813c1c2f3d9d5bf7e425d815aeb09e14001a5f2c140b93f6fb67\"}}}]`,
      method: "POST",
    });
  }
}

export async function onMultiplayerAdStart() {
  var colours = ["BLUE", "PURPLE", "GREEN"];
  var randomColour = colours[Math.floor(Math.random() * colours.length)];

  fetch("https://gql.twitch.tv/gql", {
    headers: {
      authorization: `OAuth ${BOT_OAUTH}`,
      "client-id": "kimne78kx3ncx6brgo4mv6wki5h1ko",
    },
    body: `[{"operationName":"SendAnnouncementMessage","variables":{"input":{"channelID":"${CHANNEL_ID}","message":"VOTE IN THE MULTIPLAYER AD PogU EZY","color":"${randomColour}"}},"extensions":{"persistedQuery":{"version":1,"sha256Hash":"f9e37b572ceaca1475d8d50805ae64d6eb388faf758556b2719f44d64e5ba791"}}}]`,
    method: "POST",
  });
}

export async function makeAnnouncement(message) {
  var colours = ["BLUE", "PURPLE", "GREEN"];
  var randomColour = colours[Math.floor(Math.random() * colours.length)];

  fetch("https://gql.twitch.tv/gql", {
    headers: {
      authorization: `OAuth ${BOT_OAUTH}`,
      "client-id": "kimne78kx3ncx6brgo4mv6wki5h1ko",
    },
    body: `[{"operationName":"SendAnnouncementMessage","variables":{"input":{"channelID":"${CHANNEL_ID}","message":"${message}","color":"${randomColour}"}},"extensions":{"persistedQuery":{"version":1,"sha256Hash":"f9e37b572ceaca1475d8d50805ae64d6eb388faf758556b2719f44d64e5ba791"}}}]`,
    method: "POST",
  });
}

export const getCurrentPollId = async () => {
  let r = await fetch(
    `https://api.twitch.tv/helix/polls?broadcaster_id=${CHANNEL_ID}`,
    {
      headers: {
        "Client-Id": CHEEEZZ_BOT_CLIENT_ID,
        Authorization: "Bearer " + STREAMER_TOKEN,
      },
    }
  );

  let json = await r.json().then((r) => {
    return r.data[0].id;
  });

  return json;
};

export async function deleteCurrentPoll() {
  const currentPollId = await getCurrentPollId();

  fetch("https://gql.twitch.tv/gql#origin=twilight", {
    headers: {
      "Client-Id": "kimne78kx3ncx6brgo4mv6wki5h1ko",
      Authorization: `OAuth ${BOT_OAUTH}`,
    },
    body: `[{\"operationName\":\"ArchivePoll\",\"variables\":{\"input\":{\"pollID\":\"${currentPollId}\"}},\"extensions\":{\"persistedQuery\":{\"version\":1,\"sha256Hash\":\"444ead3d68d94601cb66519e36c9f6c6fd9ba8b827a4299b8ed3604e57918d92\"}}}]`,
    method: "POST",
  });
}

export async function endCurrentPoll() {
  const currentPollId = await getCurrentPollId();

  fetch("https://gql.twitch.tv/gql#origin=twilight", {
    headers: {
      "Client-Id": "kimne78kx3ncx6brgo4mv6wki5h1ko",
      Authorization: `OAuth ${BOT_OAUTH}`,
    },
    body: `[{\"operationName\":\"TerminatePoll\",\"variables\":{\"input\":{\"pollID\":\"${currentPollId}\"}},\"extensions\":{\"persistedQuery\":{\"version\":1,\"sha256Hash\":\"2701ef0594dae5f532ce68e58cc3036a6d020755eef49927f98c14017fd819b2\"}}}]`,
    method: "POST",
  });
}

export async function onMultiplayerAdEnd(adData) {
  var RandomChants = [
    `+${adData.rewards[0].current_total * 0.01} BUCC EZY Clap`,
    `Thanks for voting in the multiplayer ad peepoLove +${
      adData.rewards[0].current_total * 0.01
    } BUCC PogU`,
    `EZY +${adData.rewards[0].current_total * 0.01} cold hard US dollars.`,
    `EZY PogU +${adData.rewards[0].current_total} cents.`,
    `+${adData.rewards[0].current_total * 0.01 * 1.25} Canadian monies PogU`,
  ];
  var chantmessage =
    RandomChants[Math.floor(Math.random() * RandomChants.length)];
}

export const isFollowing = async (userId) => {
  const r = await fetch(
    `https://api.twitch.tv/helix/users/follows?from_id=${userId}&to_id=197407231`,
    {
      headers: {
        authorization: `Bearer ${APP_ACCESS_TOKEN}`,
        "client-id": "uc561ftzndbzse3u8pspb5kjxtid9v",
        "Content-Type": "application/json",
      },
    }
  );
  const json = await r.json();
  if (json.total == 0) {
    return false;
  }
  return true;
};

export const getFollowers = async (userId) => {
  let followers = [];
  let r = await fetch(
    `https://api.twitch.tv/helix/users/follows?to_id=${userId}&first=100`,
    {
      headers: {
        authorization: `Bearer ${APP_ACCESS_TOKEN}`,
        "client-id": "uc561ftzndbzse3u8pspb5kjxtid9v",
        "Content-Type": "application/json",
      },
    }
  );
  let json = await r.json();

  let cursor = json.pagination.cursor;

  while (cursor != null) {
    r = await fetch(
      `https://api.twitch.tv/helix/users/follows?to_id=${userId}&first=100&after=${cursor}`,
      {
        headers: {
          "Client-Id": CHEEEZZ_BOT_CLIENT_ID,
          Authorization: "Bearer " + STREAMER_TOKEN,
        },
      }
    );

    json = await r.json();

    if (Object.keys(json.pagination).length != 0 && json.data.length != 0) {
      cursor = json.pagination.cursor;
      followers = followers.concat(json.data);
      console.log("working");
    } else {
      //fs.writeFileSync("./PREDICTIONDATA.json", JSON.stringify(allPredictions,null,2));
      console.log(followers.length);
      console.log(JSON.stringify(followers, null, 2));
      break;
    }
  }
  return followers;
};

export const followAge = async (userId) => {
  const r = await fetch(
    `https://api.twitch.tv/helix/users/follows?from_id=${userId}&to_id=197407231`,
    {
      headers: {
        authorization: `Bearer ${process.env.APP_ACCESS_TOKEN}`,
        "client-id": "uc561ftzndbzse3u8pspb5kjxtid9v",
        "Content-Type": "application/json",
      },
    }
  );
  const json = await r.json();
  if (json.total == 0) {
    return null;
  }
  const timeDifference =
    (new Date(new Date().toISOString()).getTime() -
      new Date(json.data[0].followed_at).getTime()) /
    (1000 * 60 * 60 * 24 * 365);

  const followAge = timeToAgo(timeDifference).timeString;

  return followAge;
};

export const getAppAccessToken = async () => {
  const r = await fetch(
    `https://id.twitch.tv/oauth2/token?client_id=${encodeURIComponent(
      CLIENT_ID || MAINS_BOT_CLIENT_ID
    )}&client_secret=${encodeURIComponent(CLIENT_SECRET)}&grant_type=client_credentials`,
    {
      method: "POST",
    }
  );
  const json = await r.json();
  return json;
};

export const getPredictionData = async () => {
  let allPredictions = [];

  let r = await fetch(
    `https://api.twitch.tv/helix/predictions?broadcaster_id=${CHANNEL_ID}`,
    {
      headers: {
        "Client-Id": CHEEEZZ_BOT_CLIENT_ID,
        Authorization: "Bearer " + STREAMER_TOKEN,
      },
    }
  );

  let json = await r.json();

  let cursor = json.pagination.cursor;

  while (cursor != null) {
    r = await fetch(
      `https://api.twitch.tv/helix/predictions?broadcaster_id=${CHANNEL_ID}&after=${cursor}`,
      {
        headers: {
          "Client-Id": CHEEEZZ_BOT_CLIENT_ID,
          Authorization: "Bearer " + STREAMER_TOKEN,
        },
      }
    );

    json = await r.json();

    if (Object.keys(json.pagination).length != 0 && json.data.length != 0) {
      cursor = json.pagination.cursor;
      allPredictions = allPredictions.concat(json.data);
    } else {
      fs.writeFileSync(
        "./PREDICTIONDATA.json",
        JSON.stringify(allPredictions, null, 2)
      );
      return allPredictions;
    }
  }

  // while (true){
  //   r = await fetch(`https://api.twitch.tv/helix/predictions?broadcaster_id=${CHANNEL_ID}&after=${cursor}`, {
  //     headers: {
  //       'Client-Id': CHEEEZZ_BOT_CLIENT_ID,
  //       'Authorization': 'Bearer '+STREAMER_TOKEN
  //     },
  //   })

  //   json = await r.json()

  //   if (Object.keys(json.pagination).length != 0 && json.data.length != 0){
  //     cursor = json.pagination.cursor
  //     allPredictions = allPredictions.concat(json.data)
  //   }else{
  //     fs.writeFileSync("./PREDICTIONDATA.json", JSON.stringify(allPredictions,null,2));
  //     return allPredictions
  //   }
  // }
};
function ensureParentDir(filePath) {
  if (!filePath) return;
  const dir = path.dirname(filePath);
  if (!dir || dir === "." || dir === filePath) return;
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readJsonOrDefault(filePath, fallback) {
  if (!filePath) return fallback;
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

const POLLDATA_PATH = String(process.env.POLLDATA_PATH || "./POLLDATA.json");
ensureParentDir(POLLDATA_PATH);
let POLLDATA = readJsonOrDefault(POLLDATA_PATH, {});

export const getLatestPollData = async () => {
  const r = await fetch("https://gql.twitch.tv/gql#origin=twilight", {
    headers: {
      "Client-Id": "kimne78kx3ncx6brgo4mv6wki5h1ko",
      Authorization: "OAuth " + BOT_OAUTH,
    },
    body: `[{\"operationName\":\"AdminPollsPage\",\"variables\":{\"login\":\"${CHANNEL_NAME}\"},\"extensions\":{\"persistedQuery\":{\"version\":1,\"sha256Hash\":\"58b2740296aad07f9b75fdf069f61a79b305f4d6b93c3764be533d76532b37fa\"}}}]`,
    method: "POST",
  });

  let json = await r.json();

  json = json?.[0]?.data?.channel?.latestPoll;
  if (!json) return "error";

  const dataBreakdown = async (choiceId) => {
    let r = await fetch(`https://gql.twitch.tv/gql`, {
      headers: {
        "client-id": "kimne78kx3ncx6brgo4mv6wki5h1ko",
        authorization: "OAuth " + BOT_OAUTH,
      },
      body: `[{\"operationName\":\"ChoiceBreakdown\",\"variables\":{\"login\":\"${CHANNEL_NAME}\",\"choiceID\":\"${choiceId}\",\"sort\":\"CHANNEL_POINTS\",\"id\":\"123\"},\"extensions\":{\"persistedQuery\":{\"version\":1,\"sha256Hash\":\"7451688887b68798527dbaa222b4408e456adf5283063bfae8f02db2289deee0\"}}}]`,
      method: "POST",
    });

    let json = await r.json();

    json = json[0].data.channel;

    return json;
  };

  const choices = json.choices;
  const archives = json.status;
  const title = json.title;
  const id = json.id;
  const duration = json.durationSeconds;
  const startedAt = json.startedAt;
  const endedAt = json.endedAt;
  const totalCp = json.tokens.communityPoints;
  const totalBits = json.tokens.bits;
  const totalVoters = json.totalVoters;
  const totalVotes = json.votes.total;

  const settings = json.settings;

  const bitVoteEnabled = settings.bitsVotes.isEnabled;

  const bitVoteCost = settings.bitsVotes.cost;

  const cpVoteEnabled = settings.communityPointsVotes.isEnabled;
  const cpVoteCost = settings.communityPointsVotes.cost;

  const multiChoiceEnabled = settings.multichoice.isEnabled;

  const dataArray = {};

  dataArray["id"] = id;
  dataArray["status"] = archives;
  dataArray["totalCp"] = totalCp;
  dataArray["duration"] = duration;
  dataArray["startedAt"] = startedAt;
  dataArray["endedAt"] = endedAt;
  dataArray["title"] = title;
  dataArray["totalBits"] = totalBits;
  dataArray["totalVoters"] = totalVoters;
  dataArray["totalVotes"] = totalVotes;
  dataArray["boughtVotes"] = totalVotes - totalVoters;
  dataArray["cpVote"] = cpVoteCost;
  dataArray["bitVote"] = bitVoteCost;
  dataArray["cpVoteEnabled"] = cpVoteEnabled;
  dataArray["bitVoteEnabled"] = bitVoteEnabled;
  dataArray["choices"] = choices;
  dataArray["multichoice"] = multiChoiceEnabled;
  dataArray["userNodes"] = [];
  // console.log(choices)
  


  for (let i = 0; i < choices.length; i++) {
    const choice = choices[i];
    const choiceId = choice.id;

    const data = await dataBreakdown(choiceId);
    
    const voters = data?.latestPoll?.choice?.voters?.nodes || [];

    for (const voter of voters) {
      if (voter?.node) dataArray["userNodes"].push(voter.node);
    }
  }

  // De-dupe users across choice breakdowns (same user can appear in multiple lists).
  const dedupedNodes = new Map();
  for (const node of dataArray["userNodes"]) {
    const userId = node?.user?.id;
    if (!userId) continue;
    const existing = dedupedNodes.get(userId);
    if (!existing) {
      dedupedNodes.set(userId, node);
      continue;
    }
    if (Array.isArray(existing.choices) && Array.isArray(node.choices)) {
      existing.choices = existing.choices.concat(node.choices);
    }
  }
  dataArray["userNodes"] = Array.from(dedupedNodes.values());

  POLLDATA[id] = dataArray;
  fs.writeFileSync(POLLDATA_PATH, JSON.stringify(POLLDATA, null, 1));
  POLLDATA = readJsonOrDefault(POLLDATA_PATH, {});
  return dataArray;
};

export const getPollData = async () => {
  let allPolls = []

  const dataBreakdown = async (choiceId) => {
    let r = await fetch(`https://gql.twitch.tv/gql`, {
      headers: {
        'client-id': 'kimne78kx3ncx6brgo4mv6wki5h1ko',
        'authorization': 'OAuth '+BOT_OAUTH
      },
     body: `[{\"operationName\":\"ChoiceBreakdown\",\"variables\":{\"login\":\"${CHANNEL_NAME}\",\"choiceID\":\"${choiceId}\",\"sort\":\"CHANNEL_POINTS\",\"id\":\"123\"},\"extensions\":{\"persistedQuery\":{\"version\":1,\"sha256Hash\":\"7451688887b68798527dbaa222b4408e456adf5283063bfae8f02db2289deee0\"}}}]`,
      method: 'POST'
    })

    let json = await r.json()

    json = json[0].data.channel

    console.log(json)

    return json

  }

  let r = await fetch(`https://api.twitch.tv/helix/polls?broadcaster_id=${CHANNEL_ID}`, {
    headers: {
      'Client-Id': CHEEEZZ_BOT_CLIENT_ID,
      'Authorization': 'Bearer '+STREAMER_TOKEN
    },
  })

  let json = await r.json()

  let data = json.data

  data.forEach(async function(poll){
    const pollId = poll.id
    const choices = poll.choices
    const title = poll.title

    const bits_per_vote = poll.bits_per_vote
    const channel_points_voting_enabled = poll.channel_points_voting_enabled
    const channel_points_per_vote = poll.channel_points_per_vote

    const duration = poll .duration

    choices.forEach(async function(choice){
      const choiceId = choice.id

      if (choice.votes == 0){
        return
      }

      const data = await dataBreakdown(choiceId)
    })

  })

  let cursor = json.pagination.cursor

  while (cursor != null) {
    r = await fetch(`https://api.twitch.tv/helix/polls?broadcaster_id=${CHANNEL_ID}&after=${cursor}`, {
      headers: {
        'Client-Id': CHEEEZZ_BOT_CLIENT_ID,
        'Authorization': 'Bearer '+STREAMER_TOKEN
      },
    })

    json = await r.json()
    if (Object.keys(json.pagination).length != 0 && json.data.length != 0){
      cursor = json.pagination.cursor
      allPolls = allPolls.concat(json.data)
    }else{
      cursor = null
      fs.writeFileSync(POLLDATA_PATH, JSON.stringify(allPolls,null,2));
      return allPolls
    }

  }

}

export const getSubStatus = async (userId) => {
  const r = await fetch(
    `https://api.twitch.tv/helix/subscriptions?broadcaster_id=${CHANNEL_ID}&user_id=${userId}`,
    {
      headers: {
        Authorization: "Bearer " + STREAMER_TOKEN,
        "Client-Id": CHEEEZZ_BOT_CLIENT_ID,
      },
    }
  );

  const json = await r.json();

  return json;
};

export const getChannelEmotes = async () => {
  const r = await fetch(
    `https://api.twitch.tv/helix/chat/emotes?broadcaster_id=${CHANNEL_ID}`,
    {
      headers: {
        Authorization: "Bearer " + STREAMER_TOKEN,
        "Client-Id": CHEEEZZ_BOT_CLIENT_ID,
      },
    }
  );

  const json = await r.json();

  return json;
};

export const pauseTicketRedemption = async (bool) => {
  try {
    const r = await fetch("https://gql.twitch.tv/gql#origin=twilight", {
      headers: {
        "Client-Id": "kimne78kx3ncx6brgo4mv6wki5h1ko",
        Authorization: `OAuth ${BOT_OAUTH}`,
      },
      body: `[{\"operationName\":\"PauseCustomRewardRedemptions\",\"variables\":{\"input\":{\"channelID\":\"${CHANNEL_ID}\",\"rewardID\":\"b9c9dca5-7488-4169-83a8-83cf577325e4\",\"isPaused\":${bool}}},\"extensions\":{\"persistedQuery\":{\"version\":1,\"sha256Hash\":\"0cf84624f984ef052db18bedb2e034a5c1017dda9d065bb0f6978c3128fa9b99\"}}}]`,
      method: "POST",
    });

    return await r.ok;
  } catch (e) {
    return false;
  }
};

export async function changeTitle({ broadcasterId, title, gameId, token, clientId }) {
  const res = await fetch(`https://api.twitch.tv/helix/channels?broadcaster_id=${broadcasterId}`, {
    method: "PATCH",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Client-Id": clientId,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ...(title ? { title } : {}),
      ...(gameId ? { game_id: gameId } : {}),
      // you can also set tags here (channel-defined tags)
      // tags: ["DevsInTheKnow", "Roblox", ...],
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Twitch update failed: ${res.status} ${res.statusText} ${text}`);
  }

  return true;
}

export async function updateChannelInfo({ broadcasterId, token, clientId, title, gameId }) {
  const url = `https://api.twitch.tv/helix/channels?broadcaster_id=${encodeURIComponent(broadcasterId)}`;

  const body = {};
  if (title) body.title = title;
  if (gameId) body.game_id = String(gameId);

  const r = await fetch(url, {
    method: "PATCH",
    headers: {
      "Client-Id": clientId,
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(`updateChannelInfo failed: ${r.status} ${text}`);
  }

  return true;
}

export async function getGameIdByName({ token, clientId, name }) {
  const url = `https://api.twitch.tv/helix/games?name=${encodeURIComponent(name)}`;

  const r = await fetch(url, {
    headers: {
      "Client-Id": clientId,
      "Authorization": `Bearer ${token}`,
    },
  });

  const data = await r.json().catch(() => null);
  const game = data?.data?.[0];
  return game?.id || null;
}

export const getLatestPredictionData = async () => {
  const r = await fetch("https://gql.twitch.tv/gql#origin=twilight", {
    headers: {
      Accept: "*/*",
      "Accept-Language": "en-US",
      "Client-Id": "kimne78kx3ncx6brgo4mv6wki5h1ko",
      Authorization: "OAuth "+BOT_OAUTH,
    },
    body: `{\"operationName\":\"ChannelPointsPredictionContext\",\"variables\":{\"count\":1,\"channelLogin\":\"${CHANNEL_NAME}\"},\"extensions\":{\"persistedQuery\":{\"version\":1,\"sha256Hash\":\"beb846598256b75bd7c1fe54a80431335996153e358ca9c7837ce7bb83d7d383\"}}}`,
    method: "POST",
  })
  return(await r.json())
};

const PAJBOT_DATABASE_URL = "postgresql+psycopg2:///pajbot?options=-c%%20search_path%%3Dpajbot1_tibb12"

function normalizePgIdent(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "");
}

const PAJBOT_SCHEMA =
  normalizePgIdent(process.env.PAJBOT_SCHEMA || `pajbot1_${CHANNEL_NAME}`) ||
  "pajbot1";

const pajbotPool = new Pool({
  connectionString: PAJBOT_DATABASE_URL,
});

// Optional: log connection issues
pajbotPool.on("error", (err) => {
  console.error("[PAJBOT DB] pool error:", err);
});

export async function addPajbotPointsById(twitchUserId, delta) {
  const amount = Number(delta);
  if (!Number.isFinite(amount) || amount === 0) {
    throw new Error("delta must be a non-zero number");
  }

  const schema = PAJBOT_SCHEMA;
  const r = await pajbotPool.query(
    `UPDATE "${schema}"."user"
     SET points = points + $1
     WHERE id = $2
     RETURNING points`,
    [amount, String(twitchUserId)]
  );

  if (r.rowCount === 0) {
    throw new Error(`user ${twitchUserId} not found in pajbot db`);
  }

  return r.rows[0].points;
}
