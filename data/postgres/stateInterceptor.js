import fs from "fs";
import path from "path";

import { closePgPool, getPgPool, normalizePgIdentifier, resolveStateSchema } from "./db.js";

const LEGACY_FILENAMES_BY_KEY = {
  settings: ["./SETTINGS.json", "SETTINGS.json"],
  streams: ["./STREAMS.json", "STREAMS.json"],
  playtime: ["./playtime.json", "playtime.json"],
  userdata: ["./USERDATA.json", "USERDATA.json"],
  predictiondata: ["./PREDICTIONDATA.json", "PREDICTIONDATA.json"],
  polldata: ["./POLLDATA.json", "POLLDATA.json"],
  tounfriend: ["./TOUNFRIEND.json", "TOUNFRIEND.json"],
  aubrey_tab: ["./aubrey_tab.json", "./secrets/aubrey_tab.json", "aubrey_tab.json"],
};

const ENV_PATH_BY_KEY = {
  settings: "SETTINGS_PATH",
  streams: "STREAMS_PATH",
  playtime: "PLAYTIME_PATH",
  userdata: "USERDATA_PATH",
  predictiondata: "PREDICTIONDATA_PATH",
  polldata: "POLLDATA_PATH",
  tounfriend: "TO_UNFRIEND_PATH",
  aubrey_tab: "AUBREY_TAB_PATH",
};

function readBackend() {
  return String(process.env.STATE_BACKEND || "file").trim().toLowerCase();
}

function readInstanceName() {
  return String(process.env.INSTANCE_NAME || "default").trim() || "default";
}

function abs(p) {
  if (!p) return "";
  return path.isAbsolute(p) ? p : path.resolve(process.cwd(), p);
}

function tryJsonParse(value) {
  try {
    return JSON.parse(String(value));
  } catch {
    return null;
  }
}

