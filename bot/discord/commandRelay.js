import { GatewayIntentBits, PermissionsBitField } from "discord.js";

function flagFromValue(value) {
  return /^(1|true|yes|on)$/i.test(String(value ?? "").trim());
}

function parseIdSet(value) {
  return new Set(
    String(value || "")
      .split(/[,\s]+/)
      .map((s) => String(s).trim())
      .filter(Boolean)
  );
}

function defaultIsModOnlyCommand(cmdLower) {
  return (
    cmdLower === "!addsong" ||
    cmdLower === "!skipsong" ||
    cmdLower === "!songvol" ||
    cmdLower === "!gameping" ||
    cmdLower === "!givetab" ||
    cmdLower === "!addtab" ||
    cmdLower === "!settab"
  );
}

export function getDiscordCommandRelayIntents({ enabled } = {}) {
  if (!enabled) return [GatewayIntentBits.Guilds];
  return [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent, // requires privileged intent toggle in Discord Dev Portal
  ];
}

export async function registerDiscordCommandRelay({
  discordMessenger,
  guildId = "",
  channelIds = "",
  modRoleIds = "",
  enabled = false,
  relayToTwitch,
  isModOnlyCommand = defaultIsModOnlyCommand,
  logger = console,
} = {}) {
  const on = flagFromValue(enabled);
  if (!on) return null;
  if (!discordMessenger?.getClient) {
    logger?.warn?.("[discord][relay] bot_token missing; cannot enable Discord command relay.");
    return null;
  }
  if (typeof relayToTwitch !== "function") {
    logger?.warn?.("[discord][relay] relayToTwitch missing; cannot enable Discord command relay.");
    return null;
  }

  const allowedChannels = parseIdSet(channelIds || process.env.DISCORD_COMMAND_CHANNEL_IDS || "");
  const requiredModRoles = parseIdSet(modRoleIds || process.env.DISCORD_MOD_ROLE_IDS || "");
  const targetGuildId = String(guildId || process.env.GUILD_ID || "").trim();

  if (!allowedChannels.size) {
    logger?.log?.("[discord][relay] enabled for ALL channels in guild (DISCORD_COMMAND_CHANNEL_IDS is empty).");
  }

  const client = await discordMessenger.getClient();

  const handler = async (message) => {
    try {
      if (!message) return;
      if (message.author?.bot) return;
      if (!message.guild) return;

      if (targetGuildId && String(message.guild.id) !== targetGuildId) return;
      if (allowedChannels.size && !allowedChannels.has(String(message.channel?.id || ""))) return;

      const content = String(message.content || "").trim();
      if (!content.startsWith("!")) return;

      const cmd = content.split(/\s+/)[0]?.toLowerCase() || "";
      const needsMod = typeof isModOnlyCommand === "function" ? !!isModOnlyCommand(cmd) : false;

      let isPrivileged = false;
      if (needsMod) {
        const member =
          message.member || (await message.guild.members.fetch(message.author.id).catch(() => null));
        const isAdmin = Boolean(member?.permissions?.has?.(PermissionsBitField.Flags.Administrator));
        const hasRole =
          requiredModRoles.size === 0
            ? false
            : Boolean(member?.roles?.cache?.some?.((r) => requiredModRoles.has(String(r.id))));

        isPrivileged = Boolean(isAdmin || hasRole);
        if (!isAdmin && !hasRole) {
          try {
            await message.reply({ content: "You don't have permission to run that command here.", allowedMentions: { repliedUser: false } });
          } catch {}
          return;
        }
      } else {
        // For non-mod-only commands, still mark as privileged if they have one of the configured mod roles.
        try {
          if (requiredModRoles.size) {
            const member =
              message.member || (await message.guild.members.fetch(message.author.id).catch(() => null));
            isPrivileged = Boolean(
              member?.roles?.cache?.some?.((r) => requiredModRoles.has(String(r.id)))
            );
          }
        } catch {}
      }

      await relayToTwitch(content, { discordMessage: message, isPrivileged });
    } catch (e) {
      logger?.warn?.("[discord][relay] failed:", String(e?.message || e));
      try {
        await message?.reply?.({
          content: "Command failed. Check the bot console for details.",
          allowedMentions: { repliedUser: false },
        });
      } catch {}
    }
  };

  client.on("messageCreate", handler);
  logger?.log?.("[discord][relay] enabled");

  return () => {
    try {
      client.off?.("messageCreate", handler);
    } catch {
      client.removeListener?.("messageCreate", handler);
    }
  };
}
