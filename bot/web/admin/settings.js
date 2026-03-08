export const DEFAULT_MODE_DEFINITIONS = {
  "!join.on": {
    responseCommand: "!join",
    timerMessage: "type !join to join the game",
    title: "!JOIN IN {game}",
    gameName: "Roblox",
    keywordKey: "join",
    recapSpamCount: 0,
    recapMessage: "",
  },
  "!ticket.on": {
    responseCommand: "!ticket",
    timerMessage: "type !ticket to join the game",
    title: "!TICKET IN {game}",
    gameName: "Roblox",
    keywordKey: "ticket",
    recapSpamCount: 0,
    recapMessage: "",
  },
  "!link.on": {
    responseCommand: "!link",
    timerMessage: "type !link to get the link to join",
    title: "!LINK IN {game}",
    gameName: "Roblox",
    keywordKey: "link",
    recapSpamCount: 0,
    recapMessage: "",
  },
  "!1v1.on": {
    responseCommand: "!1v1",
    timerMessage: "type 1v1 in chat once to get a chance to 1v1 the streamer",
    title: "1V1S IN {game}",
    gameName: "Roblox",
    keywordKey: "1v1",
    recapSpamCount: 0,
    recapMessage: "",
  },
  "!reddit.on": {
    responseCommand: "!reddit",
    timerMessage: "type !reddit for the recap",
    title: "REDDIT RECAP",
    gameName: "",
    keywordKey: "reddit",
    recapSpamCount: 3,
    recapMessage: "REDDIT RECAP TIME: {url}",
  },
};

export const HARD_CODED_MODE_COMMANDS = Object.freeze(Object.keys(DEFAULT_MODE_DEFINITIONS));

const MIN_AUTO_FOC_OFF_DELAY_MS = 60_000;
const DEFAULT_SPOTIFY_ANNOUNCE_TEMPLATE = "{streamerDisplay} is now listening to {track}";
const DEFAULT_POLL_ANNOUNCE_TEMPLATE = "New poll! {title} :: {options}{extraVotes}";
const DEFAULT_POLL_COMPLETE_NO_POINTS_TEMPLATE =
  "Poll has ended {winning} has won the poll! Nobody dumped any {channelPointsName} Sadge";
const DEFAULT_POLL_COMPLETE_LOSS_TEMPLATE =
  "RIPBOZO @{user} just lost {channelPoints} {channelPointsName} thats {farmTime} of farming";
const DEFAULT_POLL_COMPLETE_WIN_TEMPLATE =
  "PogU @{user} just spent {channelPoints} {channelPointsName}";
