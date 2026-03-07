import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import {
  normalizeKeywordEntry,
  normalizeKeywordsObject,
} from "../../data/postgres/keywordsStore.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RESPONSES_SOURCE_PATH = path.resolve(__dirname, "../functions/responses.js");

const FALLBACK_RESPONSE_KEYS = [
  "join",
  "link",
  "1v1",
  "add",
  "music",
  "game",
  "selfpromotion",
  "camera",
  "cantjoin",
  "group",
  "joinsoff",
  "keyboard",
  "merch",
  "mic",
  "mod",
  "order69",
  "pc",
  "permission",
  "raid",
  "recordingsoftware",
  "reddit",
  "robux",
  "schedule",
  "servertype",
  "songrequest",
  "time",
  "user",
  "vipinfo",
  "watchtime",
  "corrections",
  "whogiftedme",
  "donate",
  "discord",
  "treatstream",
  "dms",
  "7tv",
  "bttv",
  "ffz",
  "sub",
  "crimid",
  "full",
  "song",
];

const RESPONSE_LOCK_REASONS = {
  join: "Built-in reply changes with the active mode.",
  link: "Built-in reply changes with link mode.",
  "1v1": "Built-in reply changes with the active mode.",
  music: "Built-in reply uses Spotify now playing.",
  game: "Built-in reply uses Roblox presence.",
  selfpromotion: "Built-in handler performs moderation actions.",
  cantjoin: "Built-in reply uses current mode and Roblox presence.",
  joinsoff: "Built-in reply changes with the active mode.",
  permission: "Built-in reply changes with the active mode.",
  servertype: "Built-in reply changes with the active mode.",
  corrections: "Built-in reply depends on live mode/correction data.",
  whogiftedme: "Built-in reply uses live Twitch subscription data.",
  crimid: "Built-in reply uses Roblox presence.",
  song: "Built-in reply uses Spotify now playing.",
};

export const LOCKED_RESPONSE_KEYS = new Set(Object.keys(RESPONSE_LOCK_REASONS));

let cachedResponseKeys = null;

function extractResponseKeysFromSource() {
  try {
    const source = fs.readFileSync(RESPONSES_SOURCE_PATH, "utf8");
    const marker = "export const responses = {";
    const start = source.indexOf(marker);
    if (start < 0) return FALLBACK_RESPONSE_KEYS.slice();

    const lines = source.slice(start).split(/\r?\n/);
    let started = false;
    let depth = 0;
    const keys = [];
    const seen = new Set();

    for (const line of lines) {
      if (!started) {
        const openIndex = line.indexOf("{");
        if (openIndex >= 0) {
          started = true;
          depth = 1;
        }
        continue;
      }

      if (depth === 1) {
        const match = line.match(
          /^\s*(?:([\"'])([^\"']+)\1|([A-Za-z_][A-Za-z0-9_]*))\s*(?:\(|:)/
        );
        const key = String(match?.[2] || match?.[3] || "").trim();
        if (key && !seen.has(key)) {
          seen.add(key);
          keys.push(key);
        }
      }

      let inSingle = false;
      let inDouble = false;
      let inTemplate = false;
      let escaped = false;

      for (let i = 0; i < line.length; i += 1) {
        const ch = line[i];
        const next = line[i + 1];

        if (escaped) {
          escaped = false;
          continue;
        }

        if (inSingle) {
          if (ch === "\\") escaped = true;
          else if (ch === "'") inSingle = false;
          continue;
        }

        if (inDouble) {
          if (ch === "\\") escaped = true;
          else if (ch === "\"") inDouble = false;
          continue;
        }

        if (inTemplate) {
          if (ch === "\\") escaped = true;
          else if (ch === "`") inTemplate = false;
          continue;
        }

        if (ch === "/" && next === "/") break;
        if (ch === "'") {
          inSingle = true;
          continue;
        }
        if (ch === "\"") {
          inDouble = true;
          continue;
        }
        if (ch === "`") {
          inTemplate = true;
          continue;
        }
        if (ch === "{") depth += 1;
        else if (ch === "}") depth -= 1;
      }

      if (started && depth <= 0) break;
    }

    return keys.length ? keys : FALLBACK_RESPONSE_KEYS.slice();
  } catch {
    return FALLBACK_RESPONSE_KEYS.slice();
  }
}

export function getWebsiteKeywordResponseKeys() {
  if (!cachedResponseKeys) {
    cachedResponseKeys = extractResponseKeysFromSource();
  }
  return cachedResponseKeys.slice();
}

export function getWebsiteKeywordCatalog() {
  return getWebsiteKeywordResponseKeys().map((key) => ({
    key,
    responseEditable: !LOCKED_RESPONSE_KEYS.has(key),
    responseLockReason: RESPONSE_LOCK_REASONS[key] || "",
  }));
}

export function projectKeywordsForWebsite(input = {}) {
  const normalized = normalizeKeywordsObject(input || {});
  const out = {};

  for (const item of getWebsiteKeywordCatalog()) {
    const entry = normalizeKeywordEntry(normalized[item.key] || {});
    const response = item.responseEditable ? entry.response : "";
    if (!entry.phrases.length && !response) continue;
    out[item.key] = { phrases: entry.phrases, response };
  }

  return out;
}

export function mergeWebsiteKeywordsForStorage(existingKeywords = {}, websiteKeywords = {}) {
  const supportedKeys = new Set(getWebsiteKeywordResponseKeys());
  const existing = normalizeKeywordsObject(existingKeywords || {});
  const incoming = normalizeKeywordsObject(websiteKeywords || {});
  const merged = {};

  for (const [key, entry] of Object.entries(existing)) {
    if (supportedKeys.has(key)) continue;
    merged[key] = normalizeKeywordEntry(entry);
  }

  for (const item of getWebsiteKeywordCatalog()) {
    const entry = normalizeKeywordEntry(incoming[item.key] || {});
    const response = item.responseEditable ? entry.response : "";
    if (!entry.phrases.length && !response) continue;
    merged[item.key] = {
      phrases: entry.phrases,
      response,
    };
  }

  return normalizeKeywordsObject(merged);
}

export function countHiddenWebsiteKeywordCategories(input = {}) {
  const supportedKeys = new Set(getWebsiteKeywordResponseKeys());
  const normalized = normalizeKeywordsObject(input || {});
  let hiddenCount = 0;
  for (const key of Object.keys(normalized)) {
    if (!supportedKeys.has(key)) hiddenCount += 1;
  }
  return hiddenCount;
}
