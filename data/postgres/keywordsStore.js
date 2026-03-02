import { ensureStateTable, readStateValue, writeStateValue } from "./stateStore.js";
import { resolveStateSchema } from "./db.js";
import { resolveInstanceName } from "../../bot/functions/instance.js";

function normalizeCategory(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function normalizePhrase(value) {
  return String(value || "")
    .replace(/[\r\n]+/g, " ")
    .trim()
    .toLowerCase();
}

export function normalizeKeywordsObject(input = {}) {
  const src = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const out = {};

  for (const [rawCategory, rawList] of Object.entries(src)) {
    const category = normalizeCategory(rawCategory);
    if (!category) continue;
    if (!Array.isArray(rawList)) continue;

    const seen = new Set();
    const phrases = [];

    for (const rawPhrase of rawList) {
      const phrase = normalizePhrase(rawPhrase);
      if (!phrase || seen.has(phrase)) continue;
      seen.add(phrase);
      phrases.push(phrase);
    }

    out[category] = phrases;
  }

  return out;
}

function normalizeSchema(schema) {
  const s = String(schema || "").trim();
  return s || resolveStateSchema();
}

function normalizeInstance(instance) {
  return resolveInstanceName({ instanceName: instance });
}

export async function readKeywordsState({ schema, instance, fallbackWords = null, migrateFallback = false } = {}) {
  const safeSchema = normalizeSchema(schema);
  const safeInstance = normalizeInstance(instance);

  await ensureStateTable({ schema: safeSchema });

  const fromDb = await readStateValue({
    schema: safeSchema,
    instance: safeInstance,
    key: "keywords",
    fallback: null,
  });

  if (fromDb && typeof fromDb === "object" && !Array.isArray(fromDb)) {
    return {
      keywords: normalizeKeywordsObject(fromDb),
      source: "postgres",
      schema: safeSchema,
      instance: safeInstance,
    };
  }

  const normalizedFallback = normalizeKeywordsObject(fallbackWords || {});

  if (migrateFallback && Object.keys(normalizedFallback).length > 0) {
    await writeStateValue({
      schema: safeSchema,
      instance: safeInstance,
      key: "keywords",
      value: normalizedFallback,
    });
    return {
      keywords: normalizedFallback,
      source: "postgres_migrated",
      schema: safeSchema,
      instance: safeInstance,
    };
  }

  return {
    keywords: normalizedFallback,
    source: "fallback",
    schema: safeSchema,
    instance: safeInstance,
  };
}

export async function writeKeywordsState({ schema, instance, keywords } = {}) {
  const safeSchema = normalizeSchema(schema);
  const safeInstance = normalizeInstance(instance);
  const normalized = normalizeKeywordsObject(keywords || {});

  await ensureStateTable({ schema: safeSchema });
  await writeStateValue({
    schema: safeSchema,
    instance: safeInstance,
    key: "keywords",
    value: normalized,
  });

  return {
    keywords: normalized,
    source: "postgres",
    schema: safeSchema,
    instance: safeInstance,
  };
}

export async function addKeywordPhraseState({ schema, instance, category, phrase } = {}) {
  const normalizedCategory = normalizeCategory(category);
  const normalizedPhrase = normalizePhrase(phrase);
  if (!normalizedCategory || !normalizedPhrase) {
    throw new Error("category and phrase are required.");
  }

  const current = await readKeywordsState({ schema, instance, fallbackWords: {}, migrateFallback: false });
  const next = normalizeKeywordsObject(current.keywords || {});

  if (!Array.isArray(next[normalizedCategory])) {
    next[normalizedCategory] = [];
  }

  const exists = next[normalizedCategory].includes(normalizedPhrase);
  if (!exists) next[normalizedCategory].push(normalizedPhrase);

  await writeKeywordsState({ schema, instance, keywords: next });
  return {
    ok: true,
    existed: exists,
    category: normalizedCategory,
    phrase: normalizedPhrase,
    keywords: next,
  };
}