function readJsonFromDiskUsingOriginal(original, filePath, fallback = null) {
  try {
    if (!filePath) return fallback;
    const resolved = abs(filePath);
    if (!original.existsSync(resolved)) return fallback;
    const text = original.readFileSync(resolved, "utf8");
    const parsed = tryJsonParse(text);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function buildDefaultSettings() {
  return {
    ks: false,
    timers: true,
    keywords: true,
    spamFilter: true,
    lengthFilter: false,
    linkFilter: true,
    linkAllowlist: [],
    currentMode: "!join.on",
    currentGame: "Website",
    currentLink: null,
    filterExemptions: ["sister_avanti"],
    bots: ["fossabot", "cassi0tds", "wizebot"],
    joinTimer: true,
    gamesPlayedCount: 5,
    timer: {
      join: "type !join to join the game",
      link: "type !link to get the link to join",
      "1v1": "type 1v1 in chat once to get a chance to 1v1 the streamer",
      ticket: "type !ticket to join the game",
      val: "type !val to join",
    },
    main: {
      join: "!join",
      link: "!link",
      "1v1": "!1v1",
      ticket: "!ticket",
      val: "!val",
    },
    nonFollowers: {
      join: "click the follow button on twitch to get access to the join command",
    },
    validModes: ["!join.on", "!link.on", "!1v1.on", "!ticket.on", "!val.on", "!reddit.on"],
    specialModes: [
      "!ks.on",
      "!ks.off",
      "!timer.on",
      "!timer.off",
      "!keywords.on",
      "!keywords.off",
      "!timers.off",
      "!timers.on",
      "!sleep.on",
      "!sleep.off",
    ],
    customModes: ["!xqcchat.on", "!xqcchat.off"],
    ignoreModes: [
      "!spamfilter.on",
      "!spamfilter.off",
      "!lengthfilter.on",
      "!lengthfilter.off",
      "!linkfilter.on",
      "!linkfilter.off",
      "!sleep.on",
    ],
    corrections: {
      join: "this is a public server, type !join to join.",
      link: "this is a private server, type !link to get the link to join.",
      "1v1":
        "the streamer is currently 1v1ing viewers, type 1v1 in chat once to get a chance to be picked.",
      ticket: "type !ticket to join the game.",
      val: "the streamer is currently playing valorant, type !val to join.",
    },
    titles: {
      join: "FREE ROBUX LIVE - WIN THIS GAME - !JOIN TO PLAY - !socials !discord",
      link: "FREE ROBUX LIVE - WIN THIS GAME - !LINK TO PLAY - !socials !discord",
      ticket: "FREE ROBUX LIVE - WIN THIS GAME - !TICKET TO PLAY - !socials !discord",
      "1v1": "ARSENAL 1V1 - WIN = FREE ROBUX - !1V1 TO PLAY - !socials !discord",
      val: "VALORANT - !VAL TO PLAY - !socials !discord",
      reddit: "REDDIT RECAP - !socials !discord !reddit",
    },
    filters: {
      spam: {
        windowMs: 7000,
        minMessages: 5,
        strikeResetMs: 10 * 60 * 1000,
        timeoutFirstSec: 30,
        timeoutRepeatSec: 60,
        reason: "[AUTOMATIC] Please stop excessively spamming - MainsBot",
        messageFirst: "{atUser}, please stop excessively spamming.",
        messageRepeat: "{atUser} Please STOP excessively spamming.",
      },
      length: {
        maxChars: 400,
        strikeResetMs: 10 * 60 * 1000,
        timeoutFirstSec: 30,
        timeoutRepeatSec: 60,
        reason: "[AUTOMATIC] Message exceeds max character limit - MainsBot",
        message: "{atUser} Message exceeds max character limit.",
      },
      link: {
        strikeResetMs: 10 * 60 * 1000,
        timeoutFirstSec: 1,
        timeoutRepeatSec: 5,
        reason: "[AUTOMATIC] No links allowed - MainsBot",
        message: "{atUser} No links allowed in chat.",
      },
    },
  };
}

function buildDefaultStreams() {
  const now = new Date();
  const iso = now.toISOString();
  return {
    "1": {
      date: iso,
      ISODate: iso,
      day: now.getDay(),
      length: "",
      streamStart: 0,
      streamEnd: 0,
      averageviewers: 0,
      averageViewersPer30Seconds: {},
      repeatLengthOffenders: {},
      repeatSpamOffenders: {},
    },
  };
}

function buildEmptyPlaytime() {
  return {
    totals: {},
    daily: {},
    current: { game: null, startedAt: null },
    stream: { live: false, startedAt: null, totals: {} },
  };
}

function buildEmptyAubreyTab() {
  const now = Date.now();
  return { balance: 0, lastTouchedMs: now, lastInterestAppliedMs: now };
}

function defaultValueForKey(key) {
  if (key === "settings") {
    try {
      const fromRepo = JSON.parse(original.readFileSync(abs("./SETTINGS.json"), "utf8"));
      if (fromRepo && typeof fromRepo === "object") return fromRepo;
    } catch {}
    return buildDefaultSettings();
  }

  if (key === "streams") {
    try {
      const fromRepo = JSON.parse(original.readFileSync(abs("./STREAMS.json"), "utf8"));
      if (fromRepo && typeof fromRepo === "object") return fromRepo;
    } catch {}
    return buildDefaultStreams();
  }

  if (key === "playtime") return buildEmptyPlaytime();
  if (key === "predictiondata") return [];

  if (key === "aubrey_tab") return buildEmptyAubreyTab();

  return {};
}

const original = {
  readFileSync: fs.readFileSync.bind(fs),
  writeFileSync: fs.writeFileSync.bind(fs),
  existsSync: fs.existsSync.bind(fs),
  readFile: fs.readFile.bind(fs),
  writeFile: fs.writeFile.bind(fs),
};

let interceptorInstalled = false;
let stateMode = "file";
let pathToKey = new Map(); // abs path -> key
let legacyAbsToEnvAbs = new Map(); // abs legacy -> abs env (file backend)

let cache = new Map(); // key -> value
let dirtyKeys = new Set();
let flushTimer = null;
let flushInFlight = null;

function rebuildPathMaps() {
  pathToKey = new Map();
  legacyAbsToEnvAbs = new Map();

  for (const [key, envName] of Object.entries(ENV_PATH_BY_KEY)) {
    const envPath = String(process.env[envName] || "").trim();
    const envAbs = envPath ? abs(envPath) : "";
    if (envAbs) pathToKey.set(envAbs, key);

    const legacy = LEGACY_FILENAMES_BY_KEY[key] || [];
    for (const legacyPath of legacy) {
      const legacyAbs = abs(legacyPath);
      if (legacyAbs) {
        pathToKey.set(legacyAbs, key);
        if (envAbs) legacyAbsToEnvAbs.set(legacyAbs, envAbs);
      }
    }
  }
}

function resolveKeyFromPath(filePath) {
  if (!filePath || typeof filePath !== "string") return "";
  const resolved = abs(filePath);
  return pathToKey.get(resolved) || "";
}

function decodeWriteData(data, encoding) {
  if (Buffer.isBuffer(data)) return data.toString(encoding || "utf8");
  return String(data ?? "");
}

function encodeReadData(text, optionsOrEncoding) {
  const enc =
    typeof optionsOrEncoding === "string"
      ? optionsOrEncoding
      : optionsOrEncoding && typeof optionsOrEncoding === "object"
        ? optionsOrEncoding.encoding
        : null;

  if (!enc) return Buffer.from(text, "utf8");
  if (enc === "utf8" || enc === "utf-8") return text;
  // Other encodings are rare for JSON state; support best-effort.
  return Buffer.from(text, "utf8").toString(enc);
}

function scheduleFlush() {
  if (stateMode !== "postgres") return;
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushStateNow();
  }, 750);
}

