import fs from "fs";

function rawReply(client, channelName, userstate, text) {
  const chan = String(channelName || "").replace(/^#/, "");
  if (!chan) return;
  client.raw(
    `@client-nonce=${userstate?.["client-nonce"]};reply-parent-msg-id=${userstate?.["id"]} ` +
      `PRIVMSG #${chan} :${text}`
  );
}

export function handleFilterToggles({
  client,
  message,
  userstate,
  channelName,
  settings,
  settingsPath = "./SETTINGS.json",
} = {}) {
  if (!client || typeof client.raw !== "function") return { updated: false, settings: null };
  if (!settings || typeof settings !== "object") return { updated: false, settings: null };

  const messageArray = String(message || "").toLowerCase().split(" ");
  const cmd = messageArray[0] || "";

  if (
    !(
      cmd === "!spamfilter.on" ||
      cmd === "!spamfilter.off" ||
      cmd === "!lengthfilter.on" ||
      cmd === "!lengthfilter.off" ||
      cmd === "!linkfilter.on" ||
      cmd === "!linkfilter.off"
    )
  ) {
    return { updated: false, settings: null };
  }

  const next = settings;

  if (cmd === "!spamfilter.on") {
    if (next.spamFilter === true) {
      rawReply(client, channelName, userstate, "Spam filter is already on.");
      return { updated: false, settings: null };
    }
    next.spamFilter = true;
    rawReply(client, channelName, userstate, "Spam filter is now on.");
  } else if (cmd === "!spamfilter.off") {
    if (next.spamFilter === false) {
      rawReply(client, channelName, userstate, "Spam filter is already off.");
      return { updated: false, settings: null };
    }
    next.spamFilter = false;
    rawReply(client, channelName, userstate, "Spam filter is now off.");
  } else if (cmd === "!lengthfilter.on") {
    if (next.lengthFilter === true) {
      rawReply(client, channelName, userstate, "Length filter is already on.");
      return { updated: false, settings: null };
    }
    next.lengthFilter = true;
    rawReply(client, channelName, userstate, "Length filter is now on.");
  } else if (cmd === "!lengthfilter.off") {
    if (next.lengthFilter === false) {
      rawReply(client, channelName, userstate, "Length filter is already off.");
      return { updated: false, settings: null };
    }
    next.lengthFilter = false;
    rawReply(client, channelName, userstate, "Length filter is now off.");
  } else if (cmd === "!linkfilter.on") {
    if (next.linkFilter === true) {
      rawReply(client, channelName, userstate, "Link filter is already on.");
      return { updated: false, settings: null };
    }
    next.linkFilter = true;
    rawReply(client, channelName, userstate, "Link filter is now on.");
  } else if (cmd === "!linkfilter.off") {
    if (next.linkFilter === false) {
      rawReply(client, channelName, userstate, "Link filter is already off.");
      return { updated: false, settings: null };
    }
    next.linkFilter = false;
    rawReply(client, channelName, userstate, "Link filter is now off.");
  }

  try {
    fs.writeFileSync(settingsPath, JSON.stringify(next));
  } catch {}

  return { updated: true, settings: next };
}

