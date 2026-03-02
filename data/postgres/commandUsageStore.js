import { ensureStateTable, readStateValue, writeStateValue } from "./stateStore.js";
import { resolveStateSchema } from "./db.js";
import { resolveInstanceName } from "../../bot/functions/instance.js";

const STATE_KEY = "command_usage";
const RETAIN_DAYS = 45;

function normalizeSchema(schema) {
  const s = String(schema || "").trim();
  return s || resolveStateSchema();
}

function normalizeInstance(instance) {
  return resolveInstanceName({ instanceName: instance });
}

function normalizePlatform(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "discord") return "discord";
  return "twitch";
}

function normalizeCommand(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw.startsWith("!")) return "";
  return (raw.split(/\s+/)[0] || "").replace(/[^!a-z0-9_:.]/g, "");
}

function dayKeyFromMs(ms) {
  const d = new Date(Number(ms) || Date.now());
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function toDayIndex(key) {
  const ts = Date.parse(`${String(key || "").trim()}T00:00:00.000Z`);
  return Number.isFinite(ts) ? Math.floor(ts / 86400000) : null;
}

function normalizeState(raw) {
  const src = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const daysIn = src.days && typeof src.days === "object" && !Array.isArray(src.days) ? src.days : {};
  const days = {};

  for (const [dayKey, dayValue] of Object.entries(daysIn)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dayKey))) continue;
    const platforms = dayValue && typeof dayValue === "object" && !Array.isArray(dayValue) ? dayValue : {};
    const dayOut = { twitch: {}, discord: {} };
    for (const platformName of ["twitch", "discord"]) {
      const cmdsIn =
        platforms[platformName] &&
        typeof platforms[platformName] === "object" &&
        !Array.isArray(platforms[platformName])
          ? platforms[platformName]
          : {};
      for (const [cmdRaw, countRaw] of Object.entries(cmdsIn)) {
        const cmd = normalizeCommand(cmdRaw);
        const count = Math.floor(Number(countRaw) || 0);
        if (!cmd || count <= 0) continue;
        dayOut[platformName][cmd] = count;
      }
    }
    days[dayKey] = dayOut;
  }

  return { version: 1, days };
}

function pruneState(state, nowMs = Date.now()) {
  const normalized = normalizeState(state);
  const todayIndex = Math.floor((Number(nowMs) || Date.now()) / 86400000);
  const minIndex = todayIndex - RETAIN_DAYS;
  for (const dayKey of Object.keys(normalized.days)) {
    const idx = toDayIndex(dayKey);
    if (idx == null || idx < minIndex) delete normalized.days[dayKey];
  }
  return normalized;
}

export async function bumpCommandUsageState({
  schema,
  instance,
  platform = "twitch",
  command,
  atMs = Date.now(),
} = {}) {
  const cmd = normalizeCommand(command);
  if (!cmd) return;
  const safeSchema = normalizeSchema(schema);
  const safeInstance = normalizeInstance(instance);
  const safePlatform = normalizePlatform(platform);
  const dayKey = dayKeyFromMs(atMs);

  await ensureStateTable({ schema: safeSchema });
  const raw = await readStateValue({
    schema: safeSchema,
    instance: safeInstance,
    key: STATE_KEY,
    fallback: { version: 1, days: {} },
  });
  const state = pruneState(raw, atMs);
  if (!state.days[dayKey]) state.days[dayKey] = { twitch: {}, discord: {} };
  const bucket = state.days[dayKey][safePlatform] || {};
  bucket[cmd] = Math.floor(Number(bucket[cmd] || 0) + 1);
  state.days[dayKey][safePlatform] = bucket;

  await writeStateValue({
    schema: safeSchema,
    instance: safeInstance,
    key: STATE_KEY,
    value: state,
  });
}

export async function getTopCommandsState({
  schema,
  instance,
  platform = "all",
  days = 7,
  limit = 20,
  nowMs = Date.now(),
} = {}) {
  const safeSchema = normalizeSchema(schema);
  const safeInstance = normalizeInstance(instance);
  const safeDays = Math.max(1, Math.min(45, Math.floor(Number(days) || 7)));
  const safeLimit = Math.max(1, Math.min(100, Math.floor(Number(limit) || 20)));
  const safePlatform = String(platform || "all").trim().toLowerCase();

  await ensureStateTable({ schema: safeSchema });
  const raw = await readStateValue({
    schema: safeSchema,
    instance: safeInstance,
    key: STATE_KEY,
    fallback: { version: 1, days: {} },
  });
  const state = pruneState(raw, nowMs);
  const nowIndex = Math.floor((Number(nowMs) || Date.now()) / 86400000);
  const minIndex = nowIndex - (safeDays - 1);
  const sums = new Map();

  for (const [dayKey, dayValue] of Object.entries(state.days || {})) {
    const idx = toDayIndex(dayKey);
    if (idx == null || idx < minIndex || idx > nowIndex) continue;
    const twitch = dayValue?.twitch || {};
    const discord = dayValue?.discord || {};

    const addMap = (src) => {
      for (const [cmd, cnt] of Object.entries(src)) {
        const n = Math.floor(Number(cnt) || 0);
        if (!cmd || n <= 0) continue;
        sums.set(cmd, Math.floor(Number(sums.get(cmd) || 0) + n));
      }
    };

    if (safePlatform === "twitch") addMap(twitch);
    else if (safePlatform === "discord") addMap(discord);
    else {
      addMap(twitch);
      addMap(discord);
    }
  }

  const rows = Array.from(sums.entries())
    .map(([command, uses]) => ({ command, uses }))
    .sort((a, b) => b.uses - a.uses || a.command.localeCompare(b.command))
    .slice(0, safeLimit);

  return {
    platform: safePlatform === "twitch" || safePlatform === "discord" ? safePlatform : "all",
    days: safeDays,
    rows,
  };
}

