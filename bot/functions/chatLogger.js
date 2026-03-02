import fs from "fs";
import path from "path";

function sanitizeLogText(value) {
  return String(value ?? "").replace(/[\r\n]+/g, " ").trim();
}

function normalizeCommandChannelKey(channel) {
  return String(channel || "")
    .trim()
    .replace(/^#/, "")
    .toLowerCase();
}

function getDateKeyInTimeZone(ms, timeZone = "America/New_York") {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date(ms));

    const year = parts.find((p) => p.type === "year")?.value;
    const month = parts.find((p) => p.type === "month")?.value;
    const day = parts.find((p) => p.type === "day")?.value;

    if (year && month && day) return `${year}-${month}-${day}`;
  } catch (e) {
    console.warn("[LOG] timezone date key failed:", String(e?.message || e));
  }

  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getMsUntilNextMidnightInTimeZone({ timeZone = "America/New_York", lookaheadMs = 36 * 60 * 60 * 1000 } = {}) {
  const now = Date.now();
  const currentKey = getDateKeyInTimeZone(now, timeZone);

  let low = 1000;
  let high = Math.max(1000, Number(lookaheadMs) || 36 * 60 * 60 * 1000);

  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    const keyAtMid = getDateKeyInTimeZone(now + mid, timeZone);
    if (keyAtMid === currentKey) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }

  return low;
}

export function createChatLogger({
  rootDir,
  commandCounter = null,
  timeZone = "America/New_York",
  rotateLookaheadMs = 36 * 60 * 60 * 1000,
  commandWindowMs = 15_000,
} = {}) {
  const ROOT_DIR = path.resolve(String(rootDir || process.cwd()));
  const LOG_PATH = path.join(ROOT_DIR, "chat.log");
  const lastCommandByChannel = new Map();
  let rotateTimer = null;

  function appendLog(type, message) {
    const ts = new Date().toISOString();
    const line = `[${ts}] [${type}] ${sanitizeLogText(message)}`;
    fs.appendFile(LOG_PATH, line + "\n", () => {});
  }

  function recordCommandUsage(channel, userstate, commandText) {
    const key = normalizeCommandChannelKey(channel);
    const rawText = sanitizeLogText(commandText);
    if (!key || !rawText.startsWith("!")) return;

    const command = rawText.split(/\s+/)[0].toLowerCase();
    const user =
      String(userstate?.["display-name"] || userstate?.["username"] || "unknown")
        .trim() || "unknown";

    lastCommandByChannel.set(key, {
      user,
      command,
      at: Date.now(),
    });

    try {
      commandCounter?.record?.(command);
    } catch {}

    console.log(`[TWITCH][CMD] ${user} used ${command} in #${key}`);
  }

  function logRecentCommandResponse(channel, responseText, transport = "irc") {
    const key = normalizeCommandChannelKey(channel);
    if (!key) return;

    const ctx = lastCommandByChannel.get(key);
    if (!ctx) return;

    const ageMs = Date.now() - Number(ctx.at || 0);
    lastCommandByChannel.delete(key);
    if (!Number.isFinite(ageMs) || ageMs > commandWindowMs) return;

    const clean = sanitizeLogText(responseText);
    if (!clean) return;

    console.log(
      `[TWITCH][${String(transport || "irc").toUpperCase()}] ${ctx.user} used ${ctx.command} RESPONSE: ${clean}`
    );
  }

  function rotateChatLog() {
    try {
      if (fs.existsSync(LOG_PATH)) {
        fs.unlinkSync(LOG_PATH);
      }
      fs.writeFileSync(LOG_PATH, "", "utf8");
      appendLog("LOG", `Rotated chat.log at ${timeZone} midnight`);
      console.log(`[LOG] Rotated chat.log at ${new Date().toISOString()}`);
    } catch (e) {
      console.error("[LOG] Failed to rotate chat.log:", String(e?.message || e));
    }
  }

  function scheduleChatLogRotation() {
    if (rotateTimer) {
      clearTimeout(rotateTimer);
    }

    const delayMs = getMsUntilNextMidnightInTimeZone({
      timeZone,
      lookaheadMs: rotateLookaheadMs,
    });
    const runAt = new Date(Date.now() + delayMs).toISOString();
    console.log(`[LOG] Next chat.log rotation at ${runAt} (${timeZone} midnight)`);

    rotateTimer = setTimeout(() => {
      rotateChatLog();
      scheduleChatLogRotation();
    }, delayMs);

    if (typeof rotateTimer?.unref === "function") {
      rotateTimer.unref();
    }
  }

  if (!fs.existsSync(LOG_PATH)) {
    fs.writeFileSync(LOG_PATH, "", "utf8");
  }
  scheduleChatLogRotation();

  return {
    appendLog,
    recordCommandUsage,
    logRecentCommandResponse,
  };
}
