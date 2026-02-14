import fs from "fs";
import { setTimeout as delay } from "timers/promises";
import * as ROBLOX_FUNCTIONS from "../api/roblox/index.js";
import * as PLAYTIME from "../functions/playtime.js";

function flagFromValue(value) {
  return /^(1|true|yes|on)$/i.test(String(value ?? "").trim());
}

export function isRobloxModuleEnabled() {
  const raw = String(process.env.MODULE_ROBLOX ?? "").trim();
  if (raw) return flagFromValue(raw);
  return true; // default on (backward compatible)
}

const ROBLOX_UNLINKED_CHAT_MESSAGE = "Streamer hasn't linked Roblox yet.";

const FRIEND_COOLDOWN_MS = 30_000;
let friendCooldownUntil = 0;

export function getRobloxFriendCooldownMs() {
  return FRIEND_COOLDOWN_MS;
}

export function getRobloxFriendCooldownRemainingMs(now = Date.now()) {
  return Math.max(0, Number(friendCooldownUntil || 0) - Number(now || 0));
}

function bumpFriendCooldown() {
  friendCooldownUntil = Date.now() + FRIEND_COOLDOWN_MS;
}

const TO_UNFRIEND_PATH = String(
  process.env.TO_UNFRIEND_PATH || "./TOUNFRIEND.json"
).trim();

function normalizeTrackedFriendEntry(userId, entry) {
  const id = String(userId || "").trim();
  if (!id) return null;

  if (typeof entry === "string") {
    const username = entry.trim();
    if (!username) return null;
    return {
      username,
      permanent: false,
      source: "legacy_temp",
      addedAt: null,
      addedBy: null,
    };
  }

  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    return null;
  }

  const username = String(
    entry.username || entry.name || entry.displayName || ""
  ).trim();
  if (!username) return null;

  const permanent =
    entry.permanent === true ||
    String(entry.type || "").toLowerCase() === "permanent";

  const source = String(entry.source || (permanent ? "permadd" : "friend"))
    .trim()
    .toLowerCase();

  const addedAtRaw = String(entry.addedAt || entry.added_at || "").trim();
  const addedByRaw = String(entry.addedBy || entry.added_by || "").trim();

  return {
    username,
    permanent,
    source: source || (permanent ? "permadd" : "friend"),
    addedAt: addedAtRaw || null,
    addedBy: addedByRaw || null,
  };
}

function normalizeToUnfriendStore(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};

  const normalized = {};
  for (const [userId, entry] of Object.entries(raw)) {
    const normalizedEntry = normalizeTrackedFriendEntry(userId, entry);
    if (!normalizedEntry) continue;
    normalized[String(userId)] = normalizedEntry;
  }
  return normalized;
}

function loadToUnfriendStore() {
  try {
    if (!fs.existsSync(TO_UNFRIEND_PATH)) return {};
    const raw = JSON.parse(fs.readFileSync(TO_UNFRIEND_PATH, "utf8"));
    return normalizeToUnfriendStore(raw);
  } catch {
    return {};
  }
}

function saveToUnfriendStore(store) {
  const normalized = normalizeToUnfriendStore(store);
  fs.writeFileSync(TO_UNFRIEND_PATH, JSON.stringify(normalized, null, 2), "utf8");
  return normalized;
}

function trackFriendTarget({
  userId,
  username,
  permanent = false,
  source = "friend",
  addedBy = "",
} = {}) {
  const id = String(userId || "").trim();
  const name = String(username || "").trim();
  if (!id || !name) return null;

  const store = loadToUnfriendStore();
  const current = store[id] && typeof store[id] === "object" ? store[id] : {};

  store[id] = {
    username: name,
    permanent: !!permanent,
    source:
      String(source || current.source || "friend").trim().toLowerCase() ||
      "friend",
    addedAt: current.addedAt || new Date().toISOString(),
    addedBy: String(addedBy || current.addedBy || "").trim() || null,
  };

  saveToUnfriendStore(store);
  return store[id];
}

function removeTrackedFriend(userId) {
  const id = String(userId || "").trim();
  if (!id) return false;
  const store = loadToUnfriendStore();
  if (!Object.prototype.hasOwnProperty.call(store, id)) return false;
  delete store[id];
  saveToUnfriendStore(store);
  return true;
}

