import { WebhookClient, EmbedBuilder } from "discord.js";
import { createDiscordMessenger } from "./messenger.js";
import { getDiscordCommandRelayIntents, registerDiscordCommandRelay } from "./commandRelay.js";
import { getRoleAccessToken, TWITCH_ROLES } from "../api/twitch/auth.js";

function readEnvString(name) {
  return String(process.env[name] || "").trim();
}

function readEnvInt(name, fallback = 0) {
  const raw = String(process.env[name] || "").trim();
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function flagFromValue(value) {
  return /^(1|true|yes|on)$/i.test(String(value ?? "").trim());
}

function safeTrimLine(text, maxLen) {
  const s = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!s) return "";
  if (!Number.isFinite(maxLen) || maxLen <= 0) return s;
  return s.length <= maxLen ? s : s.slice(0, Math.max(0, maxLen - 3)) + "...";
}

function fmtTime(now = Date.now()) {
  const d = new Date(now);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function actionTitle(action) {
  const a = String(action || "").trim() || "action";
  if (a.startsWith("spotify_")) return `Spotify: ${a.slice("spotify_".length)}`;
  if (a.startsWith("roblox_")) return `Roblox: ${a.slice("roblox_".length)}`;
  if (a.startsWith("twitch_")) return `Twitch: ${a.slice("twitch_".length)}`;
  return a;
}

function spotifyAuditLabel(action = "", ok = true) {
  const a = String(action || "").trim().toLowerCase();
  if (a === "spotify_addsong" || a === "spotify_song_added") {
    return ok ? "Song Added to Queue" : "Song Add Failed";
  }
  if (a === "spotify_skip" || a === "spotify_song_skipped") {
    return ok ? "Song Skipped" : "Song Skip Failed";
  }
  if (a === "spotify_volume") {
    return ok ? "Spotify Volume Updated" : "Spotify Volume Failed";
  }
  if (a === "spotify_song_add_failed") return "Song Add Failed";
  if (a === "spotify_song_skip_failed") return "Song Skip Failed";
  return ok ? "Spotify Action OK" : "Spotify Action Failed";
}

function spotifyAuditSong(meta = {}) {
  const m = meta && typeof meta === "object" ? meta : {};
  const trackName = safeTrimLine(String(m.trackName || "").trim(), 120);
  const artists = safeTrimLine(String(m.trackArtists || "").trim(), 120);
  const song = safeTrimLine(String(m.song || "").trim(), 140);
  if (trackName && artists) return `${trackName} - ${artists}`;
  if (trackName) return trackName;
  if (song) return song;
  return "";
}

const TWITCH_PROFILE_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const TWITCH_AUTH_CACHE_TTL_MS = 5 * 60 * 1000;
const twitchProfileCache = new Map();
let twitchApiAuthCache = {
  clientId: "",
  accessToken: "",
  expiresAt: 0,
};

async function resolveTwitchApiAuth() {
  const now = Date.now();
  if (
    twitchApiAuthCache.clientId &&
    twitchApiAuthCache.accessToken &&
    twitchApiAuthCache.expiresAt > now + 60_000
  ) {
    return twitchApiAuthCache;
  }

  for (const role of [TWITCH_ROLES.BOT, TWITCH_ROLES.STREAMER]) {
    try {
      const auth = await getRoleAccessToken({ role, minTtlSec: 180 });
      const clientId = String(auth?.clientId || "").trim();
      const accessToken = String(auth?.accessToken || "").trim();
      if (clientId && accessToken) {
        twitchApiAuthCache = {
          clientId,
          accessToken,
          expiresAt: now + TWITCH_AUTH_CACHE_TTL_MS,
        };
        return twitchApiAuthCache;
      }
    } catch {}
  }

  return null;
}

async function getTwitchProfileImageUrl({ login, userId } = {}) {
  const normalizedLogin = String(login || "")
    .trim()
    .toLowerCase();
  const normalizedUserId = String(userId || "").trim();
  const cacheKey = normalizedUserId
    ? `id:${normalizedUserId}`
    : normalizedLogin
      ? `login:${normalizedLogin}`
      : "";

  if (!cacheKey) return "";

  const now = Date.now();
  const cached = twitchProfileCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return String(cached.url || "");
  }

  const auth = await resolveTwitchApiAuth();
  if (!auth?.clientId || !auth?.accessToken) return "";

  const url = new URL("https://api.twitch.tv/helix/users");
  if (normalizedUserId) {
    url.searchParams.set("id", normalizedUserId);
  } else {
    url.searchParams.set("login", normalizedLogin);
  }

  try {
    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "Client-Id": auth.clientId,
        Authorization: `Bearer ${auth.accessToken}`,
      },
    });

    if (!response.ok) return "";

    const payload = await response.json().catch(() => null);
    const imageUrl = String(payload?.data?.[0]?.profile_image_url || "").trim();

    twitchProfileCache.set(cacheKey, {
      url: imageUrl,
      expiresAt: now + TWITCH_PROFILE_CACHE_TTL_MS,
    });

    return imageUrl;
  } catch {
    return "";
  }
}

