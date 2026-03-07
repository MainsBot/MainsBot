import fs from "fs";
import WebSocket from "ws";
import { setTimeout as delay } from "timers/promises";

import * as FILTER_FUNCTIONS from "../functions/filters.js";
import * as ROBLOX_FUNCTIONS from "../api/roblox/index.js";
import * as SPOTIFY from "../api/spotify/index.js";
import { isSpotifyModuleEnabled } from "./spotifyCommands.js";
import {
  addTrackedRobloxFriend,
  getRobloxFriendCooldownRemainingMs,
  isRobloxModuleEnabled,
} from "./roblox.js";

function flagFromValue(value) {
  return /^(1|true|yes|on)$/i.test(String(value ?? "").trim());
}

function normalizeAuthToken(value) {
  return String(value || "")
    .trim()
    .replace(/^oauth:/i, "")
    .replace(/^bearer\s+/i, "");
}

function safeJsonParse(text, fallback = null) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function normalizeEventType(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[-.\s]+/g, "_");
}

const MIN_AUTO_FOC_OFF_DELAY_MS = 60_000;
const DEFAULT_POLL_ANNOUNCE_TEMPLATE = "New poll! {title} :: {options}{extraVotes}";
const DEFAULT_POLL_COMPLETE_NO_POINTS_TEMPLATE =
  "Poll has ended {winning} has won the poll! Nobody dumped any {channelPointsName} Sadge";
const DEFAULT_POLL_COMPLETE_LOSS_TEMPLATE =
  "RIPBOZO @{user} just lost {channelPoints} {channelPointsName} thats {farmTime} of farming";
const DEFAULT_POLL_COMPLETE_WIN_TEMPLATE =
  "PogU @{user} just spent {channelPoints} {channelPointsName}";

function normalizeAutoFocOffDelayMs(value, fallback = MIN_AUTO_FOC_OFF_DELAY_MS) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.max(MIN_AUTO_FOC_OFF_DELAY_MS, Math.floor(n));
}

export function isPubsubModuleEnabled() {
  const raw = String(process.env.MODULE_PUBSUB ?? "").trim();
  if (raw) return flagFromValue(raw);
  return true; // default on (backward compatible)
}

