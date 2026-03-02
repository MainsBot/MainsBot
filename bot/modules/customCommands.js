import { resolveStateSchema } from "../../data/postgres/db.js";
import { ensureStateTable, readStateValue, writeStateValue } from "../../data/postgres/stateStore.js";
import { renderPajbotTemplate } from "../functions/pajbotTemplate.js";
import { resolveInstanceName } from "../functions/instance.js";

function flagFromValue(value) {
  return /^(1|true|yes|on)$/i.test(String(value ?? "").trim());
}

function normalizeCommand(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const cmd = raw.split(/\s+/)[0].toLowerCase();
  if (!cmd.startsWith("!")) return "";
  return cmd.replace(/[^!a-z0-9_:.]/g, "");
}

function normalizePlatform(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "discord") return "discord";
  if (raw === "twitch") return "twitch";
  return "";
}

function normalizePlatforms(input) {
  const list = Array.isArray(input) ? input : [];
  const out = [];
  const seen = new Set();
  for (const raw of list) {
    const platform = normalizePlatform(raw);
    if (!platform || seen.has(platform)) continue;
    seen.add(platform);
    out.push(platform);
  }
  if (!out.length) return ["twitch", "discord"];
  return out;
}

function normalizeCooldownMs(value, fallback = 0) {
  const n = Math.floor(Number(value) || fallback);
  return Math.max(0, Math.min(3600_000, n));
}

function parseSetCmdPlatformFlags(args = []) {
  const parts = Array.isArray(args) ? args : [];
  const selected = new Set();
  let idx = 0;

  while (idx < parts.length) {
    const token = String(parts[idx] || "").trim().toLowerCase();
    if (token === "--discord") {
      selected.add("discord");
      idx += 1;
      continue;
    }
    if (token === "--twitch") {
      selected.add("twitch");
      idx += 1;
      continue;
    }
    if (token === "--both") {
      selected.add("twitch");
      selected.add("discord");
      idx += 1;
      continue;
    }
    break;
  }

  const platforms = selected.size ? normalizePlatforms(Array.from(selected)) : ["twitch", "discord"];
  return { platforms, consumed: idx };
}

