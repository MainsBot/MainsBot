import { Client, GatewayIntentBits } from "discord.js";

export function createDiscordMessenger({ token, intents, logger = console } = {}) {
  const botToken = String(token || "").trim();
  if (!botToken) return null;

  let client = null;
  let loginPromise = null;
  const channelCache = new Map();

  const resolvedIntents =
    Array.isArray(intents) && intents.length ? intents : [GatewayIntentBits.Guilds];
  const fallbackIntents = [GatewayIntentBits.Guilds];

  function looksLikePrivilegedIntentError(err) {
    const msg = String(err?.message || err || "").toLowerCase();
    return (
      msg.includes("privileged intent") ||
      msg.includes("disallowed intent") ||
      msg.includes("intent") && msg.includes("not enabled")
    );
  }

  async function ensureClient() {
    if (client) return client;
    if (loginPromise) return loginPromise;

    client = new Client({ intents: resolvedIntents });
    loginPromise = (async () => {
      try {
        await client.login(botToken);
        try {
          const who = client?.user?.tag || client?.user?.id || "unknown";
          logger?.log?.(`[discord] logged in as ${who}`);
        } catch {}
        return client;
      } catch (e) {
        // If the bot is missing privileged intents (e.g. Message Content), retry with minimal intents
        // so non-relay features like logging can still work.
        if (looksLikePrivilegedIntentError(e) && String(resolvedIntents) !== String(fallbackIntents)) {
          logger?.warn?.(
            "[discord] login failed due to intents; retrying with minimal intents (relay will be disabled until you enable intents in the Discord Dev Portal)."
          );
          try {
            await client.destroy?.();
          } catch {}
          client = new Client({ intents: fallbackIntents });
          await client.login(botToken);
          try {
            const who = client?.user?.tag || client?.user?.id || "unknown";
            logger?.log?.(`[discord] logged in as ${who} (minimal intents)`);
          } catch {}
          return client;
        }
        throw e;
      }
    })();

    try {
      await loginPromise;
      return client;
    } catch (e) {
      try {
        await client.destroy?.();
      } catch {}
      client = null;
      loginPromise = null;
      channelCache.clear();
      logger?.warn?.("[discord] bot login failed:", String(e?.message || e));
      throw e;
    }
  }

  async function fetchTextChannel(channelId) {
    const id = String(channelId || "").trim();
    if (!id) throw new Error("Missing Discord channel id.");
    if (channelCache.has(id)) return channelCache.get(id);

    const c = await ensureClient();
    const ch = await c.channels.fetch(id).catch(() => null);
    if (!ch || typeof ch.send !== "function") {
      throw new Error(`Invalid Discord channel id (${id}).`);
    }
    channelCache.set(id, ch);
    return ch;
  }

  async function send(channelId, payload) {
    const ch = await fetchTextChannel(channelId);
    return ch.send(payload);
  }

  async function destroy() {
    channelCache.clear();
    if (!client) return;
    const c = client;
    client = null;
    loginPromise = null;
    try {
      await c.destroy?.();
    } catch {}
  }

  return { send, destroy, getClient: ensureClient };
}
