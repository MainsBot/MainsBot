import fs from "fs";

function readLinkMode() {
  const raw = String(process.env.LINK_MODE ?? "").trim();
  const n = raw ? Number(raw) : 1;
  if (n === 0) return 0;
  if (n === 2) return 2;
  return 1;
}

function readLinkProvider() {
  const raw = String(process.env.LINK_PROVIDER ?? "").trim().toLowerCase();
  if (raw === "nightbot" || raw === "nb") return "nightbot";
  return "fossabot";
}

function readLinkCommandName() {
  const cmd = String(process.env.LINK_COMMAND_NAME || "!link").trim();
  return cmd || "!link";
}

function readMobileHowToUrl() {
  return String(process.env.LINK_MOBILE_HOWTO_URL || "https://youtu.be/MJJ89F_DzEE").trim();
}

function isRobloxPrivateServerLink(token) {
  try {
    token = String(token || "").replace(/[)\],.>]+$/g, "");
    if (!token) return false;
    const u = new URL(token);

    const hostOk = u.hostname === "roblox.com" || u.hostname === "www.roblox.com";
    if (!hostOk) return false;

    const isShareServer =
      u.pathname === "/share" &&
      u.searchParams.has("code") &&
      (u.searchParams.get("type") || "").toLowerCase() === "server";

    const isGamesPrivate =
      u.pathname.startsWith("/games/") &&
      u.searchParams.has("privateServerLinkCode");

    return isShareServer || isGamesPrivate;
  } catch {
    return false;
  }
}

function extractFirstRobloxPrivateServerLink(message) {
  const tokens = String(message || "").trim().split(/\s+/).filter(Boolean);
  for (const token of tokens) {
    const cleanedToken = token.replace(/[)\],.>]+$/g, "");
    if (isRobloxPrivateServerLink(cleanedToken)) {
      return cleanedToken;
    }
  }
  return "";
}

function rawReply(client, channelName, userstate, text) {
  const chan = String(channelName || "").replace(/^#/, "");
  if (!chan) return;
  client.raw(
    `@client-nonce=${userstate?.["client-nonce"]};reply-parent-msg-id=${userstate?.["id"]} ` +
      `PRIVMSG #${chan} :${text}`
  );
}

function buildDirectLinkReplyText({ twitchUsername, joinLink, mobileHowToUrl } = {}) {
  const who = String(twitchUsername || "").trim();
  const link = String(joinLink || "").trim();
  if (!link) return who ? `@${who}, no join link is set yet.` : "No join link is set yet.";

  const howTo = String(mobileHowToUrl || "").trim();
  const mobile = howTo ? ` | MOBILE: ${howTo}` : "";
  return who ? `@${who}, join link -> ${link}${mobile}` : `Join link -> ${link}${mobile}`;
}

function buildNightbotLinkCommandText({ joinLink, mobileHowToUrl } = {}) {
  const link = String(joinLink || "").trim();
  if (!link) return "";

  const howTo = String(mobileHowToUrl || "").trim();
  const mobile = howTo ? ` [MOBILE] How to join -> ${howTo}` : "";
  return `@$(user), [PC] Click this link to join -> ${link}${mobile}`.trim();
}

export function tryHandleLinkCommand({
  client,
  message,
  userstate,
  channelName,
  settingsPath,
  currentSettings,
  botPrefix = "",
} = {}) {
  if (!client || typeof client.raw !== "function") return false;

  const mode = readLinkMode();
  if (mode !== 2) return false;

  const trimmed = String(message || "").trim();
  if (!trimmed) return false;

  const commandName = readLinkCommandName();
  const cmd = trimmed.split(/\s+/)[0]?.toLowerCase?.() || "";
  if (!cmd || cmd !== String(commandName).toLowerCase()) return false;

  let latestSettings = currentSettings;
  if (settingsPath) {
    try {
      latestSettings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    } catch {}
  }

  const text = buildDirectLinkReplyText({
    twitchUsername: userstate?.username || userstate?.["display-name"] || "",
    joinLink: latestSettings?.currentLink || "",
    mobileHowToUrl: readMobileHowToUrl(),
  });
  rawReply(client, channelName, userstate, `${botPrefix}${text}`.trim());
  return true;
}

export async function handleLinkModeMessage({
  client,
  message,
  userstate,
  channelName,
  settingsPath,
  currentSettings,
  getChatPerms,
  applyModeToTwitch,
  buildLinkCommandText,
  setFossabotCommand,
  setNightbotCommand,
} = {}) {
  if (!message) return { updated: false, settings: null };
  if (!client) return { updated: false, settings: null };
  if (!settingsPath) return { updated: false, settings: null };
  if (typeof getChatPerms !== "function") return { updated: false, settings: null };
  if (typeof applyModeToTwitch !== "function") return { updated: false, settings: null };

  const mode = readLinkMode();
  if (mode === 0) return { updated: false, settings: null };

  const chan = String(channelName || "").replace(/^#/, "");
  const perms = getChatPerms(userstate, { channelLogin: chan });
  if (!perms?.isPermitted) return { updated: false, settings: null };

  const firstToken = extractFirstRobloxPrivateServerLink(message);
  if (!firstToken) return { updated: false, settings: null };

  let latestSettings = currentSettings;
  try {
    latestSettings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
  } catch {}

  const normalize = (url) =>
    String(url || "")
      .trim()
      .replace(/[)\],.>]+$/g, "")
      .replace(/\/+$/, "");

  const newLinkNorm = normalize(firstToken);
  const oldLinkNorm = normalize(latestSettings?.currentLink);

  if (oldLinkNorm && newLinkNorm === oldLinkNorm) {
    return { updated: false, settings: null };
  }

  latestSettings.currentLink = firstToken;
  if (latestSettings.currentMode !== "!link.on") latestSettings.currentMode = "!link.on";

  fs.writeFileSync(settingsPath, JSON.stringify(latestSettings, null, 2));

  await applyModeToTwitch({ client, mode: "!link.on", userstate });

  if (mode === 1) {
    const provider = readLinkProvider();
    const commandName = readLinkCommandName();
    const mobileHowToUrl = readMobileHowToUrl();

    if (provider === "nightbot") {
      if (typeof setNightbotCommand !== "function") return { updated: true, settings: latestSettings };
      const text = buildNightbotLinkCommandText({ joinLink: firstToken, mobileHowToUrl });
      if (text) {
        setNightbotCommand({
          client,
          channelName: chan,
          commandName,
          text,
        });
      }
    } else {
      if (typeof buildLinkCommandText !== "function") return { updated: true, settings: latestSettings };
      if (typeof setFossabotCommand !== "function") return { updated: true, settings: latestSettings };
      const fossabotText = buildLinkCommandText({
        joinLink: firstToken,
        mobileHowToUrl,
      });
      if (fossabotText) {
        setFossabotCommand({
          client,
          channelName: chan,
          commandName,
          text: fossabotText,
        });
      }
    }
  }

  return { updated: true, settings: latestSettings };
}