function normalizeCommandEntry(raw) {
  if (typeof raw === "string") {
    return {
      response: String(raw),
      platforms: ["twitch", "discord"],
      enabled: true,
      deleted: false,
      deletedAt: null,
      cooldowns: { twitchMs: 0, discordMs: 0 },
    };
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const response = String(raw.response || "").trim();
  if (!response) return null;
  return {
    response,
    platforms: normalizePlatforms(raw.platforms),
    enabled: raw.enabled == null ? true : Boolean(raw.enabled),
    deleted: Boolean(raw.deleted),
    deletedAt: raw.deletedAt ? String(raw.deletedAt) : null,
    cooldowns: {
      twitchMs: normalizeCooldownMs(raw?.cooldowns?.twitchMs, 0),
      discordMs: normalizeCooldownMs(raw?.cooldowns?.discordMs, 0),
    },
  };
}

function hasDatabaseUrl() {
  return Boolean(String(process.env.DATABASE_URL || "").trim());
}

function buildEmpty() {
  return { version: 1, commands: {} };
}

export function isCustomCommandsModuleEnabled() {
  const raw = String(process.env.MODULE_CUSTOM_COMMANDS ?? "").trim();
  if (raw) return flagFromValue(raw);
  return false;
}

export function registerCustomCommandsModule({
  client,
  channelName,
  getChatPerms,
  commandCounter,
  countStore,
  birthYear,
  onActivity = null,
  logger = console,
} = {}) {
  if (!client || typeof client.on !== "function") {
    throw new Error("registerCustomCommandsModule: missing tmi client");
  }
  if (!channelName) throw new Error("registerCustomCommandsModule: missing channelName");
  if (!hasDatabaseUrl()) {
    logger?.warn?.("[custom_commands] DATABASE_URL missing; module disabled.");
    return () => {};
  }

  const schema = resolveStateSchema();
  const instance = resolveInstanceName();
  const stateKey = "custom_commands";
  const chan = String(channelName || "").trim().replace(/^#/, "");

  let cache = buildEmpty();
  const cooldownByKey = new Map();

  async function loadFromDb() {
    await ensureStateTable({ schema });
    const value = await readStateValue({ schema, instance, key: stateKey, fallback: buildEmpty() });
    if (value && typeof value === "object" && value.commands && typeof value.commands === "object") {
      cache = { version: 1, commands: { ...value.commands } };
    } else {
      cache = buildEmpty();
    }
    return cache;
  }

  async function saveToDb(next) {
    await ensureStateTable({ schema });
    cache = next && typeof next === "object" ? next : buildEmpty();
    await writeStateValue({ schema, instance, key: stateKey, value: cache });
  }

  void loadFromDb().catch((e) => {
    logger?.warn?.("[custom_commands] load failed:", String(e?.message || e));
  });

  const handler = async (channel, userstate, message, self) => {
    try {
      if (self) return;
      const msg = String(message || "").trim();
      if (!msg) return;
      if (!msg.startsWith("!")) return;

      const parts = msg.split(/\s+/);
      const cmd = normalizeCommand(parts[0]);
      if (!cmd) return;

      const replyRaw = (text) => {
        const nonce = userstate?.["client-nonce"] || "";
        const parentId = userstate?.["id"] || "";
        return client.raw(
          `@client-nonce=${nonce};reply-parent-msg-id=${parentId} PRIVMSG #${chan} :${text}`
        );
      };

      // Mod management: !setcmd / !delcmd / !undelcmd
      if (cmd === "!setcmd" || cmd === "!delcmd" || cmd === "!undelcmd") {
        const perms =
          typeof getChatPerms === "function"
            ? getChatPerms(userstate, { channelLogin: chan })
            : { isPermitted: Boolean(userstate?.mod || userstate?.badges?.broadcaster === "1") };
        if (!perms.isPermitted) return;

        const target = normalizeCommand(parts[1]);
        if (!target) return replyRaw(`Usage: ${cmd} <!command> ${cmd === "!setcmd" ? "<response>" : ""}`.trim());
        if (target === "!setcmd" || target === "!delcmd" || target === "!undelcmd") {
          return replyRaw("That command is reserved.");
        }

        if (cmd === "!delcmd") {
          const next = { version: 1, commands: { ...(cache.commands || {}) } };
          if (!next.commands[target]) return replyRaw(`No such command: ${target}`);
          next.commands[target] = {
            ...normalizeCommandEntry(next.commands[target]),
            enabled: false,
            deleted: true,
            deletedAt: new Date().toISOString(),
          };
          await saveToDb(next);
          try {
            onActivity?.({
              action: "custom_command_delete",
              source: "chat",
              actor: String(userstate?.username || "").trim().toLowerCase() || "unknown",
              detail: target,
              meta: { command: target },
            });
          } catch {}
          return replyRaw(`Deleted ${target}`);
        }

        if (cmd === "!undelcmd") {
          const next = { version: 1, commands: { ...(cache.commands || {}) } };
          if (!next.commands[target]) return replyRaw(`No such command: ${target}`);
          next.commands[target] = {
            ...normalizeCommandEntry(next.commands[target]),
            enabled: true,
            deleted: false,
            deletedAt: null,
          };
          await saveToDb(next);
          try {
            onActivity?.({
              action: "custom_command_restore",
              source: "chat",
              actor: String(userstate?.username || "").trim().toLowerCase() || "unknown",
              detail: target,
              meta: { command: target },
            });
          } catch {}
          return replyRaw(`Restored ${target}`);
        }

        const cfg = parseSetCmdPlatformFlags(parts.slice(2));
        const response = parts.slice(2 + cfg.consumed).join(" ").trim();
        if (!response) {
          return replyRaw(
            "Usage: !setcmd <!command> [--discord|--twitch|--both] <response>"
          );
        }
        const next = { version: 1, commands: { ...(cache.commands || {}) } };
        next.commands[target] = {
          response,
          platforms: cfg.platforms,
          enabled: true,
          deleted: false,
          deletedAt: null,
          cooldowns: { twitchMs: 0, discordMs: 0 },
        };
        await saveToDb(next);
        try {
          onActivity?.({
            action: "custom_command_set",
            source: "chat",
            actor: String(userstate?.username || "").trim().toLowerCase() || "unknown",
            detail: target,
            meta: { command: target, platforms: cfg.platforms },
          });
        } catch {}
        return replyRaw(`Saved ${target} (${cfg.platforms.join(", ")}).`);
      }

      const entry = normalizeCommandEntry(cache?.commands?.[cmd]);
      const platform = userstate?.__discordRelay ? "discord" : "twitch";
      if (entry?.deleted || entry?.enabled === false) return;
      if (!entry?.platforms?.includes(platform)) return;
      const template = String(entry?.response || "");
      if (!template) return;

      const cooldownMs =
        platform === "discord"
          ? normalizeCooldownMs(entry?.cooldowns?.discordMs, 0)
          : normalizeCooldownMs(entry?.cooldowns?.twitchMs, 0);
      if (cooldownMs > 0) {
        const sender = String(userstate?.username || "").trim().toLowerCase() || "unknown";
        const key = `${platform}:${cmd}:${sender}`;
        const now = Date.now();
        const until = Number(cooldownByKey.get(key) || 0);
        if (until > now) return;
        cooldownByKey.set(key, now + cooldownMs);
      }

      const counts = commandCounter?.getSnapshot?.()?.counts || {};
      const numUses = Number(counts?.[cmd] || 0) + 1; // record happens elsewhere; keep pajbot-like "this call included"

      const senderLogin = String(userstate?.username || "").toLowerCase();
      const senderName = String(userstate?.["display-name"] || userstate?.username || "someone");
      const args = parts.slice(1);
      const textOut = renderPajbotTemplate(template, {
        command: cmd,
        args,
        user: { login: senderLogin, displayName: senderName },
        counts,
        commandNumUses: numUses,
        countStore,
        birthYear,
        now: new Date(),
      });

      if (!String(textOut || "").trim()) return;
      return replyRaw(textOut);
    } catch (e) {
      logger?.warn?.("[custom_commands] handler failed:", String(e?.message || e));
    }
  };

  client.on("message", handler);

  return () => {
    try {
      client.off?.("message", handler);
    } catch {
      client.removeListener?.("message", handler);
    }
  };
}