export function startTwitchPubsub({
  client,
  twitchFunctions,
  botOauth,
  streamerOauth,
  channelId,
  botId,
  channelName,
  settingsPath = String(process.env.SETTINGS_PATH || "./SETTINGS.json").trim(),
  streamsPath = String(process.env.STREAMS_PATH || "./STREAMS.json").trim(),
  onChannelPointEvent = null,
  liveUpHandler,
  liveDownHandler,
  logger = console,
} = {}) {
  if (!client) throw new Error("startTwitchPubsub: missing client");
  if (!twitchFunctions) throw new Error("startTwitchPubsub: missing twitchFunctions");
  if (!channelId) throw new Error("startTwitchPubsub: missing channelId");
  if (!channelName) throw new Error("startTwitchPubsub: missing channelName");
  if (typeof liveUpHandler !== "function") throw new Error("startTwitchPubsub: missing liveUpHandler");
  if (typeof liveDownHandler !== "function") throw new Error("startTwitchPubsub: missing liveDownHandler");

  const TWITCH_FUNCTIONS = twitchFunctions;
  const BOT_OAUTH = normalizeAuthToken(botOauth);
  const STREAMER_OAUTH = normalizeAuthToken(streamerOauth);
  if (!BOT_OAUTH && !STREAMER_OAUTH) {
    throw new Error("startTwitchPubsub: missing botOauth/streamerOauth");
  }
  const CHANNEL_ID = channelId;
  const BOT_ID = String(botId || "").trim();
  const CHANNEL_NAME = String(channelName).replace(/^#/, "");
  const SETTINGS_PATH = settingsPath;
  const STREAMS_PATH = streamsPath;

  const WAIT_UNTIL_FOC_OFF = normalizeAutoFocOffDelayMs(process.env.WAIT_UNTIL_FOC_OFF);
  const WAIT_UNTIL_FOC_OFF_RAID = Math.max(0, Number(process.env.WAIT_UNTIL_FOC_OFF_RAID) || 0);
  const POLL_FALLBACK_ENABLED = flagFromValue(
    process.env.POLL_FALLBACK_ENABLED ?? "1"
  );
  const POLL_FALLBACK_INTERVAL_MS = Math.max(
    10_000,
    Number(process.env.POLL_FALLBACK_INTERVAL_MS) || 30_000
  );

  const IS_BOT = /^(1|true|yes|on)$/i.test(String(process.env.IS_BOT ?? "").trim());
  const bot = IS_BOT ? "[??] " : "";

  let stopped = false;

  // referenced by legacy handler
  let SETTINGS = {};
  let STREAMS = {};
  let streamNumber = 0;

var pubsub;
const myname = CHANNEL_NAME;
const pendingListens = new Map();
let reconnectTimer = null;
let reconnectAttempt = 0;
let pollFallbackTimer = null;
let lastProcessedPollSignature = "";
let lastAnnouncedPollCreateSignature = "";
let lastProcessedPredictionResolutionId = "";
const subTierCache = new Map();

function asNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function extractPredictionUserTopLosses(event = {}) {
  const outcomes = Array.isArray(event?.outcomes) ? event.outcomes : [];
  const winningOutcomeId = String(event?.winning_outcome_id || "").trim();
  if (!winningOutcomeId || !outcomes.length) return [];

  const lossByUser = new Map();
  for (const outcome of outcomes) {
    const outcomeId = String(outcome?.id || "").trim();
    if (!outcomeId || outcomeId === winningOutcomeId) continue;

    const topPredictors = Array.isArray(outcome?.top_predictors)
      ? outcome.top_predictors
      : [];
    for (const predictor of topPredictors) {
      const userId = String(predictor?.user_id || "").trim();
      const login = String(predictor?.user_login || "").trim().toLowerCase();
      const displayName = String(predictor?.user_name || "").trim();
      const pointsUsed = Math.max(
        0,
        Math.floor(asNumber(predictor?.channel_points_used, 0))
      );
      if ((!userId && !login) || pointsUsed <= 0) continue;

      const key = userId || login;
      const prev = lossByUser.get(key);
      if (!prev || pointsUsed > prev.pointsLost) {
        lossByUser.set(key, {
          userId,
          login,
          displayName,
          pointsLost: pointsUsed,
        });
      }
    }
  }

  return Array.from(lossByUser.values()).sort(
    (a, b) => Number(b.pointsLost || 0) - Number(a.pointsLost || 0)
  );
}

async function getSubTierFromTwitch(userId = "") {
  const id = String(userId || "").trim();
  if (!id) return 0;
  const now = Date.now();
  const cached = subTierCache.get(id);
  if (cached && now - Number(cached.ts || 0) < 6 * 60 * 60 * 1000) {
    return Number(cached.tier || 0);
  }
  try {
    const data = await TWITCH_FUNCTIONS.getSubStatus(id);
    const tier = Number(data?.data?.[0]?.tier ?? 0);
    subTierCache.set(id, { tier, ts: now });
    return tier;
  } catch {
    subTierCache.set(id, { tier: 0, ts: now });
    return 0;
  }
}

function getFarmingRateForTier(tier = 0) {
  const baseRate = 5.33333333;
  if (Number(tier) === 1000) return baseRate * 1.2;
  if (Number(tier) === 2000) return baseRate * 1.4;
  if (Number(tier) === 3000) return baseRate * 2;
  return baseRate;
}

function queueChannelPointEvents(events = []) {
  if (typeof onChannelPointEvent !== "function") return;
  const rows = Array.isArray(events) ? events : [events];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    Promise.resolve()
      .then(() => onChannelPointEvent(row))
      .catch((e) => {
        logger.warn?.(
          `[pubsub][points] failed to persist event: ${String(e?.message || e)}`
        );
      });
  }
}

async function processPredictionResolvedEvent(event = {}, source = "pubsub") {
  const predictionId = String(event?.id || "").trim();
  const status = normalizeEventType(event?.status || "");
  if (status !== "RESOLVED") return false;
  if (!predictionId) return false;
  if (predictionId === lastProcessedPredictionResolutionId) return false;

  const losses = extractPredictionUserTopLosses(event);
  if (!losses.length) {
    logger.log?.(
      `[pubsub][prediction] resolved without top predictor loss rows source=${source} id=${predictionId}`
    );
    lastProcessedPredictionResolutionId = predictionId;
    return false;
  }

  const maxUsers = Math.max(
    1,
    Math.min(5, Number(process.env.PREDICTION_RIPBOZO_MAX_USERS || 3) || 3)
  );
  const selected = losses.slice(0, maxUsers);
  const analyticsEvents = [];

  for (const row of selected) {
    const pointsLost = Math.max(0, Math.floor(asNumber(row.pointsLost, 0)));
    if (pointsLost <= 0) continue;

    const tier = await getSubTierFromTwitch(row.userId);
    const farmingRate = getFarmingRateForTier(tier);
    const yearsFromPoints = pointsLost / farmingRate / (60 * 24 * 365);
    const cpToHours = ROBLOX_FUNCTIONS.timeToAgo(yearsFromPoints);
    const login = String(row.login || row.displayName || "user").trim();
    client.say(
      CHANNEL_NAME,
      `RIPBOZO @${login} lost ${pointsLost} channel points, thats ${cpToHours.timeString} of farming.`
    );
  }

  for (const row of losses) {
    const pointsLost = Math.max(0, Math.floor(asNumber(row.pointsLost, 0)));
    if (pointsLost <= 0) continue;
    analyticsEvents.push({
      ts: new Date().toISOString(),
      source: "pubsub",
      type: "prediction_loss",
      userId: String(row.userId || "").trim(),
      login: String(row.login || "").trim().toLowerCase(),
      displayName: String(row.displayName || "").trim(),
      pointsSpent: pointsLost,
      pointsLost,
      subTier: 0,
      meta: { predictionId, channelId: CHANNEL_ID },
    });
  }
  queueChannelPointEvents(analyticsEvents);

  lastProcessedPredictionResolutionId = predictionId;
  logger.log?.(
    `[pubsub][prediction] RIPBOZO sent (${selected.length} users) source=${source} id=${predictionId}`
  );
  return true;
}

function normalizePollChoiceTitle(choice = {}) {
  return String(
    choice?.title ??
      choice?.text ??
      choice?.label ??
      choice?.name ??
      ""
  ).trim();
}

function normalizePollPayload(raw = {}) {
  const src = raw && typeof raw === "object" ? raw : {};
  const choices = Array.isArray(src.choices)
    ? src.choices.map((choice) => normalizePollChoiceTitle(choice)).filter(Boolean)
    : [];
  const cpVoteEnabled =
    src.cpVoteEnabled != null
      ? Boolean(src.cpVoteEnabled)
      : src.channel_points_voting_enabled != null
        ? Boolean(src.channel_points_voting_enabled)
        : Boolean(src?.settings?.communityPointsVotes?.isEnabled);
  const cpVote = Math.max(
    0,
    Math.floor(
      Number(
        src.cpVote ??
          src.channel_points_per_vote ??
          src?.settings?.communityPointsVotes?.cost ??
          0
      ) || 0
    )
  );

  return {
    id: String(src.id || "").trim(),
    title: String(src.title || "").trim(),
    choices,
    cpVoteEnabled,
    cpVote,
    startedAt: String(src.startedAt || src.started_at || "").trim(),
  };
}

function extractPollPayloadFromMessage(messageData = {}) {
  const candidates = [
    messageData?.data?.poll,
    messageData?.data?.event?.poll,
    messageData?.data?.event,
    messageData?.event?.poll,
    messageData?.event,
    messageData?.poll,
  ];
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") continue;
    const poll = normalizePollPayload(candidate);
    if (poll.id || poll.title || poll.choices.length) {
      return poll;
    }
  }
  return null;
}

