import { resolveStateSchema } from "../../data/postgres/db.js";
import { ensureStateTable, readStateValue, writeStateValue } from "../../data/postgres/stateStore.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const GRACE_DAYS = 7;
const DAILY_RATE = 0.05; // 5% per day (after 7 days idle)

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function fmtMoney(n) {
  return `$${round2(n).toFixed(2)}`;
}

function parseAmount(arg) {
  const s = String(arg || "").trim().replace(/^\$/, "");
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return n;
}

function normalizeLogin(value) {
  return String(value || "")
    .trim()
    .replace(/^@/, "")
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "");
}

function buildEmptyState() {
  return { version: 1, users: {} };
}

function normalizeTabEntry(raw, nowMs) {
  const balance = Number(raw?.balance ?? 0);
  const lastTouchedMs = Number(raw?.lastTouchedMs ?? nowMs);
  const lastInterestAppliedMs = Number(raw?.lastInterestAppliedMs ?? lastTouchedMs ?? nowMs);
  const createdMs = Number(raw?.createdMs ?? nowMs);
  const paidOffMs =
    raw?.paidOffMs == null ? null : Number.isFinite(Number(raw?.paidOffMs)) ? Number(raw?.paidOffMs) : null;

  return {
    balance: Number.isFinite(balance) ? round2(balance) : 0,
    lastTouchedMs: Number.isFinite(lastTouchedMs) ? lastTouchedMs : nowMs,
    lastInterestAppliedMs: Number.isFinite(lastInterestAppliedMs) ? lastInterestAppliedMs : nowMs,
    createdMs: Number.isFinite(createdMs) ? createdMs : nowMs,
    paidOffMs,
  };
}

function migrateLegacyStateIfNeeded(value, nowMs) {
  if (!value || typeof value !== "object") return buildEmptyState();
  if (value.version === 1 && value.users && typeof value.users === "object") return value;

  // Legacy: { balance, lastTouchedMs, lastInterestAppliedMs } -> users.aubrey
  if (Object.prototype.hasOwnProperty.call(value, "balance")) {
    return {
      version: 1,
      users: {
        aubrey: normalizeTabEntry(value, nowMs),
      },
    };
  }

  return buildEmptyState();
}

function hasDatabaseUrl() {
  return Boolean(String(process.env.DATABASE_URL || "").trim());
}

function applyInterestToEntry(entry, nowMs) {
  const tab = normalizeTabEntry(entry, nowMs);
  if (tab.balance <= 0) return tab;

  const graceEnd = tab.lastTouchedMs + GRACE_DAYS * DAY_MS;
  if (nowMs <= graceEnd) return tab;

  const start = Math.max(tab.lastInterestAppliedMs || 0, graceEnd);
  const fullDays = Math.floor((nowMs - start) / DAY_MS);
  if (fullDays <= 0) return tab;

  const factor = Math.pow(1 + DAILY_RATE, fullDays);
  tab.balance = round2(tab.balance * factor);
  tab.lastInterestAppliedMs = start + fullDays * DAY_MS;
  return tab;
}

export function isAubreyTabModuleEnabled() {
  const raw = String(process.env.MODULE_AUBREYTAB ?? "").trim();
  if (!raw) return true;
  return /^(1|true|yes|on)$/i.test(raw);
}

