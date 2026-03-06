import { ensureStateTable, readStateValue, writeStateValue } from "./stateStore.js";
import { resolveStateSchema } from "./db.js";
import { resolveInstanceName } from "../../bot/functions/instance.js";

const STATE_KEY = "channel_points_events";
const DEFAULT_MAX_ENTRIES = 15000;
const HARD_MAX_ENTRIES = 50000;

function normalizeSchema(schema) {
  const s = String(schema || "").trim();
  return s || resolveStateSchema();
}

function normalizeInstance(instance) {
  return resolveInstanceName({ instanceName: instance });
}

function asSafeText(value, max = 120) {
  const out = String(value ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .trim();
  return out.length > max ? `${out.slice(0, max)}...` : out;
}

function asInt(value, fallback = 0) {
  const n = Math.floor(Number(value) || fallback);
  return Math.max(0, n);
}

function normalizeSubTier(value) {
  const tier = asInt(value, 0);
  if (tier === 1000 || tier === 2000 || tier === 3000) return tier;
  return 0;
}

function normalizeEvent(input = {}) {
  const row = input && typeof input === "object" ? input : {};
  return {
    ts: String(row.ts || new Date().toISOString()).trim() || new Date().toISOString(),
    source: asSafeText(row.source || "pubsub", 32).toLowerCase(),
    type: asSafeText(row.type || "spend", 48).toLowerCase(),
    userId: asSafeText(row.userId || "", 64),
    login: asSafeText(row.login || "", 64).toLowerCase(),
    displayName: asSafeText(row.displayName || "", 64),
    pointsSpent: asInt(row.pointsSpent, 0),
    pointsLost: asInt(row.pointsLost, 0),
    subTier: normalizeSubTier(row.subTier),
    meta:
      row.meta && typeof row.meta === "object" && !Array.isArray(row.meta) ? row.meta : {},
  };
}

function normalizeList(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((row) => normalizeEvent(row))
    .filter((row) => row.userId || row.login)
    .filter((row) => row.pointsSpent > 0 || row.pointsLost > 0);
}

function pointsPerMinuteForTier(subTier = 0) {
  const base = 5.33333333;
  if (Number(subTier) === 1000) return base * 1.2;
  if (Number(subTier) === 2000) return base * 1.4;
  if (Number(subTier) === 3000) return base * 2;
  return base;
}

function msFromDays(days = 30) {
  const safeDays = Math.max(1, Math.min(365, Math.floor(Number(days) || 30)));
  return safeDays * 24 * 60 * 60 * 1000;
}

export async function appendChannelPointsEventsState({
  schema,
  instance,
  events,
  maxEntries = DEFAULT_MAX_ENTRIES,
} = {}) {
  const safeSchema = normalizeSchema(schema);
  const safeInstance = normalizeInstance(instance);
  const safeMax = Math.max(100, Math.min(HARD_MAX_ENTRIES, asInt(maxEntries, DEFAULT_MAX_ENTRIES)));

  const input = Array.isArray(events) ? events : [events];
  const normalizedIncoming = normalizeList(input);
  if (!normalizedIncoming.length) return { appended: 0 };

  await ensureStateTable({ schema: safeSchema });
  const current = await readStateValue({
    schema: safeSchema,
    instance: safeInstance,
    key: STATE_KEY,
    fallback: [],
  });
  const rows = normalizeList(current);
  rows.push(...normalizedIncoming);
  const next = rows.slice(-safeMax);

  await writeStateValue({
    schema: safeSchema,
    instance: safeInstance,
    key: STATE_KEY,
    value: next,
  });

  return { appended: normalizedIncoming.length };
}

export async function getChannelPointsAnalyticsState({
  schema,
  instance,
  days = 30,
  limitUsers = 200,
} = {}) {
  const safeSchema = normalizeSchema(schema);
  const safeInstance = normalizeInstance(instance);
  const safeLimit = Math.max(1, Math.min(2000, asInt(limitUsers, 200)));
  const windowMs = msFromDays(days);
  const cutoff = Date.now() - windowMs;

  await ensureStateTable({ schema: safeSchema });
  const raw = await readStateValue({
    schema: safeSchema,
    instance: safeInstance,
    key: STATE_KEY,
    fallback: [],
  });
  const rows = normalizeList(raw);

  const byUser = new Map();
  for (const row of rows) {
    const tsMs = Date.parse(String(row.ts || ""));
    if (!Number.isFinite(tsMs) || tsMs < cutoff) continue;

    const key = String(row.userId || row.login || "").trim();
    if (!key) continue;
    const existing = byUser.get(key) || {
      userId: String(row.userId || "").trim(),
      login: String(row.login || "").trim().toLowerCase(),
      displayName: String(row.displayName || "").trim(),
      pointsSpent: 0,
      pointsLost: 0,
      events: 0,
      subTier: 0,
      lastSeenTs: "",
      sources: new Set(),
      types: new Set(),
    };

    existing.pointsSpent += asInt(row.pointsSpent, 0);
    existing.pointsLost += asInt(row.pointsLost, 0);
    existing.events += 1;
    existing.lastSeenTs = String(row.ts || existing.lastSeenTs || "");
    if (row.subTier) existing.subTier = normalizeSubTier(row.subTier);
    if (!existing.displayName && row.displayName) existing.displayName = String(row.displayName);
    if (!existing.login && row.login) existing.login = String(row.login).toLowerCase();
    if (!existing.userId && row.userId) existing.userId = String(row.userId);
    existing.sources.add(String(row.source || "").trim().toLowerCase());
    existing.types.add(String(row.type || "").trim().toLowerCase());
    byUser.set(key, existing);
  }

  const users = Array.from(byUser.values())
    .map((user) => {
      const rate = pointsPerMinuteForTier(user.subTier);
      const farmMinutesEstimate =
        rate > 0 ? Number((Number(user.pointsSpent || 0) / rate).toFixed(2)) : 0;
      return {
        userId: user.userId || null,
        login: user.login || null,
        displayName: user.displayName || null,
        pointsSpent: asInt(user.pointsSpent, 0),
        pointsLost: asInt(user.pointsLost, 0),
        events: asInt(user.events, 0),
        subTier: normalizeSubTier(user.subTier),
        estimatedFarmMinutes: farmMinutesEstimate,
        lastSeenTs: user.lastSeenTs || null,
        sources: Array.from(user.sources).filter(Boolean).sort(),
        types: Array.from(user.types).filter(Boolean).sort(),
      };
    })
    .sort((a, b) => Number(b.pointsSpent || 0) - Number(a.pointsSpent || 0))
    .slice(0, safeLimit);

  return {
    days: Math.max(1, Math.min(365, Math.floor(Number(days) || 30))),
    limitUsers: safeLimit,
    userCount: users.length,
    users,
  };
}