function getTrackedFriendTargets({ permanent = null } = {}) {
  const store = loadToUnfriendStore();
  const targets = [];

  for (const [userId, entry] of Object.entries(store)) {
    const isPermanent = !!entry?.permanent;
    if (permanent === true && !isPermanent) continue;
    if (permanent === false && isPermanent) continue;
    targets.push({
      userId: String(userId),
      username: String(entry?.username || "").trim(),
      permanent: isPermanent,
      source: String(entry?.source || "").trim(),
      addedAt: String(entry?.addedAt || "").trim() || null,
      addedBy: String(entry?.addedBy || "").trim() || null,
    });
  }

  return targets;
}

export function listTrackedRobloxFriends({ scope = "all" } = {}) {
  const normalizedScope = String(scope || "all").trim().toLowerCase();
  const permanentFilter =
    normalizedScope === "temp" || normalizedScope === "temporary"
      ? false
      : normalizedScope === "perm" || normalizedScope === "permanent"
        ? true
        : null;

  const targets = getTrackedFriendTargets({ permanent: permanentFilter });
  return targets.sort((a, b) => {
    const nameA = String(a?.username || "").toLowerCase();
    const nameB = String(b?.username || "").toLowerCase();
    if (nameA < nameB) return -1;
    if (nameA > nameB) return 1;
    return String(a?.userId || "").localeCompare(String(b?.userId || ""));
  });
}

export async function unfriendTrackedRobloxFriends({
  includePermanent = false,
  delayMs = 250,
} = {}) {
  const targets = getTrackedFriendTargets({
    permanent: includePermanent ? null : false,
  });

  if (!targets.length) {
    return {
      ok: true,
      totalBefore: 0,
      processed: 0,
      removed: 0,
      alreadyNotFriends: 0,
      failed: 0,
      stoppedRateLimit: false,
      includePermanent: !!includePermanent,
      remainingTemp: getTrackedFriendTargets({ permanent: false }).length,
      remainingPermanent: getTrackedFriendTargets({ permanent: true }).length,
      entries: [],
    };
  }

  const perEntry = [];
  let removed = 0;
  let alreadyNotFriends = 0;
  let failed = 0;
  let stoppedRateLimit = false;

  for (const target of targets) {
    const result = await ROBLOX_FUNCTIONS.removeFriend(target.userId).catch(() => "error");
    const normalizedResult = String(result || "error").trim().toLowerCase();

    if (normalizedResult === "success") {
      removeTrackedFriend(target.userId);
      removed += 1;
    } else if (normalizedResult === "not_friends") {
      removeTrackedFriend(target.userId);
      alreadyNotFriends += 1;
    } else if (normalizedResult === "rate_limited") {
      failed += 1;
      stoppedRateLimit = true;
      perEntry.push({
        userId: target.userId,
        username: target.username,
        permanent: target.permanent,
        status: "rate_limited",
      });
      break;
    } else {
      failed += 1;
    }

    perEntry.push({
      userId: target.userId,
      username: target.username,
      permanent: target.permanent,
      status: normalizedResult || "error",
    });

    if (Number(delayMs) > 0) {
      await delay(Number(delayMs));
    }
  }

  return {
    ok: true,
    totalBefore: targets.length,
    processed: perEntry.length,
    removed,
    alreadyNotFriends,
    failed,
    stoppedRateLimit,
    includePermanent: !!includePermanent,
    remainingTemp: getTrackedFriendTargets({ permanent: false }).length,
    remainingPermanent: getTrackedFriendTargets({ permanent: true }).length,
    entries: perEntry,
  };
}