function buildPollCreateSignature(poll = {}) {
  const id = String(poll?.id || "").trim();
  if (id) return id;
  const title = String(poll?.title || "").trim().toLowerCase();
  const startedAt = String(poll?.startedAt || "").trim();
  const options = Array.isArray(poll?.choices)
    ? poll.choices.map((choice) => String(choice || "").trim().toLowerCase()).filter(Boolean).join("|")
    : "";
  return [title, options, startedAt].filter(Boolean).join("::");
}

function renderPollCreateAnnouncementMessage(settings = {}, poll = {}) {
  const template =
    String(settings?.pollAnnounceTemplate || "").trim() || DEFAULT_POLL_ANNOUNCE_TEMPLATE;
  const title = String(poll?.title || "").trim();
  const options = Array.isArray(poll?.choices)
    ? poll.choices.map((choice) => String(choice || "").trim()).filter(Boolean).join(" / ")
    : "";
  const channelPointsCost = Math.max(0, Math.floor(Number(poll?.cpVote || 0) || 0));
  const channelPointsName =
    String(settings?.pollAnnounceChannelPointsName || "").trim() || "channel points";
  const extraVotes =
    poll?.cpVoteEnabled && channelPointsCost > 0
      ? ` You can get extra votes for ${channelPointsCost} ${channelPointsName}.`
      : "";

  return template
    .replaceAll("{title}", title)
    .replaceAll("{options}", options)
    .replaceAll("{extraVotes}", extraVotes)
    .replaceAll("{channelPoints}", String(channelPointsCost))
    .replaceAll("{channelPointsCost}", String(channelPointsCost))
    .replaceAll("{cpCost}", String(channelPointsCost))
    .replaceAll("{channelPointsName}", channelPointsName)
    .replaceAll("{streamerDisplay}", CHANNEL_NAME)
    .replaceAll("{channel}", CHANNEL_NAME)
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;!?])/g, "$1")
    .trim();
}

function formatPollCompletionTemplate(template = "", replacements = {}) {
  let output = String(template || "").trim();
  for (const [key, value] of Object.entries(replacements || {})) {
    output = output.replaceAll(`{${key}}`, String(value ?? "").trim());
  }
  return output
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;!?])/g, "$1")
    .trim();
}

async function maybeAnnouncePollCreated(pollData = null, source = "pubsub") {
  if (!SETTINGS?.pollAnnounceEnabled || SETTINGS?.ks) return false;

  let poll = normalizePollPayload(pollData || {});
  if (!poll.title || !poll.choices.length) {
    const latest = await TWITCH_FUNCTIONS.getLatestPollData().catch((e) => {
      logger.warn?.(
        `[pubsub][poll] getLatestPollData failed (${source} create): ${String(e?.message || e)}`
      );
      return null;
    });
    if (latest && latest !== "error") {
      poll = normalizePollPayload(latest);
    }
  }

  const signature = buildPollCreateSignature(poll);
  if (!signature || signature === lastAnnouncedPollCreateSignature) return false;
  if (!poll.title || !poll.choices.length) return false;

  const message = renderPollCreateAnnouncementMessage(SETTINGS, poll);
  if (!message) return false;

  lastAnnouncedPollCreateSignature = signature;
  try {
    await client.say(CHANNEL_NAME, message);
    logger.log?.(
      `[pubsub][poll] created announcement sent source=${source} id=${String(poll.id || "unknown")}`
    );
    return true;
  } catch (e) {
    logger.warn?.(
      `[pubsub][poll] created announcement failed (${source}): ${String(e?.message || e)}`
    );
    return false;
  }
}

function readJsonFile(filePath, fallback) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return safeJsonParse(raw, fallback) ?? fallback;
  } catch {
    return fallback;
  }
}

function refreshRuntimeState() {
  SETTINGS = readJsonFile(SETTINGS_PATH, {});
  STREAMS = readJsonFile(STREAMS_PATH, {});
  streamNumber = Object.keys(STREAMS || {}).length;
}

function isPollTerminalStatus(value) {
  const status = normalizeEventType(value);
  return (
    status === "POLL_ARCHIVE" ||
    status === "ARCHIVED" ||
    status === "POLL_TERMINATE" ||
    status === "TERMINATED" ||
    status === "POLL_COMPLETE" ||
    status === "COMPLETED"
  );
}

