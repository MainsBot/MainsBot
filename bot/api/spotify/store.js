import fs from "fs";
import path from "path";

import { isRedisConfigured, getRedisNamespace } from "../redis/client.js";
import { resolveInstanceName } from "../../functions/instance.js";

const REDIS_PREFIX = "mainsbot:spotify:tokens:";
let cachedStore = null;
let cacheLoaded = false;

function abs(p) {
  if (!p) return "";
  return path.isAbsolute(p) ? p : path.resolve(process.cwd(), p);
}

function safeJsonParse(text, fallback = null) {
  try {
    return JSON.parse(String(text ?? ""));
  } catch {
    return fallback;
  }
}

function cloneStore(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { refresh_token: "" };
  }
  const out = { ...value };
  if (out.refresh_token == null) out.refresh_token = "";
  return out;
}

function getRedisKey() {
  return resolveInstanceName();
}

function resolveFilePath(filePathOverride = "") {
  return abs(String(filePathOverride || "").trim()) || resolveSpotifyTokenStorePath();
}

function readFromFileSync(filePathOverride = "") {
  const filePath = resolveFilePath(filePathOverride);
  try {
    if (!fs.existsSync(filePath)) return { refresh_token: "" };
    const text = fs.readFileSync(filePath, "utf8");
    const parsed = safeJsonParse(text, null);
    return cloneStore(parsed);
  } catch {
    return { refresh_token: "" };
  }
}

function writeToFileSync(next, filePathOverride = "") {
  const filePath = resolveFilePath(filePathOverride);
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const payload = cloneStore(next);
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf8");
  return filePath;
}

function getRedisStore() {
  if (!isRedisConfigured()) return null;
  return getRedisNamespace(REDIS_PREFIX);
}

async function readFromRedis() {
  const redis = getRedisStore();
  if (!redis) return null;
  try {
    const raw = await redis.get(getRedisKey());
    if (!raw) return null;
    const parsed = safeJsonParse(raw, null);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return cloneStore(parsed);
  } catch (e) {
    console.warn("[SPOTIFY][STORE] redis read failed:", String(e?.message || e));
    return null;
  }
}

async function writeToRedis(next) {
  const redis = getRedisStore();
  if (!redis) return false;
  try {
    await redis.set(getRedisKey(), JSON.stringify(cloneStore(next)));
    return true;
  } catch (e) {
    console.warn("[SPOTIFY][STORE] redis write failed:", String(e?.message || e));
    return false;
  }
}

export function resolveSpotifyTokenStorePath() {
  const raw =
    String(process.env.SPOTIFY_TOKEN_STORE_PATH || "").trim() ||
    "./secrets/spotify_tokens.json";
  return abs(raw);
}

export async function readSpotifyTokenStore(filePathOverride = "", { force = false } = {}) {
  if (!force && cacheLoaded && cachedStore) return cloneStore(cachedStore);

  const redisStore = await readFromRedis();
  if (redisStore) {
    cachedStore = cloneStore(redisStore);
    cacheLoaded = true;
    return cloneStore(cachedStore);
  }

  const fileStore = readFromFileSync(filePathOverride);
  cachedStore = cloneStore(fileStore);
  cacheLoaded = true;

  if (isRedisConfigured()) {
    void writeToRedis(cachedStore);
  }

  return cloneStore(cachedStore);
}

export async function writeSpotifyTokenStore(next, filePathOverride = "") {
  const payload = cloneStore(next);
  cachedStore = payload;
  cacheLoaded = true;

  const wroteRedis = await writeToRedis(payload);

  // Keep JSON token file as a compatibility fallback/migration backup.
  try {
    writeToFileSync(payload, filePathOverride);
  } catch (e) {
    if (!wroteRedis) throw e;
  }

  return resolveFilePath(filePathOverride);
}

export async function getSpotifyStoredRefreshToken() {
  const store = await readSpotifyTokenStore();
  const token = String(store?.refresh_token || "").trim();
  return token || "";
}

export function getCachedSpotifyStoredRefreshToken() {
  const token = String(cachedStore?.refresh_token || "").trim();
  return token || "";
}

export async function primeSpotifyTokenStoreCache() {
  await readSpotifyTokenStore("", { force: true });
}

export function getSpotifyTokenStoreBackend() {
  return isRedisConfigured() ? "redis" : "file";
}
