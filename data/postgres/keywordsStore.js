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

function normalizeResponse(value) {
  return String(value || "")
    .replace(/[\r\n]+/g, " ")
    .trim();
}

export function normalizeKeywordEntry(input) {
  const raw =
    input && typeof input === "object" && !Array.isArray(input)
      ? input
      : { phrases: Array.isArray(input) ? input : [] };

  const sourceList = Array.isArray(raw.phrases)
    ? raw.phrases
    : Array.isArray(raw.keywords)
      ? raw.keywords
      : Array.isArray(raw.list)
        ? raw.list
        : Array.isArray(input)
          ? input
          : [];

  const seen = new Set();
  const phrases = [];

  for (const rawPhrase of sourceList) {
    const phrase = normalizePhrase(rawPhrase);
    if (!phrase || seen.has(phrase)) continue;
    seen.add(phrase);
    phrases.push(phrase);
  }

  return {
    phrases,
    response: normalizeResponse(raw.response),
  };
}

export function normalizeKeywordsObject(input = {}) {
  const src = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const out = {};

  for (const [rawCategory, rawValue] of Object.entries(src)) {
    const category = normalizeCategory(rawCategory);
    if (!category) continue;
    const normalized = normalizeKeywordEntry(rawValue);
    if (!normalized.phrases.length && !normalized.response) continue;
    out[category] = normalized;
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

  if (!next[normalizedCategory] || typeof next[normalizedCategory] !== "object") {
    next[normalizedCategory] = { phrases: [], response: "" };
  }

  if (!Array.isArray(next[normalizedCategory].phrases)) {
    next[normalizedCategory].phrases = [];
  }

  const exists = next[normalizedCategory].phrases.includes(normalizedPhrase);
  if (!exists) next[normalizedCategory].phrases.push(normalizedPhrase);

  await writeKeywordsState({ schema, instance, keywords: next });
  return {
    ok: true,
    existed: exists,
    category: normalizedCategory,
    phrase: normalizedPhrase,
    keywords: next,
  };
}