async function processPollTerminalPayload(pollData, pollType = "", source = "pubsub") {
  const r = pollData && typeof pollData === "object" ? pollData : null;
  if (!r) return false;
  if (!Array.isArray(r.choices) || !Array.isArray(r.userNodes)) return false;

  const type = normalizeEventType(pollType || r.status || "");
  logger.log?.(
    `[pubsub][poll] processing terminal poll type=${type || "(unknown)"} source=${source} id=${String(r.id || "unknown")}`
  );

  if (!isPollTerminalStatus(type)) {
    return false;
  }

  const choices = r.choices;
  const userNodes = r.userNodes;
  const channelPointsName =
    String(SETTINGS?.pollAnnounceChannelPointsName || "").trim() || "channel points";
  const pollTitle = String(r.title || "").trim();

  let winnerId = "";
  let winnerVotes = 0;
  let winnerTitle = "";
  for (const choice of choices) {
    const totalVotes = Number(choice?.votes?.total || 0);
    if (totalVotes > winnerVotes) {
      winnerVotes = totalVotes;
      winnerId = String(choice?.id || "");
      winnerTitle = normalizePollChoiceTitle(choice);
    }
  }
  if (!winnerId) return false;

  const analyticsRows = [];
  let totalCommunityPointsSpent = 0;
  let topChoiceSpend = null;

  for (const node of userNodes) {
    const userId = String(node?.user?.id || "");
    const username = String(node?.user?.login || "").trim().toLowerCase();
    const displayName = String(node?.user?.displayName || "").trim();
    if (!userId && !username) continue;

    let totalLoss = 0;
    let totalSpent = 0;
    for (const userChoice of Array.isArray(node?.choices) ? node.choices : []) {
      const choiceId = String(userChoice?.pollChoice?.id || "");
      if (!choiceId) continue;
      const amount = Math.max(
        0,
        Math.floor(Number(userChoice?.tokens?.communityPoints ?? 0) || 0)
      );
      if (amount <= 0) continue;
      totalCommunityPointsSpent += amount;
      totalSpent += amount;
      if (choiceId !== winnerId) {
        totalLoss += amount;
      }
      if (!topChoiceSpend || amount > Number(topChoiceSpend.pointsSpent || 0)) {
        topChoiceSpend = {
          userId,
          username,
          displayName,
          choiceId,
          choiceTitle: normalizePollChoiceTitle(userChoice?.pollChoice || {}),
          pointsSpent: amount,
          won: choiceId === winnerId,
        };
      }
    }
    if (totalSpent > 0) {
      analyticsRows.push({
        userId,
        username,
        displayName,
        pointsSpent: totalSpent,
        pointsLost: totalLoss,
      });
    }
  }

  const analyticsEvents = await Promise.all(
    analyticsRows.map(async (row) => {
      const tier = await getSubTierFromTwitch(row.userId);
      return {
        ts: new Date().toISOString(),
        source: "pubsub",
        type: "poll_spend",
        userId: String(row.userId || "").trim(),
        login: String(row.username || "").trim().toLowerCase(),
        displayName: String(row.displayName || "").trim(),
        pointsSpent: Math.max(0, Math.floor(asNumber(row.pointsSpent, 0))),
        pointsLost: Math.max(0, Math.floor(asNumber(row.pointsLost, 0))),
        subTier: Number.isFinite(tier) ? Number(tier) : 0,
        meta: {
          pollId: String(r.id || "").trim() || null,
          pollTitle: String(r.title || "").trim() || null,
          channelId: CHANNEL_ID,
        },
      };
    })
  );
  queueChannelPointEvents(analyticsEvents);

  const cpVoteEnabled = Boolean(r?.cpVoteEnabled);
  if (!cpVoteEnabled) {
    logger.log?.(
      `[pubsub][poll] completed without channel-point extra votes source=${source} id=${String(
        r.id || "unknown"
      )}`
    );
    return analyticsRows.length > 0;
  }

  let completionMessage = "";
  let completionKind = "";

  if (totalCommunityPointsSpent <= 0) {
    completionKind = "no_points";
    completionMessage = formatPollCompletionTemplate(
      String(SETTINGS?.pollCompleteNoPointsTemplate || "").trim() ||
        DEFAULT_POLL_COMPLETE_NO_POINTS_TEMPLATE,
      {
        winning: winnerTitle || "The winning option",
        title: pollTitle,
        channelPointsName,
        channel: CHANNEL_NAME,
      }
    );
  } else if (topChoiceSpend && Number(topChoiceSpend.pointsSpent || 0) > 0) {
    const who = String(topChoiceSpend.username || topChoiceSpend.displayName || "user").trim();
    const pointsSpent = Math.max(0, Math.floor(asNumber(topChoiceSpend.pointsSpent, 0)));
    if (topChoiceSpend.won) {
      completionKind = "winning_spend";
      completionMessage = formatPollCompletionTemplate(
        String(SETTINGS?.pollCompleteWinTemplate || "").trim() ||
          DEFAULT_POLL_COMPLETE_WIN_TEMPLATE,
        {
          user: who,
          channelPoints: pointsSpent,
          channelPointsName,
          winning: winnerTitle || topChoiceSpend.choiceTitle || "",
          title: pollTitle,
          channel: CHANNEL_NAME,
        }
      );
    } else {
      const tier = await getSubTierFromTwitch(topChoiceSpend.userId);
      const farmingRate = getFarmingRateForTier(tier);
      const yearsFromPoints = pointsSpent / farmingRate / (60 * 24 * 365);
      const cpToHours = ROBLOX_FUNCTIONS.timeToAgo(yearsFromPoints);
      completionKind = "losing_spend";
      completionMessage = formatPollCompletionTemplate(
        String(SETTINGS?.pollCompleteLossTemplate || "").trim() ||
          DEFAULT_POLL_COMPLETE_LOSS_TEMPLATE,
        {
          user: who,
          channelPoints: pointsSpent,
          channelPointsName,
          farmTime: String(cpToHours?.timeString || "").trim(),
          winning: winnerTitle || "",
          title: pollTitle,
          channel: CHANNEL_NAME,
        }
      );
    }
  }

  if (!completionMessage) {
    logger.log?.(
      `[pubsub][poll] completed without chat alert source=${source} id=${String(
        r.id || "unknown"
      )}`
    );
    return analyticsRows.length > 0;
  }

  try {
    await client.say(CHANNEL_NAME, completionMessage);
    logger.log?.(
      `[pubsub][poll] completion message sent kind=${completionKind || "unknown"} source=${source} id=${String(
        r.id || "unknown"
      )}`
    );
    return true;
  } catch (e) {
    logger.warn?.(
      `[pubsub][poll] completion message failed kind=${completionKind || "unknown"} source=${source} id=${String(
        r.id || "unknown"
      )}: ${String(e?.message || e)}`
    );
    return false;
  }
}

