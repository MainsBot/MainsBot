import { setTimeout as delay } from "timers/promises";
import { connectStreamlabs } from "../api/streamlabs/index.js";

function flagFromValue(value) {
  return /^(1|true|yes|on)$/i.test(String(value ?? "").trim());
}

export function isAlertsModuleEnabled() {
  const raw = String(process.env.MODULE_ALERTS ?? "").trim();
  if (raw) return flagFromValue(raw);
  return true; // default on (backward compatible)
}

function getDonationAmount(d) {
  const raw = d?.raw && typeof d.raw === "object" ? d.raw : null;

  const candidates = [
    d?.amount,
    d?.amount_raw,
    d?.amount_value,
    d?.formattedAmount,
    d?.amount_formatted,
    d?.formatted_amount,
    raw?.amount,
    raw?.amount_raw,
    raw?.amount_value,
    raw?.formattedAmount,
    raw?.amount_formatted,
    raw?.formatted_amount,
  ];

  for (const v of candidates) {
    const n = toMoneyNumber(v);
    if (Number.isFinite(n)) return n;
  }

  return 0;
}

function toMoneyNumber(v) {
  if (v == null) return NaN;
  if (typeof v === "number") return Number.isFinite(v) ? v : NaN;

  let s = String(v).trim();
  if (!s) return NaN;

  s = s.replace(/[^\d.,-]/g, "");
  if (!s) return NaN;

  const hasComma = s.includes(",");
  const hasDot = s.includes(".");

  if (hasComma && hasDot) {
    const lastComma = s.lastIndexOf(",");
    const lastDot = s.lastIndexOf(".");

    if (lastComma > lastDot) {
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      s = s.replace(/,/g, "");
    }
  } else if (hasComma && !hasDot) {
    const commaCount = (s.match(/,/g) || []).length;

    if (commaCount > 1) {
      s = s.replace(/,/g, "");
    } else {
      const [whole, fraction = ""] = s.split(",");
      if (fraction.length === 3 && whole.length >= 1) {
        s = `${whole}${fraction}`;
      } else {
        s = `${whole}.${fraction}`;
      }
    }
  }

  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

function getCurrencyInfo(d) {
  const code = (d?.currency || d?.currency_code || d?.currencyCode || d?.currency_type || "")
    .toString()
    .trim()
    .toUpperCase();

  const symbol = (d?.currency_symbol || d?.currencySymbol || "").toString().trim();

  return { code, symbol };
}

function formatMoney(amount, { code, symbol }) {
  if (!amount || isNaN(amount)) return `${symbol || ""}0`;

  const hasCents = Math.round(amount * 100) % 100 !== 0;

  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: code || "USD",
      minimumFractionDigits: hasCents ? 2 : 0,
      maximumFractionDigits: hasCents ? 2 : 0,
    }).format(amount);
  } catch {
    return `${symbol || "$"}${hasCents ? amount.toFixed(2) : Math.round(amount)}`;
  }
}

function normalizeDonationAlertMode(value) {
  const mode = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  if (mode === "emote_spam" || mode === "spam" || mode === "emote") {
    return "emote_spam";
  }
  return "message";
}

function normalizeSubPlan(methods, tags) {
  const plan = String(
    methods?.plan ||
      methods?.prime ||
      tags?.["msg-param-sub-plan"] ||
      tags?.["msg-param-gift-months"] ||
      ""
  )
    .trim()
    .toLowerCase();

  if (!plan) return "";
  if (plan === "prime") return "prime";
  if (plan === "1000" || plan === "2000" || plan === "3000") return plan;
  return "";
}

function subPlanToUsd(methods, tags) {
  const plan = normalizeSubPlan(methods, tags);
  if (plan === "2000") return 9.99;
  if (plan === "3000") return 24.99;
  return 4.99;
}

