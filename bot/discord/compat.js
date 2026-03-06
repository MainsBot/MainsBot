import discordPkg from "discord.js";

function toPascalCaseFlagKey(key = "") {
  return String(key || "")
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

function normalizeFlagMap(raw = {}, numericFallbacks = {}) {
  const source = raw && typeof raw === "object" ? raw : {};
  const out = { ...numericFallbacks };

  for (const [key, value] of Object.entries(source)) {
    out[key] = value;
    const alias = /^[A-Z0-9_]+$/.test(key) ? toPascalCaseFlagKey(key) : key;
    if (alias && out[alias] == null) out[alias] = value;
  }

  return out;
}

function createWebhookClientFromUrl(url = "") {
  const raw = String(url || "").trim();
  if (!raw || !discordPkg?.WebhookClient) return null;

  try {
    return new discordPkg.WebhookClient({ url: raw });
  } catch {}

  try {
    return new discordPkg.WebhookClient(raw);
  } catch {}

  const match = raw.match(/discord(?:app)?\.com\/api\/webhooks\/([^/]+)\/([^/?#]+)/i);
  if (!match) return null;

  try {
    return new discordPkg.WebhookClient({ id: match[1], token: match[2] });
  } catch {
    return null;
  }
}

export const Client = discordPkg.Client;
export const GatewayIntentBits = normalizeFlagMap(
  discordPkg.GatewayIntentBits ||
    discordPkg.IntentsBitField?.Flags ||
    discordPkg.Intents?.FLAGS,
  {
    Guilds: 1,
    GuildMessages: 512,
    MessageContent: 32768,
  }
);

export const PermissionsBitField = {
  Flags: normalizeFlagMap(
    discordPkg.PermissionsBitField?.Flags || discordPkg.Permissions?.FLAGS,
    {
      Administrator:
        discordPkg.PermissionsBitField?.Flags?.Administrator ||
        discordPkg.Permissions?.FLAGS?.ADMINISTRATOR ||
        "ADMINISTRATOR",
    }
  ),
};

export const WebhookClient = discordPkg.WebhookClient;
export const EmbedBuilder = discordPkg.EmbedBuilder || discordPkg.MessageEmbed;
export const ActionRowBuilder = discordPkg.ActionRowBuilder || discordPkg.MessageActionRow;
export const ButtonBuilder = discordPkg.ButtonBuilder || discordPkg.MessageButton;
export const ButtonStyle = {
  ...(discordPkg.ButtonStyle || {}),
  Link:
    discordPkg.ButtonStyle?.Link ||
    discordPkg.ButtonStyle?.LINK ||
    "LINK",
};

export { createWebhookClientFromUrl };
