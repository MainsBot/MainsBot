import { isRedisConfigured, getRedisNamespace } from "../redis/client.js";
import { resolveInstanceName } from "../../functions/instance.js";

const REDIS_PREFIX = "mainsbot:spotify:tokens:";
let cachedStore = null;
let cacheLoaded = false;

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

function getRedisStore() {
  if (!isRedisConfigured()) {
    throw new Error("Redis is required for Spotify token storage. Configure [redis].");
  }
  return getRedisNamespace(REDIS_PREFIX);
}

async function readFromRedis() {
  const redis = getRedisStore();
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
  try {
    await redis.set(getRedisKey(), JSON.stringify(cloneStore(next)));
    return cloneStore(next);
  } catch (e) {
    console.warn("[SPOTIFY][STORE] redis write failed:", String(e?.message || e));
    throw e;
  }
}

export function resolveSpotifyTokenStorePath() {
  return `${REDIS_PREFIX}${getRedisKey()}`;
}

export async function readSpotifyTokenStore(_filePathOverride = "", { force = false } = {}) {
  if (!force && cacheLoaded && cachedStore) return cloneStore(cachedStore);
  const redisStore = await readFromRedis();
  cachedStore = cloneStore(redisStore || { refresh_token: "" });
  cacheLoaded = true;
  return cloneStore(cachedStore);
}

export async function writeSpotifyTokenStore(next, _filePathOverride = "") {
  const payload = cloneStore(next);
  cachedStore = payload;
  cacheLoaded = true;
  await writeToRedis(payload);
  return resolveSpotifyTokenStorePath();
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
  return "redis";
}
