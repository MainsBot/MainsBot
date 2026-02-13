import fs from "fs";
import path from "path";

function flagFromValue(value) {
  return /^(1|true|yes|on)$/i.test(String(value ?? "").trim());
}

export function isGamepingModuleEnabled() {
  const raw = String(process.env.MODULE_GAMEPING ?? "").trim();
  if (raw) return flagFromValue(raw);
  return true; // default on (backward compatible)
}

function normalizeLogin(value) {
  return String(value ?? "")
    .trim()
    .replace(/^[@#]+/, "")
    .toLowerCase();
}

function parseLoginSet(value) {
  return new Set(
    String(value ?? "")
      .split(/[,\s]+/)
      .map((s) => normalizeLogin(s))
      .filter(Boolean)
  );
}

export function registerGamepingModule({
  client,
  channelName,
  getChatPerms,
  webhookClient,
  EmbedBuilder,
  gamePingsPath = "",
  allowedUsers = process.env.GAMEPING_ALLOWED_USERS || "",
  enableGameChangePing = true,
  logger = console,
} = {}) {
  if (!client || typeof client.on !== "function") {
    throw new Error("registerGamepingModule: missing tmi client");
  }
  if (!webhookClient) {
    logger?.warn?.("[gameping] DISCORD_WEBHOOK_URL missing; !gameping will reply but cannot send webhook.");
  }

  const CHANNEL_NAME = String(channelName || "").trim().replace(/^#/, "");
  if (!CHANNEL_NAME) throw new Error("registerGamepingModule: missing channelName");

  const resolvedGamePingsPath = (() => {
    const fromEnv = String(process.env.GAMEPING_ROLES_PATH || "").trim();
    if (fromEnv) return path.resolve(process.cwd(), fromEnv);

    const configured = String(gamePingsPath || "").trim();
    if (configured) return path.resolve(process.cwd(), configured);

    const dataDir = String(process.env.DATA_DIR || "").trim();
    if (dataDir) return path.resolve(dataDir, "d", "game_pings.json");

    return path.resolve(process.cwd(), "game_pings.json");
  })();

  const GAMEPING_ALLOWED = parseLoginSet(allowedUsers);

  const PING_ALIASES = {
    "bad buisness": "bad business",
    gas: "gas station simulator",
    "gas station": "gas station simulator",
    rail: "rail frenzy",
    rf: "rail frenzy",
  };

  const GAMEPING_STATE = {
    started: false,
    lastPingKey: null,
  };

  function loadGamePings() {
    const raw = fs.readFileSync(resolvedGamePingsPath, "utf8");
    const json = JSON.parse(raw);
    return {
      GAME_PINGS: json.pings || {},
      GAME_CHANGE_ROLE_ID: json.gameChangeRoleId || null,
    };
  }

  let GAME_PINGS = {};
  let GAME_CHANGE_ROLE_ID = null;

  try {
    const init = loadGamePings();
    GAME_PINGS = init.GAME_PINGS;
    GAME_CHANGE_ROLE_ID = init.GAME_CHANGE_ROLE_ID;
  } catch (e) {
    logger?.warn?.(
      "[gameping] failed to load game_pings.json:",
      resolvedGamePingsPath,
      String(e?.message || e)
    );
  }

  const watchCb = () => {
    try {
      const next = loadGamePings();
      GAME_PINGS = next.GAME_PINGS;
      GAME_CHANGE_ROLE_ID = next.GAME_CHANGE_ROLE_ID;
      logger?.log?.("[game_pings] reloaded");
    } catch (e) {
      logger?.log?.("[game_pings] reload failed:", String(e?.message || e));
    }
  };

  try {
    fs.watchFile(resolvedGamePingsPath, { interval: 1000 }, watchCb);
  } catch (e) {
    logger?.warn?.("[gameping] watchFile failed:", String(e?.message || e));
  }

  function isAllowedGamePing(userstate) {
    const perms =
      typeof getChatPerms === "function"
        ? getChatPerms(userstate, { channelLogin: CHANNEL_NAME })
        : { isAdmin: false, isMod: Boolean(userstate?.mod), isBroadcaster: userstate?.badges?.broadcaster === "1" };
    if (perms.isBroadcaster || perms.isMod || perms.isAdmin) return true;
    const login = normalizeLogin(userstate?.username || "");
    return Boolean(login && GAMEPING_ALLOWED.has(login));
  }

  function buildGamePingMentions(pingKey, pingCfg) {
    const mentions = [];
    if (pingCfg?.roleId) mentions.push(`<@&${pingCfg.roleId}>`);

    if (
      enableGameChangePing &&
      GAMEPING_STATE.started &&
      GAMEPING_STATE.lastPingKey &&
      GAMEPING_STATE.lastPingKey !== pingKey &&
      GAME_CHANGE_ROLE_ID
    ) {
      mentions.push(`<@&${GAME_CHANGE_ROLE_ID}>`);
    }

    GAMEPING_STATE.started = true;
    GAMEPING_STATE.lastPingKey = pingKey;
    return mentions.join(" ");
  }

  const handler = async (channel, userstate, message, self) => {
    try {
      if (self) return;

      const msg = String(message || "").trim();
      if (!msg) return;

      const lower = msg.toLowerCase();
      if (!lower.startsWith("!gameping")) return;

      const chan = String(channel || "").replace(/^#/, "") || CHANNEL_NAME;

      const replyRaw = (text) => {
        const nonce = userstate?.["client-nonce"] || "";
        const parentId = userstate?.["id"] || "";
        return client.raw(
          `@client-nonce=${nonce};reply-parent-msg-id=${parentId} PRIVMSG #${chan} :${text}`
        );
      };

      if (!isAllowedGamePing(userstate)) return;

      const parts = msg.split(/\s+/);
      if (parts.length < 2) {
        const validList = Object.keys(GAME_PINGS).join(", ");
        return replyRaw(`Please specify a valid ping. Valid pings: ${validList}`);
      }

      let pingKey = parts.slice(1).join(" ").trim().toLowerCase();
      pingKey = PING_ALIASES[pingKey] || pingKey;

      const pingCfg = GAME_PINGS[pingKey];
      if (!pingCfg) {
        const validList = Object.keys(GAME_PINGS).join(", ");
        return replyRaw(`Invalid ping "${pingKey}". Valid pings: ${validList}`);
      }

      const scamFlag = parts.some((p) => String(p).toLowerCase() === "scam");
      const roleMention = buildGamePingMentions(pingKey, pingCfg);

      if (!webhookClient) {
        return replyRaw("Discord webhook not configured (DISCORD_WEBHOOK_URL).");
      }

      await webhookClient.send({
        content: [
          roleMention,
          `🎮 GAME PING: ${pingCfg.label}${scamFlag ? " [GAME WAS SCAMMED FOR]" : ""}`,
        ]
          .filter(Boolean)
          .join("\n"),
        username: "MainsBot",
      });

      const streamUrl = `https://twitch.tv/${CHANNEL_NAME}`;
      const linkEmbed = new EmbedBuilder()
        .setColor(0x9146ff)
        .setTitle("Watch Live")
        .setDescription(streamUrl)
        .setURL(streamUrl)
        .setTimestamp(new Date())
        .setFooter({ text: `Ping done by: ${userstate.username}` });

      const previewImg = `https://static-cdn.jtvnw.net/previews-ttv/live_user_${CHANNEL_NAME.toLowerCase()}-1280x720.jpg`;
      linkEmbed.setImage(previewImg);

      await webhookClient.send({
        embeds: [linkEmbed],
        username: "MainsBot",
      });

      return replyRaw(`Ping sent (${pingCfg.label})`);
    } catch (err) {
      logger?.error?.("[gameping] error:", err);
      try {
        const chan = String(channel || "").replace(/^#/, "") || CHANNEL_NAME;
        const nonce = userstate?.["client-nonce"] || "";
        const parentId = userstate?.["id"] || "";
        return client.raw(
          `@client-nonce=${nonce};reply-parent-msg-id=${parentId} PRIVMSG #${chan} :Ping failed ❌`
        );
      } catch {}
    }
  };

  client.on("message", handler);

  return () => {
    try {
      client.off?.("message", handler);
    } catch {
      client.removeListener?.("message", handler);
    }
    try {
      fs.unwatchFile(resolvedGamePingsPath, watchCb);
    } catch {}
  };
}
