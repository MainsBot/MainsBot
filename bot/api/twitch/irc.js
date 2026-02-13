import tmi from "tmi.js";

function normalizeAuthToken(value) {
  return String(value || "")
    .trim()
    .replace(/^oauth:/i, "")
    .replace(/^bearer\\s+/i, "");
}

export function createTmiClient({
  username,
  oauthToken,
  channelName,
  debug = false,
} = {}) {
  const user = String(username || "").trim();
  const token = normalizeAuthToken(oauthToken);
  const channel = String(channelName || "").trim().replace(/^#/, "");
  if (!user) throw new Error("createTmiClient: missing username");
  if (!token) throw new Error("createTmiClient: missing oauthToken");
  if (!channel) throw new Error("createTmiClient: missing channelName");

  return new tmi.Client({
    options: { debug: !!debug },
    identity: {
      username: user,
      password: `OAuth:${token}`,
    },
    channels: [channel],
  });
}

export function createOptionalTmiClient({
  username,
  oauthToken,
  channelName,
  debug = false,
} = {}) {
  const user = String(username || "").trim();
  const token = normalizeAuthToken(oauthToken);
  const channel = String(channelName || "").trim().replace(/^#/, "");
  if (!user || !token || !channel) return null;
  return createTmiClient({ username: user, oauthToken: token, channelName: channel, debug });
}

export function attachClientEventLogs({
  tmiClient,
  label = "irc",
  appendLog,
  logRecentCommandResponse,
  defaultChannelName = "",
} = {}) {
  if (!tmiClient || typeof tmiClient.on !== "function") return;
  if (tmiClient.__eventLogAttached) return;
  tmiClient.__eventLogAttached = true;

  const safeAppend = typeof appendLog === "function" ? appendLog : null;
  const safeRecent = typeof logRecentCommandResponse === "function" ? logRecentCommandResponse : null;

  tmiClient.on("connected", (addr, port) => {
    safeAppend?.(label, `CONNECTED ${addr}:${port}`);
  });

  tmiClient.on("disconnected", (reason) => {
    safeAppend?.(label, `DISCONNECTED ${reason}`);
  });

  tmiClient.on("message", (channel, userstate, message, self) => {
    if (!self) return;
    safeAppend?.(label, `SAY ${channel}: ${message}`);
    safeRecent?.(channel || defaultChannelName, message, "irc");
  });

  tmiClient.on("action", (channel, userstate, message, self) => {
    if (!self) return;
    safeAppend?.(label, `ACTION ${channel}: ${message}`);
    safeRecent?.(channel || defaultChannelName, message, "irc");
  });
}