async function processLatestTerminalPoll(triggerType = "", source = "pubsub") {
  const r = await TWITCH_FUNCTIONS.getLatestPollData().catch((e) => {
    logger.warn?.(`[pubsub][poll] getLatestPollData failed (${source}): ${String(e?.message || e)}`);
    return null;
  });
  if (!r || r === "error" || typeof r !== "object") {
    logger.warn?.(`[pubsub][poll] no latest poll data (${source})`);
    return false;
  }

  const resolvedType = normalizeEventType(triggerType || r.status || "");
  if (!isPollTerminalStatus(resolvedType)) return false;

  const pollId = String(r.id || "latest");
  const signature = `${pollId}:${resolvedType}`;
  if (signature === lastProcessedPollSignature) {
    return false;
  }

  const ok = await processPollTerminalPayload(r, resolvedType, source);
  if (ok) lastProcessedPollSignature = signature;
  return ok;
}

function startPollFallbackMonitor() {
  if (!POLL_FALLBACK_ENABLED || pollFallbackTimer) return;
  logger.log?.(
    `[pubsub][poll] fallback monitor enabled (${POLL_FALLBACK_INTERVAL_MS}ms interval)`
  );
  pollFallbackTimer = setInterval(() => {
    if (stopped) return;
    void processLatestTerminalPoll("", "fallback_timer");
  }, POLL_FALLBACK_INTERVAL_MS);
  if (typeof pollFallbackTimer?.unref === "function") pollFallbackTimer.unref();
}

function scheduleReconnect(reason = "") {
  if (stopped || reconnectTimer) return;
  reconnectAttempt = Math.min(reconnectAttempt + 1, 8);
  const waitMs = Math.min(30_000, 1_000 * 2 ** (reconnectAttempt - 1));
  logger.warn(`[pubsub] reconnecting in ${waitMs}ms${reason ? ` (${reason})` : ""}`);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    StartListener();
  }, waitMs);
}

var ping = {};
ping.pinger = false;
ping.start = function () {
  ping.stop();
  ping.sendPing();

  ping.pinger = setInterval(function () {
    setTimeout(function () {
      ping.sendPing();
    }, Math.floor(Math.random() * 1000 + 1));
  }, 4 * 60 * 1000);
};
ping.stop = function () {
  if (ping.pinger) {
    clearInterval(ping.pinger);
    ping.pinger = false;
  }
  if (ping.pingtimeout) {
    clearTimeout(ping.pingtimeout);
    ping.pingtimeout = null;
  }
};
ping.sendPing = function () {
  try {
    if (pubsub?.readyState !== WebSocket.OPEN) return;
    pubsub.send(
      JSON.stringify({
        type: "PING",
      })
    );
    ping.awaitPong();
  } catch (e) {
    logger.warn("[pubsub] ping send failed:", String(e?.message || e));
    try {
      pubsub?.close?.();
    } catch {}
  }
};
ping.awaitPong = function () {
  clearTimeout(ping.pingtimeout);
  ping.pingtimeout = setTimeout(function () {
    logger.warn("[pubsub] pong timeout");
    try {
      pubsub?.close?.();
    } catch {}
  }, 10_000);
};

ping.gotPong = function () {
  clearTimeout(ping.pingtimeout);
  ping.pingtimeout = null;
};

var requestListen = function (topics, token, label = "topics") {
  if (!Array.isArray(topics) || topics.length === 0) return;
  if (!token) {
    logger.warn(`[pubsub] missing auth token for ${label}; skipping LISTEN`);
    return;
  }
  if (pubsub?.readyState !== WebSocket.OPEN) {
    logger.warn(`[pubsub] socket not open for ${label}; skipping LISTEN`);
    return;
  }
  const nonce = `${myname}-${Date.now()}-${Math.floor(Math.random() * 10_000)}`;
  const pck = {
    type: "LISTEN",
    nonce,
    data: {
      topics,
      auth_token: token,
    },
  };
  pendingListens.set(nonce, { topics, label });
  pubsub.send(JSON.stringify(pck));
};

const requestTopics = function (topics, token, label) {
  const deduped = [...new Set((topics || []).filter(Boolean))];
  for (const topic of deduped) {
    requestListen([topic], token, `${label}:${topic}`);
  }
};

