import fs from "fs";
import path from "path";

import { resolveStateSchema } from "../../data/postgres/db.js";
import { ensureStateTable, readStateValue, writeStateValue } from "../../data/postgres/stateStore.js";

function ensureDirFor(filePath) {
  const dir = path.dirname(filePath);
  if (!dir || dir === "." || dir === filePath) return;
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function safeJsonParse(text, fallback) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

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

function readAubreyTab(aubreyTabPath) {
  const fallback = {
    balance: 0,
    lastTouchedMs: Date.now(),
    lastInterestAppliedMs: Date.now(),
  };

  try {
    if (!aubreyTabPath) return fallback;
    if (!fs.existsSync(aubreyTabPath)) return fallback;

    const raw = fs.readFileSync(aubreyTabPath, "utf8");
    const json = safeJsonParse(raw, null);
    if (!json || typeof json !== "object") return fallback;

    const balance = Number(json.balance ?? 0);
    const lastTouchedMs = Number(json.lastTouchedMs ?? Date.now());
    const lastInterestAppliedMs = Number(
      json.lastInterestAppliedMs ?? lastTouchedMs ?? Date.now()
    );

    return {
      balance: Number.isFinite(balance) ? balance : 0,
      lastTouchedMs: Number.isFinite(lastTouchedMs) ? lastTouchedMs : Date.now(),
      lastInterestAppliedMs: Number.isFinite(lastInterestAppliedMs)
        ? lastInterestAppliedMs
        : Date.now(),
    };
  } catch {
    return fallback;
  }
}

function writeAubreyTab(aubreyTabPath, tab) {
  if (!aubreyTabPath) return;
  ensureDirFor(aubreyTabPath);
  fs.writeFileSync(aubreyTabPath, JSON.stringify(tab, null, 2), "utf8");
}

function hasDatabaseUrl() {
  return Boolean(String(process.env.DATABASE_URL || "").trim());
}

// Applies interest after grace period; does NOT reset lastTouched
function applyInterest(tab, nowMs = Date.now()) {
  const graceEnd = tab.lastTouchedMs + GRACE_DAYS * DAY_MS;

  if (nowMs <= graceEnd) return tab;

  // Start applying daily interest after graceEnd, and only once per full day
  const start = Math.max(tab.lastInterestAppliedMs || 0, graceEnd);
  const fullDays = Math.floor((nowMs - start) / DAY_MS);

  if (fullDays <= 0) return tab;

  const factor = Math.pow(1 + DAILY_RATE, fullDays);
  tab.balance = round2(tab.balance * factor);
  tab.lastInterestAppliedMs = start + fullDays * DAY_MS;

  return tab;
}

function flagFromValue(value) {
  return /^(1|true|yes|on)$/i.test(String(value ?? "").trim());
}

export function isAubreyTabModuleEnabled() {
  const raw = String(process.env.MODULE_AUBREYTAB ?? "").trim();
  if (raw) return flagFromValue(raw);
  return true; // backward compatible default
}

export function registerAubreyTabModule({
  client,
  channelName,
  getChatPerms,
  aubreyTabPath = process.env.AUBREY_TAB_PATH,
  logger = console,
} = {}) {
  if (!client || typeof client.on !== "function") {
    throw new Error("registerAubreyTabModule: missing tmi client");
  }
  if (typeof getChatPerms !== "function") {
    throw new Error("registerAubreyTabModule: missing getChatPerms");
  }

  const resolvedPath = path.resolve(
    process.cwd(),
    String(aubreyTabPath || path.join("secrets", "aubrey_tab.json"))
  );
  const defaultChannel = String(channelName || "").replace(/^#/, "").trim();
  const instance = String(process.env.INSTANCE_NAME || "default").trim() || "default";
  const schema = resolveStateSchema();
  const useDb = hasDatabaseUrl();

  async function readTabFromDb() {
    await ensureStateTable({ schema });
    const fallback = readAubreyTab(resolvedPath);
    const value = await readStateValue({ schema, instance, key: "aubrey_tab", fallback });
    return value && typeof value === "object" ? value : fallback;
  }

  async function writeTabToDb(tab) {
    await ensureStateTable({ schema });
    await writeStateValue({ schema, instance, key: "aubrey_tab", value: tab });
  }

  client.on("message", async (channel, userstate, message, self) => {
    try {
      if (self) return;

      const msg = String(message || "").trim();
      if (!msg) return;

      const parts = msg.split(/\s+/);
      const cmd = (parts[0] || "").toLowerCase();

      if (cmd !== "!aubreytab" && cmd !== "!addaubreytab" && cmd !== "!setaubreytab") {
        return;
      }

      const chan = String(channel || "").replace(/^#/, "") || defaultChannel;

      const replyRaw = (text) => {
        const nonce = userstate?.["client-nonce"] || "";
        const parentId = userstate?.["id"] || "";
        return client.raw(
          `@client-nonce=${nonce};reply-parent-msg-id=${parentId} PRIVMSG #${chan} :${text}`
        );
      };

      const nowMs = Date.now();
      const tab = applyInterest(
        useDb ? await readTabFromDb() : readAubreyTab(resolvedPath),
        nowMs
      );

      if (cmd === "!aubreytab") {
        if (useDb) {
          await writeTabToDb(tab);
        } else {
          writeAubreyTab(resolvedPath, tab);
        }

        const graceEnd = tab.lastTouchedMs + GRACE_DAYS * DAY_MS;
        const inGrace = nowMs <= graceEnd;

        if (inGrace) {
          const daysLeft = Math.max(0, Math.ceil((graceEnd - nowMs) / DAY_MS));
          return replyRaw(
            `Aubrey's tab: ${fmtMoney(tab.balance)} | Interest starts in ~${daysLeft} day(s).`
          );
        }

        return replyRaw(
          `Aubrey's tab: ${fmtMoney(tab.balance)} | +5%/day compounding (after 7 day grace).`
        );
      }

      const perms = getChatPerms(userstate, { channelLogin: chan });
      if (!perms.isPermitted) {
        return replyRaw("Mods only 👀");
      }

      const amount = parseAmount(parts[1]);
      if (amount === null) {
        return replyRaw(`Usage: ${cmd} <amount>  (ex: ${cmd} 10.50)`);
      }

      if (cmd === "!addaubreytab") {
        tab.balance = round2(tab.balance + amount);
        tab.lastTouchedMs = nowMs;
        tab.lastInterestAppliedMs = nowMs;
        if (useDb) {
          await writeTabToDb(tab);
        } else {
          writeAubreyTab(resolvedPath, tab);
        }
        return replyRaw(
          `Added ${fmtMoney(amount)}. Aubrey's tab is now ${fmtMoney(tab.balance)}.`
        );
      }

      if (cmd === "!setaubreytab") {
        tab.balance = round2(amount);
        tab.lastTouchedMs = nowMs;
        tab.lastInterestAppliedMs = nowMs;
        if (useDb) {
          await writeTabToDb(tab);
        } else {
          writeAubreyTab(resolvedPath, tab);
        }
        return replyRaw(`Set Aubrey tab to ${fmtMoney(tab.balance)}.`);
      }
    } catch (err) {
      logger?.error?.("[aubreytab] error:", err);
    }
  });

  return {};
}
