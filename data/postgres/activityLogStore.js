import { ensureStateTable, readStateValue, writeStateValue } from "./stateStore.js";
import { resolveStateSchema } from "./db.js";
import { resolveInstanceName } from "../../bot/functions/instance.js";

const STATE_KEY = "activity_log";
const DEFAULT_MAX_ENTRIES = 400;
const HARD_MAX_ENTRIES = 1000;

function normalizeSchema(schema) {
  const s = String(schema || "").trim();
  return s || resolveStateSchema();
}

function normalizeInstance(instance) {
  return resolveInstanceName({ instanceName: instance });
}

function asSafeText(value, max = 240) {
  const out = String(value ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .trim();
  return out.length > max ? `${out.slice(0, max)}...` : out;
}

function normalizeMeta(meta) {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return {};
  const out = {};
  for (const [k, v] of Object.entries(meta)) {
    const key = asSafeText(k, 48).toLowerCase();
    if (!key) continue;
    if (v == null) continue;
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
      out[key] = typeof v === "string" ? asSafeText(v, 240) : v;
      continue;
    }
    if (Array.isArray(v)) {
      out[key] = v.slice(0, 20).map((x) => asSafeText(x, 80));
      continue;
    }
    out[key] = asSafeText(JSON.stringify(v), 240);
  }
  return out;
}

function normalizeEntry(entry = {}) {
  const src = entry && typeof entry === "object" ? entry : {};
  const ts = String(src.ts || new Date().toISOString()).trim();
  return {
    ts,
    action: asSafeText(src.action || "event", 64),
    source: asSafeText(src.source || "bot", 32),
    actor: asSafeText(src.actor || "system", 64),
    detail: asSafeText(src.detail || "", 240),
    meta: normalizeMeta(src.meta || {}),
  };
}

function normalizeList(value) {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => normalizeEntry(entry)).filter((entry) => entry.action);
}

function normalizeLimit(limit, fallback = 100) {
  const n = Math.floor(Number(limit) || fallback);
  return Math.max(1, Math.min(HARD_MAX_ENTRIES, n));
}

export async function readActivityLogState({ schema, instance, limit = 100 } = {}) {
  const safeSchema = normalizeSchema(schema);
  const safeInstance = normalizeInstance(instance);
  await ensureStateTable({ schema: safeSchema });

  const value = await readStateValue({
    schema: safeSchema,
    instance: safeInstance,
    key: STATE_KEY,
    fallback: [],
  });

  const rows = normalizeList(value);
  const safeLimit = normalizeLimit(limit, 100);
  return {
    rows: rows.slice(-safeLimit).reverse(),
    schema: safeSchema,
    instance: safeInstance,
  };
}

export async function appendActivityLogEntryState({
  schema,
  instance,
  entry,
  maxEntries = DEFAULT_MAX_ENTRIES,
} = {}) {
  const safeSchema = normalizeSchema(schema);
  const safeInstance = normalizeInstance(instance);
  const normalizedEntry = normalizeEntry(entry || {});
  const safeMax = normalizeLimit(maxEntries, DEFAULT_MAX_ENTRIES);

  await ensureStateTable({ schema: safeSchema });
  const current = await readStateValue({
    schema: safeSchema,
    instance: safeInstance,
    key: STATE_KEY,
    fallback: [],
  });
  const rows = normalizeList(current);
  rows.push(normalizedEntry);
  const next = rows.slice(-safeMax);

  await writeStateValue({
    schema: safeSchema,
    instance: safeInstance,
    key: STATE_KEY,
    value: next,
  });

  return normalizedEntry;
}