const DEFAULT_SPECIAL_MODES = [
  "!ks.on",
  "!ks.off",
  "!timer.on",
  "!timer.off",
  "!keywords.on",
  "!keywords.off",
  "!timers.off",
  "!timers.on",
  "!autofoc.on",
  "!autofoc.off",
  "!follower.on",
  "!follower.off",
  "!followers.on",
  "!followers.off",
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

export function normalizeModeCommand(value) {
  let out = String(value || "").trim().toLowerCase();
  if (!out) return "";
  if (!out.startsWith("!")) out = `!${out}`;
  if (!out.endsWith(".on")) out = `${out.replace(/\.off$/i, "")}.on`;
  return out;
}

export function modeKeyFromCommand(modeCommand) {
  return normalizeModeCommand(modeCommand).replace(/^!/, "").replace(/\.on$/i, "");
}

function deriveModeResponseCommand(modeCommand, fallback = "") {
  const existing = String(fallback == null ? "" : fallback).trim();
  if (existing) return existing;
  const modeKey = modeKeyFromCommand(modeCommand);
  return modeKey ? `!${modeKey}` : "";
}

export function sanitizeSettingsForStorage(input = {}) {
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
  out.spotifyAnnounceEnabled = bool(out.spotifyAnnounceEnabled, false);
  out.spotifyAnnounceTemplate = str(
    out.spotifyAnnounceTemplate,
    DEFAULT_SPOTIFY_ANNOUNCE_TEMPLATE
  );
  if (!out.spotifyAnnounceTemplate) {
    out.spotifyAnnounceTemplate = DEFAULT_SPOTIFY_ANNOUNCE_TEMPLATE;
  }
  out.spotifyAnnounceEmote = str(out.spotifyAnnounceEmote, "");
  out.pollAnnounceEnabled = bool(out.pollAnnounceEnabled, false);
  out.pollAnnounceTemplate = str(
    out.pollAnnounceTemplate,
    DEFAULT_POLL_ANNOUNCE_TEMPLATE
  );
  if (!out.pollAnnounceTemplate) {
    out.pollAnnounceTemplate = DEFAULT_POLL_ANNOUNCE_TEMPLATE;
  }
  out.pollAnnounceChannelPointsName = str(
    out.pollAnnounceChannelPointsName,
    "channel points"
  );
  if (!out.pollAnnounceChannelPointsName) {
    out.pollAnnounceChannelPointsName = "channel points";
  }
  out.pollCompleteNoPointsTemplate = str(
    out.pollCompleteNoPointsTemplate,
    DEFAULT_POLL_COMPLETE_NO_POINTS_TEMPLATE
  );
  if (!out.pollCompleteNoPointsTemplate) {
    out.pollCompleteNoPointsTemplate = DEFAULT_POLL_COMPLETE_NO_POINTS_TEMPLATE;
  }
  out.pollCompleteLossTemplate = str(
    out.pollCompleteLossTemplate,
    DEFAULT_POLL_COMPLETE_LOSS_TEMPLATE
  );
  if (!out.pollCompleteLossTemplate) {
    out.pollCompleteLossTemplate = DEFAULT_POLL_COMPLETE_LOSS_TEMPLATE;
  }
  out.pollCompleteWinTemplate = str(
    out.pollCompleteWinTemplate,
    DEFAULT_POLL_COMPLETE_WIN_TEMPLATE
  );
  if (!out.pollCompleteWinTemplate) {
    out.pollCompleteWinTemplate = DEFAULT_POLL_COMPLETE_WIN_TEMPLATE;
  }

  out.filterExemptions = arrStr(out.filterExemptions);
  out.bots = arrStr(out.bots);
  out.joinTimer = bool(out.joinTimer, true);
  out.gamesPlayedCount = int(out.gamesPlayedCount, 5);
  out.autoFocOffEnabled = bool(out.autoFocOffEnabled, true);
  out.autoFocOffDelayMs = Math.max(
    MIN_AUTO_FOC_OFF_DELAY_MS,
    int(out.autoFocOffDelayMs, MIN_AUTO_FOC_OFF_DELAY_MS)
  );

  out.timer = obj(out.timer, {});
  out.main = obj(out.main, {});
  out.nonFollowers = obj(out.nonFollowers, {
    join: "click the follow button on twitch to get access to the join command",
  });

  out.validModes = arrStr(out.validModes)
    .map((mode) => normalizeModeCommand(mode))
    .filter(Boolean);
  out.specialModes = [
    ...DEFAULT_SPECIAL_MODES,
    ...arrStr(out.specialModes),
  ].filter((mode, index, list) => list.indexOf(mode) === index);
  out.customModes = [
    ...DEFAULT_CUSTOM_MODES,
    ...arrStr(out.customModes),
  ].filter((mode, index, list) => list.indexOf(mode) === index);
  out.ignoreModes = [
    ...DEFAULT_IGNORE_MODES,
    ...arrStr(out.ignoreModes),
  ].filter((mode, index, list) => list.indexOf(mode) === index);

  const modesInput =
    out.modes && typeof out.modes === "object" && !Array.isArray(out.modes) ? out.modes : {};
  const modeCommandSeed = new Set([
    ...HARD_CODED_MODE_COMMANDS,
    ...out.validModes,
    ...Object.keys(modesInput)
      .map((mode) => normalizeModeCommand(mode))
      .filter(Boolean),
  ]);
  const normalizedModes = {};

  for (const rawModeCommand of modeCommandSeed) {
    const modeCommand = normalizeModeCommand(rawModeCommand);
    if (!modeCommand) continue;
    const isHardcoded = HARD_CODED_MODE_COMMANDS.includes(modeCommand);
    const modeKey = modeKeyFromCommand(modeCommand);
    const defaults = DEFAULT_MODE_DEFINITIONS[modeCommand] || {};
    const raw =
      (modesInput[rawModeCommand] &&
      typeof modesInput[rawModeCommand] === "object" &&
      !Array.isArray(modesInput[rawModeCommand])
        ? modesInput[rawModeCommand]
        : null) ||
      (modesInput[modeCommand] &&
      typeof modesInput[modeCommand] === "object" &&
      !Array.isArray(modesInput[modeCommand])
        ? modesInput[modeCommand]
        : null) ||
      {};

    const responseCommand = deriveModeResponseCommand(
      modeCommand,
      raw.responseCommand || raw.command || out?.main?.[modeKey] || defaults.responseCommand
    );
    const timerMessage = str(
      raw.timerMessage || raw.timer || out?.timer?.[modeKey] || defaults.timerMessage,
      ""
    );
    const title = str(raw.title || out?.titles?.[modeKey] || defaults.title, "");
    const gameName = str(
      raw.gameName || raw.game || out?.modeGames?.[modeCommand] || defaults.gameName,
      ""
    );
    const keywordKey = isHardcoded
      ? str(defaults.keywordKey || modeKey, modeKey)
      : str(defaults.keywordKey || raw.keywordKey || raw.keyword || modeKey, modeKey);
    const recapSpamCount = int(
      raw.recapSpamCount != null ? raw.recapSpamCount : defaults.recapSpamCount,
      0
    );
    const recapMessage = str(raw.recapMessage || defaults.recapMessage || "", "");

    normalizedModes[modeCommand] = {
      command: modeCommand,
      key: modeKey,
      responseCommand,
      timerMessage,
      title,
      gameName,
      keywordKey,
      recapSpamCount,
      recapMessage,
    };
  }

  out.modes = normalizedModes;
  out.validModes = [
    ...HARD_CODED_MODE_COMMANDS,
    ...Object.keys(normalizedModes).filter((mode) => !HARD_CODED_MODE_COMMANDS.includes(mode)),
  ].filter((mode, index, arr) => arr.indexOf(mode) === index && normalizedModes[mode]);
  if (!out.validModes.length) out.validModes = [...HARD_CODED_MODE_COMMANDS];
  if (!out.validModes.includes(out.currentMode)) {
    out.currentMode = out.validModes[0] || "!join.on";
  }
  out.corrections = obj(out.corrections, {});
  out.titles = obj(out.titles, {});
  out.modeGames = obj(out.modeGames, {});
  for (const modeCommand of Object.keys(out.modes)) {
    const modeDef = out.modes[modeCommand];
    const key = String(modeDef?.key || "").trim();
    if (!key) continue;
    if (modeDef?.timerMessage) out.timer[key] = String(modeDef.timerMessage || "");
    if (modeDef?.responseCommand) out.main[key] = String(modeDef.responseCommand || "");
    if (modeDef?.title) out.titles[key] = String(modeDef.title || "");
    if (modeDef?.gameName) out.modeGames[modeCommand] = String(modeDef.gameName || "");
  }
  for (const [k, v] of Object.entries(out.modeGames)) {
    const key = String(k || "").trim();
    const val = String(v || "").trim();
    if (!key || !val) {
      delete out.modeGames[k];
    } else {
      out.modeGames[key] = val;
    }
  }

  delete out.subathonDay;
  delete out.account;
  delete out.gameChangeTime;
  delete out.lastGameExitTime;
  delete out.followerOnlyMode;
  delete out.discordRobloxLogging;
  delete out.responseCount;
  delete out.chatArray;

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
