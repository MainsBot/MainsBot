import fs from "fs";

function safeJsonParse(text, fallback = null) {
  try {
    return JSON.parse(String(text ?? ""));
  } catch {
    return fallback;
  }
}

function readJsonFile(path, fallback) {
  try {
    const raw = fs.readFileSync(path, "utf8");
    const parsed = safeJsonParse(raw, null);
    return parsed != null ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function clampMs(value, fallbackMs) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallbackMs;
  return Math.floor(n);
}

export function startTimers({
  client,
  channelName,
  twitchFunctions,
  robloxFunctions,
  getTrackedRobloxUserId,
  settingsPath = "./SETTINGS.json",
  streamsPath = "./STREAMS.json",
  joinTimerMs = process.env.JOIN_TIMER,
  promoIntervalMs = 60 * 7.4 * 1000,
  logger = console,
} = {}) {
  if (!client) throw new Error("startTimers: missing client");
  if (!channelName) throw new Error("startTimers: missing channelName");
  if (!twitchFunctions) throw new Error("startTimers: missing twitchFunctions");
  if (!robloxFunctions) throw new Error("startTimers: missing robloxFunctions");
  if (typeof getTrackedRobloxUserId !== "function") {
    throw new Error("startTimers: missing getTrackedRobloxUserId()");
  }

  const CHANNEL_NAME = String(channelName).replace(/^#/, "");

  let stopped = false;
  let joinTimerHandle = null;
  let promoIntervalHandle = null;

  const baseJoinMs = clampMs(joinTimerMs, 240_000);
  const promoMs = clampMs(promoIntervalMs, 60 * 7.4 * 1000);

  async function runJoinTimerTick() {
    const STREAMS = readJsonFile(streamsPath, {});
    const SETTINGS = readJsonFile(settingsPath, {});

    const linkedRobloxUserId = getTrackedRobloxUserId();
    const location = linkedRobloxUserId
      ? await robloxFunctions
          .getPresence(linkedRobloxUserId)
          .then((r) => robloxFunctions.resolvePresenceLocation(r))
          .catch(() => "Website")
      : "Website";

    const isLive = (await twitchFunctions.isLive().catch(() => false)) === true;
    const twitchTimersEnabled =
      SETTINGS.timers === true && SETTINGS.ks === false && isLive;

    // Compute next delay (this fixes the old behavior where MUTATED_JOIN_TIMER changed but setInterval didn't).
    let mutatedJoinMs = baseJoinMs;
    const averageViewers = STREAMS?.averageviewers;
    if (averageViewers != null) {
      if (averageViewers < 40) mutatedJoinMs = Math.floor(baseJoinMs * 0.8);
      else if (averageViewers > 60) mutatedJoinMs = Math.floor(baseJoinMs * 1.5);
    }

    if (twitchTimersEnabled) {
      let currentMode = String(SETTINGS.currentMode || "").replace(".on", "");
      currentMode = currentMode.replace("!", "");

      const twitchTimerCommands =
        SETTINGS && typeof SETTINGS.timer === "object" && SETTINGS.timer
          ? SETTINGS.timer
          : {};

      for (const key in twitchTimerCommands) {
        if (key === currentMode) {
          if (location !== "Website") {
            const twitchTimerMessage = String(twitchTimerCommands[key] || "").trim();
            if (twitchTimerMessage) {
              client.action(CHANNEL_NAME, twitchTimerMessage);
            }
          }
        }
      }
    }

    return clampMs(mutatedJoinMs, baseJoinMs);
  }

  async function scheduleJoinLoop(nextDelayMs = baseJoinMs) {
    if (stopped) return;
    const delayMs = clampMs(nextDelayMs, baseJoinMs);
    joinTimerHandle = setTimeout(async () => {
      if (stopped) return;
      try {
        const next = await runJoinTimerTick();
        scheduleJoinLoop(next);
      } catch (e) {
        logger?.warn?.("[timers] join timer tick failed:", String(e?.message || e));
        scheduleJoinLoop(baseJoinMs);
      }
    }, delayMs);
    joinTimerHandle.unref?.();
  }

  async function runPromoTick() {
    const SETTINGS = readJsonFile(settingsPath, {});
    const isLive = (await twitchFunctions.isLive().catch(() => false)) === true;
    if (!(SETTINGS.timers === true && SETTINGS.ks === false && isLive)) return;

    const promo = ["!discord", "!kick "];
    const promoTimer = promo[Math.floor(Math.random() * promo.length)];
    client.action(CHANNEL_NAME, String(promoTimer));
  }

  scheduleJoinLoop(baseJoinMs);

  promoIntervalHandle = setInterval(() => {
    if (stopped) return;
    void runPromoTick().catch(() => {});
  }, promoMs);
  promoIntervalHandle.unref?.();

  logger?.log?.(
    `[timers] join=${baseJoinMs}ms promo=${promoMs}ms settings=${settingsPath} streams=${streamsPath}`
  );

  return {
    stop() {
      stopped = true;
      try {
        if (joinTimerHandle) clearTimeout(joinTimerHandle);
      } catch {}
      try {
        if (promoIntervalHandle) clearInterval(promoIntervalHandle);
      } catch {}
    },
  };
}