export function registerAlertsModule({
  client,
  channelName,
  twitchFunctions,
  loadSettings,
  saveSettings,
  getContextKillswitchState,
  modlogUser = "sister_avanti",
  streamlabsSocketToken = process.env.STREAMLABS_SOCKET_TOKEN,
  donationAlertMode = process.env.STREAMLABS_DONATION_ALERT_MODE,
  onDonationContribution = null,
  logger = console,
} = {}) {
  if (!client || typeof client.on !== "function") {
    throw new Error("registerAlertsModule: missing tmi client");
  }
  if (!channelName) {
    throw new Error("registerAlertsModule: missing channelName");
  }
  if (!twitchFunctions) {
    throw new Error("registerAlertsModule: missing twitchFunctions");
  }
  if (typeof loadSettings !== "function" || typeof saveSettings !== "function") {
    throw new Error("registerAlertsModule: missing loadSettings/saveSettings");
  }

  const CHANNEL_NAME = String(channelName || "").trim().replace(/^#/, "");
  const DONATION_ALERT_MODE = normalizeDonationAlertMode(donationAlertMode);
  const DONATION_ALERT_EMOTE = "tibb12Bucc";
  const isKs = (settings) =>
    typeof getContextKillswitchState === "function"
      ? Boolean(getContextKillswitchState(settings))
      : Boolean(settings?.ks);

  const sleep = (ms) => delay(Math.max(0, Number(ms) || 0));
  const recordContribution =
    typeof onDonationContribution === "function" ? onDonationContribution : null;

  function queueContribution(contribution) {
    if (!recordContribution) return;
    Promise.resolve(recordContribution(contribution)).catch((e) => {
      logger?.warn?.("[alerts] donation contribution persist failed:", String(e?.message || e));
    });
  }

  async function modActionsLog(channel, targetUser, text) {
    const reason = String(text || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 420);

    await twitchFunctions.timeoutUserByLogin(targetUser, 1, reason).catch((e) => {
      logger?.warn?.(
        "[helix] modActionsLog timeout failed:",
        String(e?.message || e)
      );
    });
  }

  let filtersDisabledUntilMs = 0;
  let filtersDisableSequence = 0;

  async function toggleFiltersTemporarily(channel, ms, reason, options = {}) {
    const logToModActions = options?.logToModActions !== false;
    const waitMs = Math.max(0, Number(ms) || 0);
    const now = Date.now();
    const proposedUntil = now + waitMs;

    if (proposedUntil > filtersDisabledUntilMs) {
      filtersDisabledUntilMs = proposedUntil;
    }

    const mySequence = ++filtersDisableSequence;

    const settings = loadSettings();
    settings.spamFilter = false;
    settings.lengthFilter = false;
    saveSettings(settings);

    const secondsLeft = Math.max(
      0,
      Math.round((filtersDisabledUntilMs - Date.now()) / 1000)
    );
    if (logToModActions) {
      await modActionsLog(
        channel,
        modlogUser,
        `[AUTO] ${reason} - Filters DISABLED for ${secondsLeft}s`
      );
    } else {
      logger?.log?.(`[alerts] ${reason} - Filters DISABLED for ${secondsLeft}s`);
    }

    while (Date.now() < filtersDisabledUntilMs) {
      await sleep(Math.min(1000, filtersDisabledUntilMs - Date.now()));
    }

    if (mySequence !== filtersDisableSequence) return;

    const settings2 = loadSettings();
    settings2.spamFilter = true;
    settings2.lengthFilter = true;
    saveSettings(settings2);

    if (logToModActions) {
      await modActionsLog(channel, modlogUser, `[AUTO] Filters RE-ENABLED after ${reason}`);
    } else {
      logger?.log?.(`[alerts] Filters RE-ENABLED after ${reason}`);
    }
  }

  async function setDonationMode(channel, ms) {
    return toggleFiltersTemporarily(channel, ms, "[BIG DONO DETECTED]", {
      logToModActions: false,
    });
  }

  async function setBitsMode(channel, ms) {
    return toggleFiltersTemporarily(channel, ms, "[BIG BIT DROP DETECTED]", {
      logToModActions: false,
    });
  }

  async function spamBits(channel, count, msg, delayMs = 0) {
    if (delayMs) await sleep(delayMs);
    for (let i = 0; i < count; i++) {
      client.say(channel, msg);
    }
  }

  const EMOTES = ["tibb12Mrkrabs", "tibb12Bucc", "tibb12Love"];
  const randomEmote = () => EMOTES[Math.floor(Math.random() * EMOTES.length)];

  const handlers = {
    subscription: (channel, username, methods, _msg, tags) => {
      const s = loadSettings();
      if (isKs(s)) return;
      queueContribution({
        platform: "twitch_subs",
        login: username,
        displayName: tags?.["display-name"] || username,
        userId: tags?.["user-id"] || "",
        amountUsd: subPlanToUsd(methods, tags),
        count: 1,
        rawUnits: 1,
      });
      client.say(CHANNEL_NAME, "tibb12Subhype tibb12Subhype tibb12Subhype");
      client.say(CHANNEL_NAME, "tibb12Subhype tibb12Subhype tibb12Subhype");
      client.say(CHANNEL_NAME, "tibb12Subhype tibb12Subhype tibb12Subhype");
    },

    giftpaidupgrade: async (channel, username) => {
      const s = loadSettings();
      if (isKs(s)) return;
      queueContribution({
        platform: "twitch_subs",
        login: username,
        displayName: username,
        amountUsd: 4.99,
        count: 1,
        rawUnits: 1,
      });

      const text = `${username} just continued their gifted sub. Thank you so much, ${username}!`;
      await twitchFunctions.sendHelixAnnouncement(text).catch((e) => {
        logger?.warn?.("[helix] announcement failed:", String(e?.message || e));
        client.say(CHANNEL_NAME, text);
      });
    },

    resub: async (channel, username, _streakMonths, _msg, tags, methods) => {
      const s = loadSettings();
      if (isKs(s)) return;
      queueContribution({
        platform: "twitch_subs",
        login: username,
        displayName: tags?.["display-name"] || username,
        userId: tags?.["user-id"] || "",
        amountUsd: subPlanToUsd(methods, tags),
        count: 1,
        rawUnits: 1,
      });

      const e = "tibb12Subhype tibb12Imback tibb12Subhype"
      await sleep(1500);
      client.say(CHANNEL_NAME, e);
      client.say(CHANNEL_NAME, e);
      client.say(CHANNEL_NAME, e);
    },

    raided: async (channel, username, viewers) => {
      const s = loadSettings();
      if (isKs(s)) return;

      const raidViewers = Number(viewers || 0);
      if (raidViewers < 10) return;

      await sleep(1500);

      const text = `${username} just raided with ${raidViewers}! Thank you so much!`;
      await twitchFunctions.sendHelixAnnouncement(text).catch((e) => {
        logger?.warn?.("[helix] announcement failed:", String(e?.message || e));
        client.say(CHANNEL_NAME, text);
      });

      await twitchFunctions.setFollowersOnlyMode(true).catch((e) => {
        logger?.warn?.(
          "[helix] failed to enable followers-only (raid):",
          String(e?.message || e)
        );
      });

      await toggleFiltersTemporarily(
        CHANNEL_NAME,
        60_000,
        `Raid by ${username} (${raidViewers} viewers)`
      );

      await twitchFunctions.setFollowersOnlyMode(false).catch((e) => {
        logger?.warn?.(
          "[helix] failed to disable followers-only (raid):",
          String(e?.message || e)
        );
      });
    },

    clearchat: () => {
      client.say(CHANNEL_NAME, `@${CHANNEL_NAME} the chat has been cleared.`);
    },

    cheer: async (channel, userstate) => {
      const s = loadSettings();
      if (isKs(s)) return;

      const bits = Number(userstate?.bits || 0);
      if (bits < 100) return;
      queueContribution({
        platform: "twitch_bits",
        login: userstate?.username || "",
        displayName: userstate?.["display-name"] || userstate?.username || "",
        userId: userstate?.["user-id"] || "",
        amountUsd: bits / 100,
        count: 1,
        rawUnits: bits,
      });

      const msgPool = ["tibb12Bits tibb12Bits tibb12Bits"];
      const randomMsg = msgPool[Math.floor(Math.random() * msgPool.length)];

      await sleep(1500);

      let count = 0;
      let disableForMs = 0;

      if (bits >= 10000) {
        count = 50;
        disableForMs = 60_000;
      } else if (bits >= 5000) {
        count = 25;
        disableForMs = 60_000;
      } else if (bits >= 1000) {
        count = 10;
        disableForMs = 30_000;
      } else if (bits >= 500) {
        count = 5;
      } else {
        count = 3;
      }

      if (disableForMs) {
        setBitsMode(channel, disableForMs).catch(() => {});
      }

      await spamBits(channel, count, randomMsg, 250);
    },

    subgift: async (channel, username, _streakMonths, _recipient, methods, tags) => {
      const s = loadSettings();
      if (isKs(s)) return;
      queueContribution({
        platform: "twitch_gifts",
        login: username,
        displayName: tags?.["display-name"] || username,
        userId: tags?.["user-id"] || "",
        amountUsd: subPlanToUsd(methods, tags),
        count: 1,
        rawUnits: 1,
      });
    },

    submysterygift: async (channel, username, giftSubCount, methods, tags) => {
      const s = loadSettings();
      if (isKs(s)) return;
      const count = Math.max(1, Math.floor(Number(giftSubCount) || 0));
      const perGiftUsd = subPlanToUsd(methods, tags);
      queueContribution({
        platform: "twitch_gifts",
        login: username,
        displayName: tags?.["display-name"] || username,
        userId: tags?.["user-id"] || "",
        amountUsd: perGiftUsd * count,
        count,
        rawUnits: count,
      });
    },
  };

  client.on("subscription", handlers.subscription);
  client.on("giftpaidupgrade", handlers.giftpaidupgrade);
  client.on("resub", handlers.resub);
  client.on("raided", handlers.raided);
  client.on("clearchat", handlers.clearchat);
  client.on("cheer", handlers.cheer);
  client.on("subgift", handlers.subgift);
  client.on("submysterygift", handlers.submysterygift);

  let streamlabsSocket = null;
  try {
    if (String(streamlabsSocketToken || "").trim()) {
      streamlabsSocket = connectStreamlabs({
        socketToken: streamlabsSocketToken,
        onDonation: async (d) => {
          const s = loadSettings();
          if (isKs(s)) return;

          const name = String(d?.name || "Someone");
          const amount = getDonationAmount(d);
          const { code, symbol } = getCurrencyInfo(d);
          const amountText = formatMoney(amount, { code, symbol });
          const amountUsd =
            !code || code === "USD" || symbol === "$" ? amount : 0;

          logger?.log?.("[DONO DEBUG]", {
            rawAmount: d?.amount,
            formattedField: d?.amount_formatted ?? d?.formattedAmount ?? d?.formatted_amount,
            parsedAmount: amount,
            currency: { code, symbol },
            amountText,
          });

          const msg = `Thank you @${name} for the ${amountText} tip ${randomEmote()}`;
          const donorLogin = String(
            d?.twitch_username ??
              d?.twitchUsername ??
              d?.username ??
              d?.from ??
              d?.name ??
              ""
          ).trim();

          queueContribution({
            platform: "streamlabs",
            login: donorLogin,
            displayName: name,
            aliases: [
              d?.name,
              d?.from,
              d?.username,
              d?.twitch_username,
              d?.twitchUsername,
            ],
            amountUsd,
            count: 1,
            rawUnits: amount,
          });

          let disableForMs = 0;
          if (amount >= 100) disableForMs = 60_000;
          else if (amount >= 50) disableForMs = 60_000;
          else if (amount >= 20) disableForMs = 30_000;

          if (disableForMs) {
            setDonationMode(CHANNEL_NAME, disableForMs).catch(() => {});
          }

          if (DONATION_ALERT_MODE === "message") {
            client.say(CHANNEL_NAME, msg);
          }

          const donoPoints = Math.max(0, Math.floor(amount * 1000));
          if (donoPoints > 0) {
            try {
              let targetId = null;

              if (donorLogin) {
                targetId = await twitchFunctions
                  .getTwitchIdFromUsername(donorLogin)
                  .catch(() => null);
              }

              if (!targetId) {
                logger?.log?.(
                  "[DONO] could not resolve donor twitch id, skipping points",
                  { donorLogin }
                );
                return;
              }

              await twitchFunctions.addPajbotPointsById(String(targetId), donoPoints);

              logger?.log?.(
                `[DONO] +${donoPoints} points -> ${donorLogin || "unknown"} (id=${targetId})`
              );
            } catch (e) {
              logger?.error?.(
                "[DONO] failed to add basement points:",
                e?.message || e
              );
            }
          }

          if (DONATION_ALERT_MODE === "emote_spam") {
            const spamLine = `${DONATION_ALERT_EMOTE} ${DONATION_ALERT_EMOTE} ${DONATION_ALERT_EMOTE}`;

            let count = 1;
            if (amount >= 100) count = 25;
            else if (amount >= 50) count = 10;
            else if (amount >= 20) count = 5;
            else if (amount >= 5) count = 3;

            for (let i = 0; i < count; i++) {
              await client.say(CHANNEL_NAME, spamLine);
            }
          }
        },
      });
    } else {
      logger?.log?.("[alerts] streamlabs socket token missing; donation alerts disabled");
    }
  } catch (e) {
    logger?.warn?.("[alerts] streamlabs init failed:", String(e?.message || e));
  }

  function stop() {
    try {
      client.removeListener("subscription", handlers.subscription);
      client.removeListener("giftpaidupgrade", handlers.giftpaidupgrade);
      client.removeListener("resub", handlers.resub);
      client.removeListener("raided", handlers.raided);
      client.removeListener("clearchat", handlers.clearchat);
      client.removeListener("cheer", handlers.cheer);
      client.removeListener("subgift", handlers.subgift);
      client.removeListener("submysterygift", handlers.submysterygift);
    } catch {}

    try {
      streamlabsSocket?.disconnect?.();
    } catch {}
  }

  return { stop, streamlabsSocket };
}
