import { resolveStateSchema } from "../../data/postgres/db.js";
import { ensureStateTable, readStateValue, writeStateValue } from "../../data/postgres/stateStore.js";
import { renderPajbotTemplate } from "../functions/pajbotTemplate.js";

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
  const instance = String(process.env.INSTANCE_NAME || "default").trim() || "default";
  const stateKey = "custom_commands";
  const chan = String(channelName || "").trim().replace(/^#/, "");

  let cache = buildEmpty();

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

      // Mod management: !setcmd / !delcmd
      if (cmd === "!setcmd" || cmd === "!delcmd") {
        const perms =
          typeof getChatPerms === "function"
            ? getChatPerms(userstate, { channelLogin: chan })
            : { isPermitted: Boolean(userstate?.mod || userstate?.badges?.broadcaster === "1") };
        if (!perms.isPermitted) return;

        const target = normalizeCommand(parts[1]);
        if (!target) return replyRaw(`Usage: ${cmd} <!command> ${cmd === "!setcmd" ? "<response>" : ""}`.trim());
        if (target === "!setcmd" || target === "!delcmd") return replyRaw("That command is reserved.");

        if (cmd === "!delcmd") {
          const next = { version: 1, commands: { ...(cache.commands || {}) } };
          if (!next.commands[target]) return replyRaw(`No such command: ${target}`);
          delete next.commands[target];
          await saveToDb(next);
          return replyRaw(`Deleted ${target}`);
        }

        const response = parts.slice(2).join(" ").trim();
        if (!response) return replyRaw("Usage: !setcmd <!command> <response>");
        const next = { version: 1, commands: { ...(cache.commands || {}) } };
        next.commands[target] = { response };
        await saveToDb(next);
        return replyRaw(`Saved ${target}`);
      }

      const entry = cache?.commands?.[cmd];
      const template = typeof entry === "string" ? entry : String(entry?.response || "");
      if (!template) return;

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