export async function addTrackedRobloxFriend({
  targetName,
  requestedBy = "",
  permanent = false,
  source = "friend",
} = {}) {
  if (!isRobloxModuleEnabled()) return { status: "disabled" };

  const username = String(targetName || "")
    .trim()
    .split(/\s+/)[0];
  if (!username) return { status: "missing_username" };

  let valid;
  try {
    valid = await ROBLOX_FUNCTIONS.isValidRobloxUser(username);
  } catch {
    return { status: "validate_error" };
  }

  if (!valid?.isValidUser || !valid?.userId) {
    return { status: "invalid_username" };
  }

  let sendResult = "error";
  try {
    sendResult = await ROBLOX_FUNCTIONS.sendFriendRequest(valid.userId);
  } catch {
    sendResult = "error";
  }

  if (sendResult === "rate_limited") {
    bumpFriendCooldown();
    return { status: "rate_limited", userId: String(valid.userId), username };
  }

  if (sendResult !== "success" && sendResult !== "already") {
    bumpFriendCooldown();
    return { status: "send_error", userId: String(valid.userId), username };
  }

  const record = trackFriendTarget({
    userId: String(valid.userId),
    username,
    permanent: !!permanent,
    source,
    addedBy: requestedBy,
  });

  bumpFriendCooldown();
  return {
    status: sendResult,
    userId: String(valid.userId),
    username,
    permanent: !!record?.permanent,
    source: record?.source || source,
  };
}

export async function handleRobloxModCommands({
  messageArray,
  trimmedMessage,
  twitchUsername,
  reply,
} = {}) {
  if (!isRobloxModuleEnabled()) return false;
  if (!Array.isArray(messageArray) || typeof reply !== "function") return false;

  const cmd = String(messageArray[0] || "").toLowerCase();
  const raw = String(trimmedMessage || "").trim();
  const requestedBy = String(twitchUsername || "").trim();

  if (cmd === "!friend" || cmd === "!permadd") {
    const isPermanent = cmd === "!permadd";
    const targetName = raw
      .replace(/^!(?:friend|permadd)\s*/i, "")
      .trim()
      .split(/\s+/)[0];

    if (!targetName) {
      reply(isPermanent ? "Usage: !permadd <roblox_username>" : "Usage: !friend <roblox_username>");
      return true;
    }

    const cooldownRemainingMs = getRobloxFriendCooldownRemainingMs();
    if (cooldownRemainingMs > 0) {
      const seconds = Math.max(1, Math.ceil(cooldownRemainingMs / 1000));
      reply(`Friend API cooldown active (${seconds}s left).`);
      return true;
    }

    const result = await addTrackedRobloxFriend({
      targetName,
      requestedBy,
      permanent: isPermanent,
      source: isPermanent ? "permadd" : "friend",
    });

    if (result.status === "disabled") {
      reply("Roblox module is disabled for this bot instance.");
      return true;
    }
    if (result.status === "missing_username") {
      reply(isPermanent ? "Usage: !permadd <roblox_username>" : "Usage: !friend <roblox_username>");
      return true;
    }
    if (result.status === "validate_error") {
      reply("Roblox username validation failed.");
      return true;
    }
    if (result.status === "invalid_username") {
      reply("That is not a valid Roblox username.");
      return true;
    }
    if (result.status === "rate_limited") {
      reply("Roblox rate limited me (429). Try again in a bit.");
      return true;
    }
    if (result.status === "send_error") {
      reply("Could not send friend request.");
      return true;
    }

    if (result.status === "already") {
      reply(
        isPermanent
          ? `${result.username} is already friended and is now marked as permanent.`
          : `${result.username} is already friended and is tracked as temporary.`
      );
      return true;
    }

    reply(
      isPermanent
        ? `Sent friend request to ${result.username} and marked as permanent.`
        : `Sent friend request to ${result.username} (temporary).`
    );
    return true;
  }

  if (cmd === "!unfriendtemp" || cmd === "!unfriendall") {
    const tempTargets = listTrackedRobloxFriends({ scope: "temp" });
    if (!tempTargets.length) {
      reply("No temporary tracked users to unfriend.");
      return true;
    }

    const outcome = await unfriendTrackedRobloxFriends({
      includePermanent: false,
      delayMs: 250,
    });
    reply(
      `Temp unfriend done: removed ${outcome.removed}, already-not-friends ${outcome.alreadyNotFriends}, failed ${outcome.failed}. Permanent tracked kept: ${outcome.remainingPermanent}.${outcome.stoppedRateLimit ? " Stopped early due to rate limit." : ""}`
    );
    return true;
  }

  if (cmd === "!friendstats") {
    const tempCount = getTrackedFriendTargets({ permanent: false }).length;
    const permCount = getTrackedFriendTargets({ permanent: true }).length;
    reply(`Tracked friends: temp=${tempCount}, permanent=${permCount}.`);
    return true;
  }

  return false;
}