export function registerAubreyTabModule({
  client,
  channelName,
  getChatPerms,
  logger = console,
} = {}) {
  if (!client || typeof client.on !== "function") {
    throw new Error("registerAubreyTabModule: missing tmi client");
  }
  if (typeof getChatPerms !== "function") {
    throw new Error("registerAubreyTabModule: missing getChatPerms");
  }

  const defaultChannel = String(channelName || "").replace(/^#/, "").trim();
  const instance = String(process.env.INSTANCE_NAME || "default").trim() || "default";
  const schema = resolveStateSchema();
  const stateKey = "tabs";
  const legacyStateKey = "aubrey_tabs";
  const useDb = hasDatabaseUrl();

  async function readTabsState(nowMs) {
    const fallback = buildEmptyState();
    if (!useDb) return fallback;
    await ensureStateTable({ schema });
    let value = await readStateValue({ schema, instance, key: stateKey, fallback: null });
    if (!value) {
      // One-time migration from old key name.
      const legacyValue = await readStateValue({
        schema,
        instance,
        key: legacyStateKey,
        fallback: null,
      });
      if (legacyValue) {
        value = legacyValue;
        const migrated = migrateLegacyStateIfNeeded(value, nowMs);
        await writeStateValue({ schema, instance, key: stateKey, value: migrated });
      }
    }
    return migrateLegacyStateIfNeeded(value, nowMs);
  }

  async function writeTabsState(state) {
    if (!useDb) return;
    await ensureStateTable({ schema });
    await writeStateValue({ schema, instance, key: stateKey, value: state });
  }

  client.on("message", async (channel, userstate, message, self) => {
    try {
      if (self) return;

      const msg = String(message || "").trim();
      if (!msg) return;

      const parts = msg.split(/\s+/);
      const cmd = (parts[0] || "").toLowerCase();

      const isTabCmd = cmd === "!tab" || cmd === "!addtab" || cmd === "!settab" || cmd === "!givetab";
      if (!isTabCmd) return;

      const chan = String(channel || "").replace(/^#/, "") || defaultChannel;
      const replyRaw = (text) => {
        const nonce = userstate?.["client-nonce"] || "";
        const parentId = userstate?.["id"] || "";
        return client.raw(
          `@client-nonce=${nonce};reply-parent-msg-id=${parentId} PRIVMSG #${chan} :${text}`
        );
      };

      if (!useDb) {
        return replyRaw("Tabs are not configured (missing [database].url).");
      }

      const nowMs = Date.now();
      const state = await readTabsState(nowMs);
      const users = state.users && typeof state.users === "object" ? state.users : {};
      state.users = users;

      if (cmd === "!tab") {
        const who = normalizeLogin(parts[1] || userstate?.username);
        if (!who) return replyRaw("Usage: !tab <twitch_login>");

        if (!users[who]) {
          return replyRaw(`${who} doesn't have a tab (no record).`);
        }

        const updated = applyInterestToEntry(users[who], nowMs);
        users[who] = updated;
        await writeTabsState(state);

        if (updated.balance <= 0) {
          return replyRaw(`${who}'s tab is paid off (${fmtMoney(0)}).`);
        }

        const graceEnd = updated.lastTouchedMs + GRACE_DAYS * DAY_MS;
        const inGrace = nowMs <= graceEnd;
        if (inGrace) {
          const daysLeft = Math.max(0, Math.ceil((graceEnd - nowMs) / DAY_MS));
          return replyRaw(
            `${who}'s tab: ${fmtMoney(updated.balance)} | Interest starts in ~${daysLeft} day(s).`
          );
        }

        return replyRaw(
          `${who}'s tab: ${fmtMoney(updated.balance)} | +5%/day compounding (after 7 day grace).`
        );
      }

      const perms = getChatPerms(userstate, { channelLogin: chan });
      if (!perms.isPermitted) {
        return replyRaw("Mods only.");
      }

      if (cmd === "!givetab") {
        const who = normalizeLogin(parts[1]);
        if (!who) return replyRaw("Usage: !givetab <twitch_login>");
        if (users[who]) return replyRaw(`${who} already has a tab record.`);
        users[who] = normalizeTabEntry(
          { balance: 0, lastTouchedMs: nowMs, lastInterestAppliedMs: nowMs, createdMs: nowMs, paidOffMs: nowMs },
          nowMs
        );
        await writeTabsState(state);
        return replyRaw(`Created tab record for ${who}. Use !addtab ${who} <amount>.`);
      }

      if (cmd === "!addtab") {
        const who = normalizeLogin(parts[1]);
        const amount = parseAmount(parts[2]);
        if (!who || amount === null) return replyRaw("Usage: !addtab <twitch_login> <amount>");
        if (!users[who]) return replyRaw(`${who} doesn't have a tab (use !givetab ${who}).`);

        const updated = applyInterestToEntry(users[who], nowMs);
        updated.balance = round2(updated.balance + amount);
        updated.lastTouchedMs = nowMs;
        updated.lastInterestAppliedMs = nowMs;
        updated.paidOffMs = updated.balance <= 0 ? nowMs : null;
        if (updated.balance <= 0) updated.balance = 0;
        users[who] = updated;
        await writeTabsState(state);

        if (updated.balance <= 0) return replyRaw(`${who} paid off their tab.`);
        return replyRaw(`${who}'s tab is now ${fmtMoney(updated.balance)}.`);
      }

      if (cmd === "!settab") {
        const who = normalizeLogin(parts[1]);
        const amount = parseAmount(parts[2]);
        if (!who || amount === null) return replyRaw("Usage: !settab <twitch_login> <amount>");
        if (!users[who]) return replyRaw(`${who} doesn't have a tab (use !givetab ${who}).`);

        const updated = applyInterestToEntry(users[who], nowMs);
        updated.balance = round2(amount);
        updated.lastTouchedMs = nowMs;
        updated.lastInterestAppliedMs = nowMs;
        updated.paidOffMs = updated.balance <= 0 ? nowMs : null;
        if (updated.balance <= 0) updated.balance = 0;
        users[who] = updated;
        await writeTabsState(state);

        if (updated.balance <= 0) return replyRaw(`${who} paid off their tab.`);
        return replyRaw(`Set ${who}'s tab to ${fmtMoney(updated.balance)}.`);
      }
    } catch (err) {
      logger?.error?.("[tab] error:", err);
    }
  });

  return {};
}