var StartListener = function () {
  if (stopped) return;
  pubsub = new WebSocket("wss://pubsub-edge.twitch.tv");
  pubsub
    .on("close", function (code, reason) {
      ping.stop();
      if (stopped) return;
      const reasonText = Buffer.isBuffer(reason) ? reason.toString("utf8") : String(reason || "");
      logger.warn(`[pubsub] disconnected (code=${code || "unknown"}${reasonText ? `, reason=${reasonText}` : ""})`);
      scheduleReconnect("socket closed");
    })
    .on("open", function () {
      reconnectAttempt = 0;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      logger.log("[pubsub] connected");
      ping.start();
      runAuth();
      startPollFallbackMonitor();
    })
    .on("error", function (err) {
      logger.warn("[pubsub] websocket error:", String(err?.message || err));
    });
  pubsub.on("message", async function (raw_data) {
    refreshRuntimeState();

    const text = Buffer.isBuffer(raw_data)
      ? raw_data.toString("utf8")
      : String(raw_data ?? "");
    const packet = safeJsonParse(text, null);
    if (!packet || typeof packet !== "object") {
      logger.warn(`[pubsub] invalid packet: ${text.slice(0, 200)}`);
      return;
    }

    if (packet.type == "RECONNECT") {
      logger.log("[pubsub] RECONNECT requested by Twitch");
      try {
        pubsub?.close?.();
      } catch {}
    } else if (packet.type == "PONG") {
      ping.gotPong();
    } else if (packet.type == "RESPONSE") {
      const nonce = String(packet?.nonce || "");
      const listenMeta = pendingListens.get(nonce);
      if (nonce) pendingListens.delete(nonce);
      const label = listenMeta?.label || nonce || "unknown-listen";
      if (packet?.error) {
        logger.warn(`[pubsub] LISTEN failed (${label}): ${packet.error}`);
      } else {
        logger.log(`[pubsub] LISTEN ok (${label})`);
      }
    } else if (packet.type == "MESSAGE") {
      const packetData = packet?.data || {};
      const pubTopic = String(packetData?.topic || "");
      const pubMessage = packetData?.message;
      const messageData =
        typeof pubMessage === "string"
          ? safeJsonParse(pubMessage, {})
          : pubMessage && typeof pubMessage === "object"
            ? pubMessage
            : {};
      const rawType =
        String(
          messageData?.type ||
            messageData?.event?.type ||
            messageData?.data?.event?.type ||
            ""
        ).trim();
      const type = normalizeEventType(rawType);

      if (type === "STREAM_UP") {
        // TO DO = first person to go to stream gets free channel points
        await TWITCH_FUNCTIONS.setFollowersOnlyMode(false, 0, { preferredRole: "bot" }).catch((e) => {
          console.warn(
            "[helix] failed to disable followers-only (stream-up):",
            String(e?.message || e)
          );
        });
        liveUpHandler();
      } else if (type === "STREAM_DOWN") {
        await TWITCH_FUNCTIONS.setFollowersOnlyMode(true, 0, { preferredRole: "bot" }).catch((e) => {
          console.warn(
            "[helix] failed to enable followers-only (stream-down):",
            String(e?.message || e)
          );
        });
        await TWITCH_FUNCTIONS.setSlowMode(true, 5, { preferredRole: "bot" }).catch((e) => {
          console.warn(
            "[helix] failed to enable slow mode (stream-down):",
            String(e?.message || e)
          );
        });
        liveDownHandler();
      } else if (type === "VIEWCOUNT") {
        const streamData = STREAMS?.[streamNumber];
        if (streamData && typeof streamData === "object") {
          const viewers = Number(messageData?.viewers);
          const samples = Array.isArray(streamData.averageViewersPer30Seconds)
            ? streamData.averageViewersPer30Seconds
            : [];
          if (Number.isFinite(viewers)) {
            samples.push(viewers);
          }
          streamData.averageViewersPer30Seconds = samples.slice(-240);
          if (streamData.averageViewersPer30Seconds.length > 0) {
            let sum = 0;
            for (const sample of streamData.averageViewersPer30Seconds) {
              sum += Number(sample) || 0;
            }
            streamData.averageviewers =
              sum / streamData.averageViewersPer30Seconds.length;
          }
          fs.writeFileSync(STREAMS_PATH, JSON.stringify(STREAMS));
        }
      } else if (type === "AD_POLL_CREATE") {
        TWITCH_FUNCTIONS.onMultiplayerAdStart();
      } else if (type === "AD_POLL_COMPLETE") {
        const adData = messageData?.data?.poll || null;
        TWITCH_FUNCTIONS.onMultiplayerAdEnd(adData);
      } else if (type === "MODERATION_ACTION") {
        const followData = messageData?.data || {};
        const followChange = followData.moderation_action;
        const autoFocEnabled = SETTINGS?.autoFocOffEnabled !== false;
        const autoFocDelayMs = normalizeAutoFocOffDelayMs(
          SETTINGS?.autoFocOffDelayMs,
          WAIT_UNTIL_FOC_OFF
        );

        if (followChange == "followers") {
          // follow only mode gets enabled
          if (
            SETTINGS.ks == false &&
            (await TWITCH_FUNCTIONS.isLive()) == true
          ) {
            if (!autoFocEnabled) {
              logger.log("[pubsub] auto FOC OFF disabled; leaving followers-only enabled");
            } else {
              logger.log?.(
                `[pubsub] auto FOC OFF waiting ${Math.round(autoFocDelayMs / 1000)}s before disabling followers-only`
              );
              await delay(autoFocDelayMs);
              await TWITCH_FUNCTIONS.setFollowersOnlyMode(false, 0, { preferredRole: "bot" }).catch((e) => {
                console.warn(
                  "[helix] failed to disable followers-only (delayed):",
                  String(e?.message || e)
                );
              });
            }
          }
        } else if (followChange == "followersoff") {
          if (!SETTINGS.ks) {
          }
          // follow only mode gets disabled
        }
        if (followData.moderation_action == "untimeout") {
          const untimedoutUser = followData.target_user_login;
          FILTER_FUNCTIONS.onUntimedOut(untimedoutUser);
        }
      } else if (pubTopic == `stream-chat-room-v1.${CHANNEL_ID}`) {
        // // if(pubMessage.data.room.modes.followers_)
        // var modeData = JSON.parse(pubMessage).data.room.modes
        // if (modeData.emote_only_mode_enabled == true) {
        //   console.log('emote only enabled')
        // } else if (modeData.subscribers_only_mode_enabled == true) {
        //   console.log('sub only mode enabled')
        // }
      } else if (pubTopic == `ads.${CHANNEL_ID}`) {
        if (SETTINGS.ks == false) {
          client.say(
            CHANNEL_NAME,
            `An ad has been ran, subscribe with prime for free and enjoy watching with 0 ads all month for free, !prime for more info EZ PogU .`
          );
        }
      } else if (pubTopic == `community-moments-channel-v1.${CHANNEL_ID}`) {
        if (SETTINGS.ks == false) {
          const text = `${bot} A new moment PagMan everyone claim it while you can PogU .`;
          await TWITCH_FUNCTIONS.sendHelixAnnouncement(text).catch((e) => {
            console.warn("[helix] announcement failed:", String(e?.message || e));
            client.say(CHANNEL_NAME, text);
          });
        }
      } else if (
        pubTopic == `polls.${CHANNEL_ID}` &&
        (type === "POLL_CREATE" ||
          type === "POLL_CREATED" ||
          type === "EVENT_CREATED" ||
          type === "CREATE")
      ) {
        void maybeAnnouncePollCreated(
          extractPollPayloadFromMessage(messageData),
          "pubsub_event"
        );
      } else if (
        type === "POLL_COMPLETE" ||
        type === "POLL_TERMINATE" ||
        type === "POLL_ARCHIVE"
      ) {
        logger.log?.(
          `[pubsub][poll] terminal event received: ${rawType || "(unknown)"} topic=${pubTopic}`
        );
        void processLatestTerminalPoll(type, "pubsub_event");
      } else if (pubTopic == `predictions-channel-v1.${CHANNEL_ID}`) {
        if (type === "EVENT_CREATED") {
        } else if (type === "EVENT_UPDATED") {
          const event = messageData?.data?.event || {};

          const status = event.status;

          if (status == "RESOLVED") {
            const handled = await processPredictionResolvedEvent(
              event,
              "pubsub_event_payload"
            );

            if (!handled) {
              const predictionData =
                await TWITCH_FUNCTIONS.getLatestPredictionData().catch(() => null);
              const latestEvent =
                predictionData?.data?.community?.channel?.prediction?.event ||
                predictionData?.data?.community?.channel?.prediction?.activeEvent ||
                predictionData?.data?.prediction?.event ||
                null;
              if (latestEvent && typeof latestEvent === "object") {
                await processPredictionResolvedEvent(
                  latestEvent,
                  "pubsub_prediction_context"
                );
              }
            }
          }
        }
      } else if (pubTopic == `community-points-channel-v1.${CHANNEL_ID}`) {
        if (type === "REWARD_REDEEMED") {
          const vipEntry = "42693bf2-9dea-40a5-8a7c-7d088d220d21";
          const timeout = "efa070b5-6d12-4cc6-8ef8-160eded1fdec";
          const subonly = "f799d602-205b-4865-94a3-18b939d4c8ae";
          const emoteonly = "27e600a4-1b2e-4ce3-b969-55e7cf89421f";
          const remotesuboremote = "d08999ad-8338-4270-b306-f28d893a3676";
          const removeoraddhat = "77ac0ea867ac50fb6e65f3839af51a31";
          const skipSong = "c1177786-2fec-47bd-9500-530c239220da";
          const first = "0c4a5827-15f4-4a58-885e-14d785024e5b";

          const redemption = messageData?.data?.redemption || {};
          const redemptionId = redemption?.reward?.id;
          const userInputRaw = String(redemption?.user_input || "").trim();
          const twitchUsername = String(redemption?.user?.login || "").trim() || "unknown";
          const twitchUserId = String(redemption?.user?.id || "").trim();
          const twitchDisplayName = String(
            redemption?.user?.display_name ||
              redemption?.user?.displayName ||
              twitchUsername
          ).trim();
          const rewardCost = Math.max(
            0,
            Math.floor(Number(redemption?.reward?.cost || 0) || 0)
          );

          if (rewardCost > 0) {
            const tier = await getSubTierFromTwitch(twitchUserId);
            queueChannelPointEvents({
              ts: new Date().toISOString(),
              source: "pubsub",
              type: "reward_redeem",
              userId: twitchUserId,
              login: twitchUsername,
              displayName: twitchDisplayName,
              pointsSpent: rewardCost,
              pointsLost: 0,
              subTier: Number.isFinite(tier) ? Number(tier) : 0,
              meta: {
                rewardId: String(redemptionId || "").trim() || null,
                rewardTitle: String(redemption?.reward?.title || "").trim() || null,
                channelId: CHANNEL_ID,
              },
            });
          }

          if (redemptionId == vipEntry) {
            SETTINGS = readJsonFile(SETTINGS_PATH, SETTINGS || {});
            if (SETTINGS.currentMode == '!ticket.on') {
                const userInput = userInputRaw.split(/\s+/)[0];

                if (!userInput) {
                  return client.say(
                    CHANNEL_NAME,
                    `@${twitchUsername}, please include a Roblox username in your ticket redemption.`
                  );
                }

                const cooldownRemainingMs = Math.max(
                  0,
                  getRobloxFriendCooldownRemainingMs()
                );
                if (cooldownRemainingMs > 0) {
                  const seconds = Math.max(1, Math.ceil(cooldownRemainingMs / 1000));
                  return client.say(
                    CHANNEL_NAME,
                    `@${twitchUsername}, friend requests are on cooldown (${seconds}s left), please retry.`
                  );
                }

                const result = await addTrackedRobloxFriend({
                  targetName: userInput,
                  requestedBy: twitchUsername,
                  permanent: false,
                  source: "ticket_redemption",
                });

                if (
                  result.status === "invalid_username" ||
                  result.status === "missing_username"
                ) {
                  return client.say(
                    CHANNEL_NAME,
                    `@${twitchUsername}, '${userInput}' is not a valid Roblox username.`
                  );
                }

                if (result.status === "validate_error") {
                  return client.say(
                    CHANNEL_NAME,
                    `@${twitchUsername}, username validation failed, please retry.`
                  );
                }

                if (result.status === "rate_limited") {
                  return client.say(
                    CHANNEL_NAME,
                    `@${twitchUsername}, Roblox rate limited me, please retry in a bit.`
                  );
                }

                if (result.status === "send_error") {
                  return client.say(
                    CHANNEL_NAME,
                    `@${twitchUsername}, could not send friend request right now.`
                  );
                }

                if (result.status === "already") {
                  return client.say(
                    CHANNEL_NAME,
                    `@${twitchUsername}, '${result.username}' is already friended and has been tracked for cleanup.`
                  );
                }

                client.say(CHANNEL_NAME, `@${twitchUsername}, sent a friend request to ${result.username}.`);
              }
            }

          if (redemptionId == subonly) {
            await TWITCH_FUNCTIONS.setSubscriberMode(true).catch((e) => {
              console.warn(
                "[helix] failed to enable subscriber-only mode:",
                String(e?.message || e)
              );
            });
            client.say(CHANNEL_NAME, "EZY Clap non-subs");
            await delay(5 * 60 * 1000);
            await TWITCH_FUNCTIONS.setSubscriberMode(false).catch((e) => {
              console.warn(
                "[helix] failed to disable subscriber-only mode:",
                String(e?.message || e)
              );
            });
            client.say(CHANNEL_NAME, `The chat is no longer in sub only. THE NON SUBS ARE FREE PagMan`);
          }

          if (redemptionId == emoteonly) {
            await TWITCH_FUNCTIONS.setEmoteMode(true).catch((e) => {
              console.warn(
                "[helix] failed to enable emote-only mode:",
                String(e?.message || e)
              );
            });
            client.say(CHANNEL_NAME, `The chat is now in emote only for 5 minutes.`);
            await delay(5 * 60 * 1000);
            await TWITCH_FUNCTIONS.setEmoteMode(false).catch((e) => {
              console.warn(
                "[helix] failed to disable emote-only mode:",
                String(e?.message || e)
              );
            });
            client.say(CHANNEL_NAME, `The chat is no longer in emote only.`);
          }
          
          if (redemptionId == remotesuboremote) {
            await TWITCH_FUNCTIONS.setEmoteMode(false).catch((e) => {
              console.warn(
                "[helix] failed to disable emote-only mode:",
                String(e?.message || e)
              );
            });
            await TWITCH_FUNCTIONS.setSubscriberMode(false).catch((e) => {
              console.warn(
                "[helix] failed to disable subscriber-only mode:",
                String(e?.message || e)
              );
            });
          }

          if (redemptionId == timeout) {
            const userInputSplit = userInputRaw.split(/\s+/).filter(Boolean);
            const timeoutTarget = userInputSplit[0];
            if (!timeoutTarget) {
              client.say(CHANNEL_NAME, `@${twitchUsername}, include a username to timeout.`);
              return;
            }

            client.say(
              CHANNEL_NAME,
              `${timeoutTarget} was timed out for 60 seconds by ${twitchUsername} via timeout redemption.`
            );
            await TWITCH_FUNCTIONS.timeoutUserByLogin(
              timeoutTarget,
              60,
              `[AUTOMATIC] ${twitchUsername} redeemed a timeout on you.`
            ).catch((e) => {
              console.warn(
                "[helix] timeout failed:",
                String(e?.message || e)
              );
            });
          }

          if (redemptionId == removeoraddhat) {
            await delay(30 * 60 * 1000);
            client.say(CHANNEL_NAME, `@${CHANNEL_NAME} 30 minutes has passed since ${twitchUsername} redeemed the hat redemption.`);
          }

          if (redemptionId == skipSong) {
            if (isSpotifyModuleEnabled()) {
              SPOTIFY.skipNext().catch(() => null);
              client.say(CHANNEL_NAME, `${twitchUsername}, song skipped.`);
            } else {
              client.say(CHANNEL_NAME, `${twitchUsername}, Spotify module is disabled.`);
            }
          }

          if (redemptionId == first) {
            if (!twitchUserId) {
              logger.warn("[pubsub] first redemption missing user id");
            } else {
              await TWITCH_FUNCTIONS.addPajbotPointsById(twitchUserId, 25_000);
              client.say(CHANNEL_NAME, `@${twitchDisplayName} got 25,000 basement points for being first!`);
            }
          }
        }
      }
    }
  });
};