function safeLower(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeDiscordIdentityFromMeta(meta = {}, user = {}) {
  const m = meta && typeof meta === "object" ? meta : {};
  const u = user && typeof user === "object" ? user : {};

  const id = String(
    m.discordUserId || m.discord_id || m.discordId || ""
  ).trim();
  const username = String(
    m.discordUsername || m.discord_username || m.discordUser || m.discordLookupHint || ""
  ).trim();

  return {
    id,
    username: username || String(u.login || "").trim(),
  };
}

async function resolveDiscordIdentityForAudit({
  discordMessenger,
  meta = {},
  user = {},
} = {}) {
  const base = normalizeDiscordIdentityFromMeta(meta, user);
  let resolvedId = String(base.id || "").trim();
  let resolvedName = String(base.username || "").trim();

  const client = await discordMessenger?.getClient?.().catch(() => null);
  if (!client) {
    return { id: resolvedId, username: resolvedName };
  }

  if (resolvedId && /^\d{10,22}$/.test(resolvedId)) {
    const directUser = await client.users.fetch(resolvedId).catch(() => null);
    if (directUser) {
      return {
        id: String(directUser.id || resolvedId).trim(),
        username: String(directUser.username || directUser.tag || resolvedName || "").trim(),
      };
    }
  }

  const guildId = readEnvString("GUILD_ID");
  if (!guildId) return { id: resolvedId, username: resolvedName };

  const guild = await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) return { id: resolvedId, username: resolvedName };

  if (resolvedId && /^\d{10,22}$/.test(resolvedId)) {
    const memberById = await guild.members.fetch(resolvedId).catch(() => null);
    if (memberById?.user) {
      return {
        id: String(memberById.user.id || resolvedId).trim(),
        username: String(
          memberById.user.username ||
            memberById.user.globalName ||
            memberById.displayName ||
            memberById.nickname ||
            resolvedName
        ).trim(),
      };
    }
  }

  const lookup = String(resolvedName || "").trim();
  if (!lookup) return { id: resolvedId, username: resolvedName };

  const matches = await guild.members
    .search({ query: lookup, limit: 10 })
    .catch(() => null);
  const pool = Array.isArray(matches) ? matches : Array.from(matches?.values?.() || []);
  const target = safeLower(lookup);
  const picked =
    pool.find((member) => {
      const names = [
        member?.user?.username,
        member?.user?.globalName,
        member?.displayName,
        member?.nickname,
      ];
      return names.some((name) => safeLower(name) === target);
    }) || pool[0];

  if (picked?.user) {
    return {
      id: String(picked.user.id || resolvedId).trim(),
      username: String(
        picked.user.username ||
          picked.user.globalName ||
          picked.displayName ||
          picked.nickname ||
          resolvedName
      ).trim(),
    };
  }

  return { id: resolvedId, username: resolvedName };
}