function formatPlayTime(hours, minutes, seconds) {
  const parts = [];

  if (hours > 0) parts.push(`${hours} hour${hours === 1 ? "" : "s"}`);
  if (minutes > 0) parts.push(`${minutes} minute${minutes === 1 ? "" : "s"}`);
  if (seconds > 0 || parts.length === 0) {
    parts.push(`${seconds} second${seconds === 1 ? "" : "s"}`);
  }

  return parts.join(" and ");
}

let gameChangeTime = null;
let gamesPlayedCooldownUntil = 0;

export function getRobloxGamesPlayedCooldownRemainingMs(now = Date.now()) {
  return Math.max(0, Number(gamesPlayedCooldownUntil || 0) - Number(now || 0));
}

async function pollPlaytimeTracking({
  settingsPath,
  playtimePath,
  getTrackedRobloxUserId,
  logger,
} = {}) {
  try {
    const SETTINGS = JSON.parse(fs.readFileSync(settingsPath, "utf8"));

    const linkedRobloxUserId =
      typeof getTrackedRobloxUserId === "function" ? getTrackedRobloxUserId() : null;
    if (!linkedRobloxUserId) {
      if (SETTINGS.currentGame) {
        SETTINGS.currentGame = null;
        PLAYTIME.onGameChange(null, playtimePath);
        fs.writeFileSync(settingsPath, JSON.stringify(SETTINGS));
      }
      return;
    }

    const presence = await ROBLOX_FUNCTIONS.getPresence(linkedRobloxUserId);
    const location = await ROBLOX_FUNCTIONS.resolvePresenceLocation(presence);
    const trackedGame = !location || location === "Website" ? null : location;

    if (location !== SETTINGS.currentGame) {
      SETTINGS.currentGame = location;
      gameChangeTime = new Date();
      fs.writeFileSync(settingsPath, JSON.stringify(SETTINGS));
    }

    const current = PLAYTIME.getCurrentPlaytime(playtimePath);
    const currentGame = current?.game ?? null;

    if (trackedGame !== currentGame) {
      PLAYTIME.onGameChange(trackedGame, playtimePath);
      if (trackedGame) gameChangeTime = new Date();
    } else {
      PLAYTIME.tick(playtimePath);
    }
  } catch (e) {
    logger?.error?.("[roblox] playtime poll failed:", e);
  }
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

function sameGame(aPlaceId, aName, bPlaceId, bName) {
  if (aPlaceId != null && bPlaceId != null) return aPlaceId === bPlaceId;
  return String(aName || "") === String(bName || "");
}

export function registerRobloxModule({
  client,
  channelName,
  channelNameDisplay,
  botPrefix = "",
  streamerDisplayName = "Streamer",
  settingsPath = "./SETTINGS.json",
  streamsPath = "./STREAMS.json",
  playtimePath = "./playtime.json",
  playtimeTickMs = 60_000,
  gamesPlayedCountMax = 5,
  gamesPlayedChatCooldownMs = 15_000,
  getChatPerms,
  isSharedCommandCooldownActive,
  getTrackedRobloxUserId,
  twitchFunctions,
  logRecentCommandResponse,
  logger = console,
} = {}) {
  if (!client || typeof client.on !== "function") {
    throw new Error("registerRobloxModule: missing tmi client");
  }
  if (!channelName) throw new Error("registerRobloxModule: missing channelName");
  if (client.__mainsbotRobloxInstalled) return () => {};
  client.__mainsbotRobloxInstalled = true;

  const CHANNEL_NAME = String(channelName).replace(/^#/, "");
  const CHANNEL_NAME_DISPLAY = String(channelNameDisplay || "").trim();
  const STREAMER_DISPLAY_NAME =
    String(streamerDisplayName || CHANNEL_NAME_DISPLAY || CHANNEL_NAME).trim() || "Streamer";

  let stopped = false;

  const playtimeTick = async () => {
    if (stopped) return;
    await pollPlaytimeTracking({
      settingsPath,
      playtimePath,
      getTrackedRobloxUserId,
      logger,
    });
  };

  void playtimeTick();
  const playtimeInterval = setInterval(playtimeTick, Math.max(10_000, Number(playtimeTickMs) || 60_000));

  const replyRaw = (userstate, text) => {
    client.raw(
      `@client-nonce=${userstate?.["client-nonce"] || ""};reply-parent-msg-id=${userstate?.["id"] || ""} ` +
        `PRIVMSG #${CHANNEL_NAME} :${botPrefix || ""}${text}`
    );
  };

  const gamePlaytimeHandler = async (channel, userstate, message, self) => {
    try {
      if (stopped) return;
      if (self) return;

      const msg = String(message || "");
      const lowerMessage = msg.toLowerCase().trim();

      const isGamesPlayedCountCommand =
        lowerMessage.startsWith("!gamesplayedcount") ||
        lowerMessage.startsWith("!gamesplayed count");
      const gamesPlayedScopeByCommand = {
        "!gamesplayed": "stream",
        "!gamesplayedall": "all",
        "!gamesplayedweek": "week",
        "!gamesplayedmonth": "month",
        "!gamesplayedyesterday": "yesterday",
      };
      const isGamesPlayedCommand = Boolean(gamesPlayedScopeByCommand[lowerMessage]);
      const isGameOrPlaytime = lowerMessage === "!playtime" || lowerMessage === "!game";

      if (!isGamesPlayedCountCommand && !isGamesPlayedCommand && !isGameOrPlaytime) return;

      const SETTINGS = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
      const STREAMS = JSON.parse(fs.readFileSync(streamsPath, "utf8"));

      if (SETTINGS.ks !== false) return;

      const gamesPlayedCount = Math.min(
        Math.max(1, Number(gamesPlayedCountMax) || 5),
        Math.max(1, Number(SETTINGS.gamesPlayedCount) || 3)
      );

      const isGameCommandWithSharedCooldown =
        isGamesPlayedCountCommand || isGameOrPlaytime || isGamesPlayedCommand;
      if (isGameCommandWithSharedCooldown && typeof isSharedCommandCooldownActive === "function") {
        if (isSharedCommandCooldownActive(userstate)) return;
      }

      if (isGamesPlayedCountCommand) {
        const parts = msg.trim().split(/\s+/);
        const usesSplitCommand =
          String(parts[0] || "").toLowerCase() === "!gamesplayed" &&
          String(parts[1] || "").toLowerCase() === "count";
        const countArgIndex = usesSplitCommand ? 2 : 1;
        const canEdit =
          typeof getChatPerms === "function"
            ? getChatPerms(userstate, { channelLogin: CHANNEL_NAME }).isPermitted
            : Boolean(userstate?.mod || userstate?.badges?.broadcaster === "1");

        if (parts.length <= countArgIndex) {
          const usageSuffix = canEdit
            ? ` Use !gamesplayedcount <1-${Math.max(1, Number(gamesPlayedCountMax) || 5)}> to change.`
            : "";
          return replyRaw(userstate, `Games played count is ${gamesPlayedCount}.${usageSuffix}`);
        }

        if (!canEdit) return;

        const nextCount = Number(parts[countArgIndex]);
        const maxAllowed = Math.max(1, Number(gamesPlayedCountMax) || 5);
        if (!Number.isFinite(nextCount) || nextCount < 1 || nextCount > maxAllowed) {
          return replyRaw(
            userstate,
            `Please choose a number between 1 and ${maxAllowed}.`
          );
        }

        SETTINGS.gamesPlayedCount = Math.floor(nextCount);
        fs.writeFileSync(settingsPath, JSON.stringify(SETTINGS));
        return replyRaw(userstate, `Games played count set to ${SETTINGS.gamesPlayedCount}.`);
      }

      const gamesPlayedScope = gamesPlayedScopeByCommand[lowerMessage];
      if (gamesPlayedScope) {
        const now = Date.now();
        if (now < gamesPlayedCooldownUntil) return;
        gamesPlayedCooldownUntil = now + Math.max(0, Number(gamesPlayedChatCooldownMs) || 0);

        const topGamesMsg = PLAYTIME.buildTopGamesMessage(gamesPlayedCount, playtimePath, {
          scope: gamesPlayedScope,
          maxMessageChars: 320,
        });
        return replyRaw(userstate, topGamesMsg);
      }

      const linkedRobloxUserId =
        typeof getTrackedRobloxUserId === "function" ? getTrackedRobloxUserId() : null;
      if (!linkedRobloxUserId) {
        return replyRaw(userstate, ROBLOX_UNLINKED_CHAT_MESSAGE);
      }

      const presence = await ROBLOX_FUNCTIONS.getPresence(linkedRobloxUserId);
      const location = await ROBLOX_FUNCTIONS.resolvePresenceLocation(presence);

      if (lowerMessage === "!game") {
        if (!location) {
          return replyRaw(userstate, `${STREAMER_DISPLAY_NAME} is not currently on Roblox.`);
        }
        if (location === "Website" || SETTINGS.currentGame === "WEBSITE") {
          return replyRaw(userstate, `${STREAMER_DISPLAY_NAME} is currently switching games.`);
        }
        return replyRaw(
          userstate,
          `${STREAMER_DISPLAY_NAME} is currently playing ${location || SETTINGS.currentGame}.`
        );
      }

      if (lowerMessage === "!playtime") {
        if (!location) {
          return replyRaw(userstate, `${STREAMER_DISPLAY_NAME} is not currently playing Roblox.`);
        }
        if (location === "Website") {
          return replyRaw(userstate, `${STREAMER_DISPLAY_NAME} is currently switching games.`);
        }
        if (!gameChangeTime) return replyRaw(userstate, "No game is being played yet.");

        const currentTime = new Date();
        const playTime = currentTime - gameChangeTime;

        const seconds = Math.floor((playTime / 1000) % 60);
        const minutes = Math.floor((playTime / (1000 * 60)) % 60);
        const hours = Math.floor(playTime / (1000 * 60 * 60));

        const formattedPlayTime = formatPlayTime(hours, minutes, seconds);
        return replyRaw(
          userstate,
          `${STREAMER_DISPLAY_NAME} has been playing ${location} for ${formattedPlayTime}.`
        );
      }
    } catch (e) {
      logger?.warn?.("[roblox] game/playtime handler failed:", String(e?.message || e));
    }
  };

  const gameLinkHandler = async (channel, userstate, message, self) => {
    try {
      if (stopped) return;
      if (self) return;
      const msg = String(message || "");
      if (msg.toLowerCase().trim() !== "!gamelink") return;

      const SETTINGS = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
      if (SETTINGS.ks !== false) return;
      if (typeof isSharedCommandCooldownActive === "function") {
        if (isSharedCommandCooldownActive(userstate)) return;
      }

      const linkedRobloxUserId =
        typeof getTrackedRobloxUserId === "function" ? getTrackedRobloxUserId() : null;
      if (!linkedRobloxUserId) {
        return replyRaw(userstate, ROBLOX_UNLINKED_CHAT_MESSAGE);
      }

      let presence = null;
      try {
        presence = await ROBLOX_FUNCTIONS.getPresence(linkedRobloxUserId);
      } catch (err) {
        logger?.error?.("[roblox] getPresence threw:", err);
        return replyRaw(userstate, "Couldn't fetch game info right now (Roblox API error).");
      }

      if (!presence || presence.error) {
        return replyRaw(userstate, "Couldn't fetch game info right now.");
      }

      const locationId = String(presence.placeId ?? "");
      const location = await ROBLOX_FUNCTIONS.resolvePresenceLocation(presence);

      if (locationId === "8343259840") {
        return replyRaw(userstate, "Current game link -> roblox.com/games/4588604953");
      }
      if (locationId === "6839171747") {
        return replyRaw(userstate, "Current game link -> roblox.com/games/6516141723");
      }

      if (SETTINGS.currentMode === "!link.on" && SETTINGS.currentLink) {
        return replyRaw(userstate, `Current game link -> ${SETTINGS.currentLink}`);
      }

      if (location !== "Website" && locationId) {
        return replyRaw(userstate, `Current game link -> roblox.com/games/${locationId}`);
      }

      return replyRaw(userstate, `${STREAMER_DISPLAY_NAME} is currently switching games.`);
    } catch (e) {
      logger?.warn?.("[roblox] gamelink handler failed:", String(e?.message || e));
    }
  };

  client.on("message", gamePlaytimeHandler);
  client.on("message", gameLinkHandler);

  // Presence announce (Helix chat)
  let presenceStop = null;
  if (twitchFunctions?.sendHelixChatMessage) {
    const POLL_MS = 4000;
    const STABLE_MS = 8000;
    const REJOIN_WINDOW_MS = 20000;
    const EVENT_COOLDOWN_MS = 15000;
    const lastEventSentAt = { presence_left: 0, presence_joined: 0 };
    let hasSnapshot = false;
    let stable = { type: 0, placeId: null, name: null, ts: 0 };
    let candidate = { type: 0, placeId: null, name: null, firstSeenTs: 0 };
    let lastLeft = { placeId: null, name: null, ts: 0 };

    const nowMs = () => Date.now();
    const canSend = (eventKey) => {
      const t = nowMs();
      if (t - (lastEventSentAt[eventKey] || 0) < EVENT_COOLDOWN_MS) return false;
      lastEventSentAt[eventKey] = t;
      return true;
    };

    const sendPresenceHelixMessage = async (message, source = "presence_monitor") => {
      const text = String(message || "").trim();
      if (!text) return;
      try {
        await twitchFunctions.sendHelixChatMessage({
          channel: CHANNEL_NAME,
          message: text,
          source,
          label: "presence_monitor",
        });
        if (typeof logRecentCommandResponse === "function") {
          logRecentCommandResponse(CHANNEL_NAME, text, "helix");
        }
      } catch (e) {
        logger?.warn?.(
          `[TWITCH][HELIX_CHAT] ${source} failed: ${String(e?.message || e)}`
        );
      }
    };

    const interval = setInterval(() => {
      if (stopped) return;
      const linkedRobloxUserId =
        typeof getTrackedRobloxUserId === "function" ? getTrackedRobloxUserId() : null;
      if (!linkedRobloxUserId) {
        hasSnapshot = false;
        stable = { type: 0, placeId: null, name: null, ts: 0 };
        candidate = { type: 0, placeId: null, name: null, firstSeenTs: 0 };
        lastLeft = { placeId: null, name: null, ts: 0 };
        return;
      }

      ROBLOX_FUNCTIONS.monitorGetPresenceSync(linkedRobloxUserId, async (presence) => {
        if (stopped) return;
        if (!presence || presence.ok === false) return;

        let SETTINGS = null;
        try {
          SETTINGS = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
        } catch {}

        if (!SETTINGS || SETTINGS.ks !== false) return;

        const nextPlaceId = presence.placeId ?? null;
        const nextLocation = await ROBLOX_FUNCTIONS.resolvePresenceLocation(presence);
        const nextType = Number(presence.userPresenceType ?? 0);

        if (!hasSnapshot) {
          hasSnapshot = true;
          stable = { type: nextType, placeId: nextPlaceId, name: nextLocation, ts: nowMs() };
          candidate = { type: nextType, placeId: nextPlaceId, name: nextLocation, firstSeenTs: nowMs() };
          return;
        }

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
          return;
        }

        if (nowMs() - candidate.firstSeenTs < STABLE_MS) return;

        const stableChanged =
          stable.type !== candidate.type ||
          stable.placeId !== candidate.placeId ||
          stable.name !== candidate.name;

        if (!stableChanged) return;

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
          await sendPresenceHelixMessage(`${displayName} left the game.`, "presence_left");
          return;
        }

        if (!prevWasInGame && nextIsInGame) {
          if (justLeftSameGameRecently) return;
          if (!canSend("presence_joined")) return;
          await sendPresenceHelixMessage(
            `${displayName} is now playing ${stable.name}.`,
            "presence_joined"
          );
          return;
        }

        if (prevWasInGame && nextIsInGame) {
          if (justLeftSameGameRecently) return;
          if (!canSend("presence_joined")) return;
          await sendPresenceHelixMessage(
            `${displayName} is now playing ${stable.name}.`,
            "presence_joined"
          );
        }
      });
    }, POLL_MS);

    presenceStop = () => clearInterval(interval);
  }

  return () => {
    stopped = true;
    try {
      clearInterval(playtimeInterval);
    } catch {}
    try {
      presenceStop?.();
    } catch {}
    try {
      client.off?.("message", gamePlaytimeHandler);
    } catch {
      client.removeListener?.("message", gamePlaytimeHandler);
    }
    try {
      client.off?.("message", gameLinkHandler);
    } catch {
      client.removeListener?.("message", gameLinkHandler);
    }
  };
}