var runAuth = function () {
  pendingListens.clear();

  const streamerTopics = [
    `ads.${CHANNEL_ID}`,
    `leaderboard-events-v1.${CHANNEL_ID}`,
    `community-moments-channel-v1.${CHANNEL_ID}`,
    `community-points-channel-v1.${CHANNEL_ID}`,
    `predictions-channel-v1.${CHANNEL_ID}`,
    `polls.${CHANNEL_ID}`,
    `stream-chat-room-v1.${CHANNEL_ID}`,
    `upload.${CHANNEL_ID}`,
    `video-playback.${CHANNEL_ID}`,
    `video-playback-by-id.${CHANNEL_ID}`,
  ];

  const botTopics = [
    BOT_ID ? `chat_moderator_actions.${BOT_ID}.${CHANNEL_ID}` : "",
    BOT_ID ? `channel-unban-requests.${BOT_ID}.${CHANNEL_ID}` : "",
    BOT_ID ? `whispers.${BOT_ID}` : "",
  ];

  const streamerToken = STREAMER_OAUTH || BOT_OAUTH;
  const botToken = BOT_OAUTH || STREAMER_OAUTH;

  if (!STREAMER_OAUTH && BOT_OAUTH) {
    logger.warn("[pubsub] streamerOauth missing, falling back to botOauth for channel topics");
  }
  if (!BOT_OAUTH && STREAMER_OAUTH) {
    logger.warn("[pubsub] botOauth missing, falling back to streamerOauth for bot topics");
  }

  requestTopics(streamerTopics, streamerToken, "streamer");
  requestTopics(botTopics, botToken, "bot");
};
StartListener();


  return {
    stop() {
      stopped = true;
      ping.stop();
      if (pollFallbackTimer) {
        clearInterval(pollFallbackTimer);
        pollFallbackTimer = null;
      }
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      pendingListens.clear();
      try {
        pubsub?.close?.();
      } catch {}
    },
  };
}