async function ensureSchemaAndTable({ schema } = {}) {
  const safeSchema = normalizePgIdentifier(schema || "") || "public";
  const pool = getPgPool();

  if (safeSchema !== "public") {
    await pool.query(`create schema if not exists ${safeSchema};`);
  }

  await pool.query(
    `create table if not exists ${safeSchema}.mainsbot_state (` +
      `instance text not null, ` +
      `key text not null, ` +
      `value jsonb not null, ` +
      `updated_at timestamptz not null default now(), ` +
      `primary key (instance, key)` +
      `);`
  );
}

async function loadCacheFromDb({ schema, instance } = {}) {
  const safeSchema = normalizePgIdentifier(schema || "") || "public";
  const inst = String(instance || "").trim() || "default";
  const pool = getPgPool();

  const res = await pool.query(
    `select key, value from ${safeSchema}.mainsbot_state where instance=$1`,
    [inst]
  );

  cache = new Map();
  for (const row of res.rows || []) {
    const key = String(row.key || "").trim();
    if (!key) continue;
    cache.set(key, row.value);
  }
}

async function flushDirtyToDb({ schema, instance } = {}) {
  const safeSchema = normalizePgIdentifier(schema || "") || "public";
  const inst = String(instance || "").trim() || "default";
  const pool = getPgPool();

  const keys = Array.from(dirtyKeys);
  if (!keys.length) return;
  dirtyKeys.clear();

  for (const key of keys) {
    const value = cache.get(key);
    if (value === undefined) continue;
    await pool.query(
      `insert into ${safeSchema}.mainsbot_state (instance, key, value) values ($1,$2,$3) ` +
        `on conflict (instance, key) do update set value=excluded.value, updated_at=now()`,
      [inst, key, value]
    );
  }
}

function seedCacheFromDiskIfPresent() {
  for (const key of Object.keys(ENV_PATH_BY_KEY)) {
    if (cache.has(key)) continue;

    const envName = ENV_PATH_BY_KEY[key];
    const envPath = String(process.env[envName] || "").trim();
    const fromDisk = readJsonFromDiskUsingOriginal(original, envPath, null);
    if (fromDisk !== null) {
      cache.set(key, fromDisk);
      dirtyKeys.add(key);
      continue;
    }

    cache.set(key, defaultValueForKey(key));
    dirtyKeys.add(key);
  }
}

