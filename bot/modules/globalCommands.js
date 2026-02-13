import { setTimeout as delay } from "timers/promises";

function formatBotUptimeShort(totalSeconds) {
  const safeSeconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const days = Math.floor(safeSeconds / 86400);
  const hours = Math.floor((safeSeconds % 86400) / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;
  const parts = [];

  if (days > 0) parts.push(`${days}d`);
  if (hours > 0 || days > 0) parts.push(`${hours}h`);
  if (minutes > 0 || hours > 0 || days > 0) parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);

  return parts.join(" ");
}

function replyRaw({ client, channelName, userstate, text }) {
  const nonce = userstate?.["client-nonce"] || "";
  const parentId = userstate?.["id"] || "";
  return client.raw(
    `@client-nonce=${nonce};reply-parent-msg-id=${parentId} PRIVMSG #${channelName} :${text}`
  );
}

export async function tryHandleGlobalCommands({
  client,
  channelName,
  userstate,
  message,
  botPrefix = "",
  version = "",
  webPublicUrl = "",
  twitchFunctions = null,
  isSharedCommandCooldownActive = null,
  isMod = false,
} = {}) {
  if (!client || typeof client.raw !== "function") return false;
  const chan = String(channelName || "").trim().replace(/^#/, "");
  if (!chan) return false;

  const lower = String(message || "").toLowerCase().trim();
  if (!lower) return false;

  const isPingCommand = lower === "!ping";
  const isVersionCommand = lower === "!version";
  const isDiceCommand = lower === "!dice";
  const isRussianRouletteCommand =
    lower === "!russianrolette" || lower === "!russianroulette" || lower === "!rr";
  const isComsCommand =
    lower === "!commands" ||
    lower === "!cmds" ||
    lower === "!help" ||
    lower === "!cmdlist" ||
    lower === "!comlist" ||
    lower === "!commandlist" ||
    lower === "!listcmds";

  const isCooldownManaged =
    isPingCommand ||
    isVersionCommand ||
    isDiceCommand ||
    isRussianRouletteCommand ||
    isComsCommand;

  if (
    isCooldownManaged &&
    typeof isSharedCommandCooldownActive === "function" &&
    isSharedCommandCooldownActive(userstate)
  ) {
    return true;
  }

  if (isPingCommand) {
    const botUptime = formatBotUptimeShort(process.uptime());
    replyRaw({
      client,
      channelName: chan,
      userstate,
      text: `${botPrefix} Pong! Bot uptime: ${botUptime}.`,
    });
    return true;
  }

  if (isVersionCommand) {
    replyRaw({
      client,
      channelName: chan,
      userstate,
      text: `${botPrefix} MainsBot - Javascript | ${version}`,
    });
    return true;
  }

  if (isDiceCommand) {
    client.say(chan, "Rolling Dice...");
    await delay(1.5 * 1000);
    replyRaw({
      client,
      channelName: chan,
      userstate,
      text: `${botPrefix} The Dice lands on ${Math.floor(Math.random() * 7)}.`,
    });
    return true;
  }

  if (isRussianRouletteCommand) {
    const twitchDisplayName = String(userstate?.["display-name"] || userstate?.username || "someone");
    const twitchUsername = String(userstate?.["username"] || "").trim();

    const chamber = Math.floor(Math.random() * 6) + 1;
    const hasModImmunity = Boolean(isMod);
    const died = !hasModImmunity && chamber === 1;

    if (!died) {
      replyRaw({
        client,
        channelName: chan,
        userstate,
        text: `${botPrefix}The trigger is pulled. ${twitchUsername} survives! PogU`,
      });
      return true;
    }

    const timeoutSeconds = Math.floor(Math.random() * 60) + 1;
    if (twitchUsername && twitchFunctions?.timeoutUser) {
      await twitchFunctions.timeoutUser(twitchUsername, "Your Dead.", timeoutSeconds);
    }
    replyRaw({
      client,
      channelName: chan,
      userstate,
      text: `${botPrefix}The trigger is pulled. A bullet fired. F for ${twitchDisplayName} FeelsBadMan .`,
    });
    return true;
  }

  if (isComsCommand) {
    const url = webPublicUrl ? String(webPublicUrl).replace(/\/+$/, "") : "";
    const msg = url
      ? `There is a list of commands at ${url}`
      : "There is a list of commands on the bot website.";
    replyRaw({
      client,
      channelName: chan,
      userstate,
      text: `${botPrefix}${msg}`,
    });
    return true;
  }

  return false;
}