export function initDiscord({ logger = console } = {}) {
  const webhookUrl = readEnvString("DISCORD_WEBHOOK_URL");
  const webhookClient = webhookUrl ? new WebhookClient({ url: webhookUrl }) : null;

  const commandsEnabled = flagFromValue(readEnvString("DISCORD_COMMANDS_ENABLED") || "0");
  const discordMessenger = createDiscordMessenger({
    token: readEnvString("DISCORD_BOT_TOKEN"),
    intents: getDiscordCommandRelayIntents({ enabled: commandsEnabled }),
    logger,
  });

  const announceChannelId = String(
    readEnvString("DISCORD_ANNOUNCE_CHANNEL_ID") || readEnvString("DISCORD_CHANNEL_ID") || ""
  ).trim();
  const logChannelId = String(
    readEnvString("DISCORD_LOG_CHANNEL_ID") || readEnvString("DISCORD_CHANNEL_ID") || ""
  ).trim();

  if (!webhookClient && !(discordMessenger && (announceChannelId || logChannelId))) {
    logger?.warn?.(
      "[discord] Discord not configured (set [discord].bot_token + channel_id/announce_channel_id/log_channel_id, or webhook_url)."
    );
  }

  async function logModAction(payload) {
    try {
      if (!discordMessenger || !logChannelId) return;
      const action = String(payload?.action || "").trim() || "action";
      const ok = payload?.ok === false ? "FAIL" : "OK";
      const user = payload?.user || {};
      const who = String(user.displayName || user.login || "unknown");
      const login = String(user.login || "").trim();
      const userId = String(user.id || "").trim();
      const chan = String(payload?.channelName || "").trim();
      const meta = payload?.meta && typeof payload.meta === "object" ? payload.meta : null;
      const err = String(payload?.error || "").trim();

      const isOk = ok === "OK";

      if (String(action || "").toLowerCase().startsWith("spotify_")) {
        const spotifyLabel = spotifyAuditLabel(action, isOk);
        const song = spotifyAuditSong(meta);
        const volume =
          meta && Number.isFinite(Number(meta.volume)) ? Number(meta.volume) : null;
        const whoLine = `${who}${userId ? ` (${userId})` : ""}`;
        const requestSource = String(meta?.requestSource || "").trim();
        const requestIp = String(meta?.requestIp || meta?.ip || "").trim();
        const requestIpSource = String(meta?.requestIpSource || meta?.ipSource || "").trim();
        const requestIpChain = String(meta?.requestIpChain || meta?.ipChain || "").trim();
        const ipRiskFlags = String(meta?.ipRiskFlags || "").trim();
        const ipLookupError = String(meta?.ipLookupError || "").trim();
        const ipIntel = meta?.ipIntel && typeof meta.ipIntel === "object" ? meta.ipIntel : null;
        const requestMethod = String(meta?.method || "").trim().toUpperCase();
        const requestRoute = String(meta?.route || "").trim();
        const isWebAudit = Boolean(requestSource || requestIp || requestRoute);
        const twitchLogin = String(meta?.twitchLogin || login || "").trim();
        const twitchUserId = String(meta?.twitchUserId || userId || "").trim();
        const discordIdentity = isWebAudit
          ? await resolveDiscordIdentityForAudit({
              discordMessenger,
              meta,
              user,
            })
          : { id: "", username: "" };

        const bodyParts = [spotifyLabel];
        if (song) bodyParts.push(song);
        if (Number.isFinite(volume)) bodyParts.push(`Volume: ${volume}%`);
        bodyParts.push(`By: ${whoLine}`);
        if (isWebAudit) {
          if (requestMethod || requestRoute) {
            bodyParts.push(
              `Request: ${requestMethod || "?"}${requestRoute ? ` ${requestRoute}` : ""}`
            );
          }
          if (requestIp) {
            bodyParts.push(
              `IP: ${requestIp}${requestIpSource ? ` (${requestIpSource})` : ""}`
            );
          }
          if (requestIpChain && requestIpChain !== requestIp) {
            bodyParts.push(`IP Chain: ${requestIpChain}`);
          }
          if (ipRiskFlags) bodyParts.push(`IP Risk: ${ipRiskFlags}`);
          if (ipIntel && !ipIntel.skipped) {
            const geo = [ipIntel.city, ipIntel.region, ipIntel.country]
              .map((x) => String(x || "").trim())
              .filter(Boolean)
              .join(", ");
            const org = String(ipIntel.org || ipIntel.isp || "").trim();
            if (geo) bodyParts.push(`Geo: ${geo}`);
            if (org) bodyParts.push(`Network: ${org}`);
          }
          if (ipLookupError) bodyParts.push(`IP Lookup: ${ipLookupError}`);
          if (requestSource) bodyParts.push(`Source: ${requestSource}`);
          if (twitchLogin || twitchUserId) {
            bodyParts.push(
              `Twitch: ${twitchLogin || "unknown"}${twitchUserId ? ` (id: ${twitchUserId})` : ""}`
            );
          }
          bodyParts.push(
            `Discord: ${discordIdentity.username || "unknown"}${
              discordIdentity.id ? ` (id: ${discordIdentity.id})` : ""
            }`
          );
        }

        const spotifyEmbed = new EmbedBuilder()
          .setTitle("Spotify")
          .setColor(isOk ? 0x2ecc71 : 0xff5c5c)
          .setDescription(bodyParts.join("\n"))
          .setFooter({ text: `#${chan || "?"}` })
          .setTimestamp(new Date());

        if (err) {
          spotifyEmbed.addFields([
            { name: "Error", value: "```" + safeTrimLine(err, 950) + "```" },
          ]);
        }

        await discordMessenger.send(logChannelId, {
          embeds: [spotifyEmbed],
          allowedMentions: { parse: [] },
        });
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle(`${isOk ? "OK" : "FAIL"} | ${actionTitle(action)}`)
        .setColor(isOk ? 0x2ecc71 : 0xff5c5c)
        .setDescription(`Channel: #${chan || "?"}\nBy: ${who}${login ? ` (@${login})` : ""}${userId ? ` (id: ${userId})` : ""}`)
        .setTimestamp(new Date());

      if (meta) {
        try {
          const metaText = safeTrimLine(JSON.stringify(meta), 950);
          if (metaText && metaText !== "{}") {
            embed.addFields([{ name: "Meta", value: "```json\n" + metaText + "\n```" }]);
          }
        } catch {}
      }

      if (err) {
        embed.addFields([{ name: "Error", value: "```" + safeTrimLine(err, 950) + "```" }]);
      }

      await discordMessenger.send(logChannelId, {
        embeds: [embed],
        allowedMentions: { parse: [] },
      });
    } catch (e) {
      logger?.warn?.("[discord][log] failed:", String(e?.message || e));
    }
  }

  const chatLogEnabled = flagFromValue(readEnvString("DISCORD_TWITCH_CHAT_LOG_ENABLED") || "0");
  const chatCommandsOnly = flagFromValue(readEnvString("DISCORD_TWITCH_CHAT_LOG_COMMANDS_ONLY") || "0");
  const configuredChatMode = String(readEnvString("DISCORD_TWITCH_CHAT_LOG_MODE") || "per_message")
    .trim()
    .toLowerCase();
  const chatMode = "per_message";
  const chatPerMessage = true;
  const chatFlushMs = Math.max(250, readEnvInt("DISCORD_TWITCH_CHAT_LOG_FLUSH_MS", 2500));
  const chatMaxLines = Math.max(1, readEnvInt("DISCORD_TWITCH_CHAT_LOG_MAX_LINES", 12));
  const chatChannelId = String(
    readEnvString("DISCORD_TWITCH_CHAT_LOG_CHANNEL_ID") || logChannelId || ""
  ).trim();

  try {
    if (configuredChatMode === "batch") {
      logger?.warn?.(
        "[discord][chatlog] mode=batch is disabled; forcing per_message mode."
      );
    }
    if (chatLogEnabled) {
      logger?.log?.(
        `[discord][chatlog] enabled mode=${chatMode || "batch"} channel=${chatChannelId || "(missing)"}`
      );
    } else {
      logger?.log?.("[discord][chatlog] disabled");
    }
  } catch {}

  let chatBuffer = [];
  let chatFlushTimer = null;
  let chatWarnedMissingConfig = false;
  let chatSendFailCount = 0;
  let chatLastSendFailAt = 0;

  async function flushChatBuffer() {
    if (!discordMessenger || !chatChannelId) return;
    if (!chatBuffer.length) return;

    const lines = chatBuffer.slice(0, chatMaxLines);
    chatBuffer = chatBuffer.slice(lines.length);

    const embed = new EmbedBuilder()
      .setTitle("Twitch chat")
      .setColor(0xffbd59)
      .setDescription("```" + lines.join("\n").slice(0, 3900) + "```")
      .setTimestamp(new Date());

    try {
      await discordMessenger.send(chatChannelId, { embeds: [embed], allowedMentions: { parse: [] } });
    } catch (e) {
      logger?.warn?.("[discord][chatlog] send failed:", String(e?.message || e));
    }
  }

  function scheduleChatFlush() {
    if (chatFlushTimer) return;
    chatFlushTimer = setTimeout(async () => {
      chatFlushTimer = null;
      await flushChatBuffer();
      if (chatBuffer.length) scheduleChatFlush();
    }, chatFlushMs);
    try {
      chatFlushTimer.unref?.();
    } catch {}
  }

  async function logTwitchChat(payload) {
    try {
      if (!chatLogEnabled) return;
      if (!discordMessenger || !chatChannelId) {
        if (!chatWarnedMissingConfig) {
          chatWarnedMissingConfig = true;
          logger?.warn?.(
            `[discord][chatlog] enabled but missing config: bot_token=${Boolean(readEnvString("DISCORD_BOT_TOKEN"))} channel_id=${chatChannelId || "(missing)"}`
          );
        }
        return;
      }

      const channelName = String(payload?.channelName || "").replace(/^#/, "").trim() || "?";
      const message = String(payload?.message || "").trim();
      if (!message) return;
      if (chatCommandsOnly && !message.startsWith("!")) return;

      const user = payload?.user && typeof payload.user === "object" ? payload.user : {};
      const display = String(user.displayName || user.login || "unknown").trim() || "unknown";
      const login = String(user.login || "").trim();
      const userId = String(user.id || "").trim();

      const isBroadcaster = payload?.isBroadcaster === true;
      const isMod = payload?.isMod === true;
      const isVip = payload?.isVip === true;
      const isSubscriber = payload?.isSubscriber === true;

      const badgeParts = [];
      if (isBroadcaster) badgeParts.push("BROADCASTER");
      if (isMod) badgeParts.push("MOD");
      if (isVip) badgeParts.push("VIP");
      if (isSubscriber) badgeParts.push("SUB");

      const identity = userId || login || "";
      const who = identity ? `${display} (${identity})` : display;

      if (chatPerMessage) {
        const color = isBroadcaster
          ? 0xff3b30
          : isMod
            ? 0x2ecc71
            : isVip
              ? 0xff4fd8
              : isSubscriber
                ? 0x4aa3ff
                : 0xffbd59;
        const authorName = safeTrimLine(who, 120) || "unknown";
        const authorUrl = login ? `https://twitch.tv/${encodeURIComponent(login)}` : undefined;
        const desc = safeTrimLine(message, 1900) || "-";
        const profileImageUrl = await getTwitchProfileImageUrl({
          login,
          userId: String(user?.id || "").trim(),
        });
        const roleText = badgeParts.length ? badgeParts.join(" | ") : "VIEWER";
        const footerText = `Roles: ${roleText}`;

        const embed = new EmbedBuilder()
          .setColor(color)
          .setAuthor(
            profileImageUrl
              ? { name: authorName, url: authorUrl, iconURL: profileImageUrl }
              : { name: authorName, url: authorUrl }
          )
          .setDescription(desc)
          .setFooter(
            profileImageUrl
              ? { text: footerText, iconURL: profileImageUrl }
              : { text: footerText }
          )
          .setTimestamp(new Date());
        if (profileImageUrl) embed.setThumbnail(profileImageUrl);

        try {
          await discordMessenger.send(chatChannelId, {
            embeds: [embed],
            allowedMentions: { parse: [] },
          });
        } catch (e) {
          // Fallback to main log channel if the dedicated chat log channel is misconfigured.
          if (logChannelId && logChannelId !== chatChannelId) {
            await discordMessenger.send(logChannelId, {
              embeds: [embed],
              allowedMentions: { parse: [] },
            });
          } else {
            throw e;
          }
        }
        return;
      }

      const flagText = badgeParts.length ? `[${badgeParts.join(",")}] ` : "";
      const line = `${fmtTime()} #${channelName} ${flagText}${safeTrimLine(who, 60)}: ${safeTrimLine(message, 220)}`;
      chatBuffer.push(line);

      if (chatBuffer.length >= chatMaxLines) {
        scheduleChatFlush();
        await flushChatBuffer();
        return;
      }
      scheduleChatFlush();
    } catch (e) {
      chatSendFailCount++;
      const now = Date.now();
      const msg = String(e?.message || e);
      // Throttle noisy failures to at most once every 30s.
      if (now - chatLastSendFailAt > 30_000) {
        chatLastSendFailAt = now;
        logger?.warn?.(
          `[discord][chatlog] send failed (count=${chatSendFailCount}) channel=${chatChannelId || "(missing)"}: ${msg}`
        );
        logger?.warn?.(
          "[discord][chatlog] Check: bot is in the guild, has View Channel + Send Messages + Embed Links for the target channel."
        );
      }
    }
  }

  // Force Discord login early so misconfigured intents/permissions are obvious at startup.
  try {
    if (discordMessenger && (commandsEnabled || chatLogEnabled || announceChannelId || logChannelId)) {
      void discordMessenger.getClient?.().catch(() => {});
    }
  } catch {}

  async function shutdown() {
    try {
      try {
        stopRelay?.();
      } catch {}
      try {
        if (chatFlushTimer) clearTimeout(chatFlushTimer);
        chatFlushTimer = null;
        await flushChatBuffer();
      } catch {}
      await discordMessenger?.destroy?.();
    } catch {}
  }

  let stopRelay = null;
  async function registerCommandRelay({ relayToTwitch } = {}) {
    try {
      stopRelay?.();
    } catch {}
    stopRelay = await registerDiscordCommandRelay({
      discordMessenger,
      enabled: commandsEnabled,
      guildId: readEnvString("GUILD_ID"),
      channelIds: readEnvString("DISCORD_COMMAND_CHANNEL_IDS"),
      modRoleIds: readEnvString("DISCORD_MOD_ROLE_IDS"),
      relayToTwitch,
      logger,
    });
    return stopRelay;
  }

  return {
    webhookClient,
    discordMessenger,
    announceChannelId,
    logChannelId,
    logModAction,
    logTwitchChat,
    registerCommandRelay,
    shutdown,
  };
}

export { EmbedBuilder };