function installInterceptor() {
  if (interceptorInstalled) return;
  interceptorInstalled = true;

  fs.existsSync = function existsSyncPatched(filePath) {
    const key = resolveKeyFromPath(filePath);
    if (!key) return original.existsSync(filePath);

    if (stateMode === "postgres") return true;

    const legacyAbs = abs(filePath);
    const target = legacyAbsToEnvAbs.get(legacyAbs);
    if (target) return original.existsSync(target);
    return original.existsSync(filePath);
  };

  fs.readFileSync = function readFileSyncPatched(filePath, options) {
    const key = resolveKeyFromPath(filePath);
    if (!key) return original.readFileSync(filePath, options);

    if (stateMode === "postgres") {
      if (!cache.has(key)) cache.set(key, defaultValueForKey(key));
      const text = JSON.stringify(cache.get(key));
      return encodeReadData(text, options);
    }

    const legacyAbs = abs(filePath);
    const target = legacyAbsToEnvAbs.get(legacyAbs);
    if (target) return original.readFileSync(target, options);
    return original.readFileSync(filePath, options);
  };

  fs.writeFileSync = function writeFileSyncPatched(filePath, data, options) {
    const key = resolveKeyFromPath(filePath);
    if (!key) return original.writeFileSync(filePath, data, options);

    if (stateMode === "postgres") {
      const encoding =
        typeof options === "string"
          ? options
          : options && typeof options === "object"
            ? options.encoding
            : "utf8";
      const text = decodeWriteData(data, encoding);
      const parsed = tryJsonParse(text);
      if (parsed === null) {
        throw new Error(`[state] write for ${key} was not valid JSON`);
      }
      cache.set(key, parsed);
      dirtyKeys.add(key);
      scheduleFlush();
      return;
    }

    const legacyAbs = abs(filePath);
    const target = legacyAbsToEnvAbs.get(legacyAbs);
    if (target) return original.writeFileSync(target, data, options);
    return original.writeFileSync(filePath, data, options);
  };

  fs.readFile = function readFilePatched(filePath, options, cb) {
    const key = resolveKeyFromPath(filePath);
    if (!key) return original.readFile(filePath, options, cb);

    // Support fs.readFile(path, cb)
    const callback = typeof options === "function" ? options : cb;
    const opts = typeof options === "function" ? null : options;
    try {
      const data = fs.readFileSync(filePath, opts || "utf8");
      callback?.(null, data);
    } catch (e) {
      callback?.(e);
    }
  };

  fs.writeFile = function writeFilePatched(filePath, data, options, cb) {
    const key = resolveKeyFromPath(filePath);
    if (!key) return original.writeFile(filePath, data, options, cb);

    const callback = typeof options === "function" ? options : cb;
    const opts = typeof options === "function" ? null : options;
    try {
      fs.writeFileSync(filePath, data, opts || "utf8");
      callback?.(null);
    } catch (e) {
      callback?.(e);
    }
  };
}

export async function initStateInterceptor() {
  stateMode = readBackend();
  rebuildPathMaps();
  installInterceptor();

  if (stateMode !== "postgres" && stateMode !== "pg") {
    stateMode = "file";
    return { backend: "file" };
  }

  stateMode = "postgres";

  const schema = resolveStateSchema();
  const instance = readInstanceName();

  await ensureSchemaAndTable({ schema });
  await loadCacheFromDb({ schema, instance });
  seedCacheFromDiskIfPresent();
  await flushDirtyToDb({ schema, instance });

  return { backend: "postgres", schema, instance };
}

export async function flushStateNow() {
  if (stateMode !== "postgres") return;
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }

  if (flushInFlight) return flushInFlight;

  const schema = resolveStateSchema();
  const instance = readInstanceName();

  flushInFlight = (async () => {
    try {
      await flushDirtyToDb({ schema, instance });
    } finally {
      flushInFlight = null;
    }
  })();

  return flushInFlight;
}

export async function shutdownStateInterceptor() {
  try {
    await flushStateNow();
  } finally {
    await closePgPool();
  }
}
