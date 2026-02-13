import fs from "fs";

function replyRaw(client, channelName, userstate, text) {
  if (!client) return;
  const channel = String(channelName || "").trim().replace(/^#/, "");
  if (!channel) return;
  client.raw(
    `@client-nonce=${userstate?.["client-nonce"]};reply-parent-msg-id=${userstate?.["id"]} ` +
      `PRIVMSG #${channel} :${text}`
  );
}

export function getContextKillswitchState(settings) {
  return !!settings?.ks;
}

export function handleKillswitchToggle({
  client,
  lowerMessage,
  channelName,
  userstate,
  settings,
  settingsPath = "./SETTINGS.json",
} = {}) {
  const msg = String(lowerMessage || "").trim().toLowerCase();
  if (msg !== "!ks.on" && msg !== "!ks.off") return false;

  if (!settings || typeof settings !== "object") return false;

  if (msg === "!ks.on") {
    if (settings.ks === true) {
      replyRaw(client, channelName, userstate, "Killswitch is already on.");
      return true;
    }
    settings.ks = true;
    fs.writeFileSync(settingsPath, JSON.stringify(settings));
    replyRaw(
      client,
      channelName,
      userstate,
      `@${String(channelName || "").replace(/^#/, "")}, Killswitch is on, the bot will not be actively moderating.`
    );
    return true;
  }

  if (msg === "!ks.off") {
    if (settings.ks === false) {
      replyRaw(client, channelName, userstate, "Killswitch is already off.");
      return true;
    }
    settings.ks = false;
    fs.writeFileSync(settingsPath, JSON.stringify(settings));
    replyRaw(
      client,
      channelName,
      userstate,
      `@${String(channelName || "").replace(/^#/, "")}, Killswitch is off, the bot will be actively moderating.`
    );
    return true;
  }

  return false;
}

export function handleKeywordsToggle({
  client,
  lowerMessage,
  channelName,
  userstate,
  settings,
  settingsPath = "./SETTINGS.json",
} = {}) {
  const msg = String(lowerMessage || "").trim().toLowerCase();
  if (msg !== "!keywords.on" && msg !== "!keywords.off") return false;

  if (!settings || typeof settings !== "object") return false;

  if (msg === "!keywords.on") {
    if (settings.keywords === true) {
      replyRaw(client, channelName, userstate, "Keywords are already enabled.");
      return true;
    }
    settings.keywords = true;
    fs.writeFileSync(settingsPath, JSON.stringify(settings));
    replyRaw(
      client,
      channelName,
      userstate,
      `@${String(channelName || "").replace(/^#/, "")}, Keywords are now enabled.`
    );
    return true;
  }

  if (msg === "!keywords.off") {
    if (settings.keywords === false) {
      replyRaw(client, channelName, userstate, "Keywords are already disabled.");
      return true;
    }
    settings.keywords = false;
    fs.writeFileSync(settingsPath, JSON.stringify(settings));
    replyRaw(
      client,
      channelName,
      userstate,
      `@${String(channelName || "").replace(/^#/, "")}, Keywords are now disabled.`
    );
    return true;
  }

  return false;
}

export function handleTimersToggle({
  client,
  lowerMessage,
  channelName,
  botPrefix = "",
  userstate,
  settings,
  settingsPath = "./SETTINGS.json",
} = {}) {
  const msg = String(lowerMessage || "").trim().toLowerCase();
  const isOn = msg === "!timer.on" || msg === "!timers.on";
  const isOff = msg === "!timer.off" || msg === "!timers.off";
  if (!isOn && !isOff) return false;

  if (!settings || typeof settings !== "object") return false;

  if (isOn) {
    if (settings.timers === true) {
      replyRaw(client, channelName, userstate, `${botPrefix}Timers are already on.`);
      return true;
    }
    settings.timers = true;
    fs.writeFileSync(settingsPath, JSON.stringify(settings));
    replyRaw(
      client,
      channelName,
      userstate,
      `${botPrefix}@${String(channelName || "").replace(/^#/, "")}, Timers are now on.`
    );
    return true;
  }

  if (isOff) {
    if (settings.timers === false) {
      replyRaw(client, channelName, userstate, `${botPrefix}Timers are already off.`);
      return true;
    }
    settings.timers = false;
    fs.writeFileSync(settingsPath, JSON.stringify(settings));
    replyRaw(
      client,
      channelName,
      userstate,
      `${botPrefix}@${String(channelName || "").replace(/^#/, "")}, Timers are now off.`
    );
    return true;
  }

  return false;
}

