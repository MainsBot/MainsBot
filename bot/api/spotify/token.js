import fetch from "node-fetch";
import { getSpotifyRefreshConfig } from "./config.js";
import { readSpotifyTokenStore, writeSpotifyTokenStore } from "./store.js";

const TOKEN_URL = "https://accounts.spotify.com/api/token";

let cachedAccessToken = null;
let cachedUntilMs = 0;

function b64(str) {
  return Buffer.from(String(str || ""), "utf8").toString("base64");
}

export function clearSpotifyTokenCache() {
  cachedAccessToken = null;
  cachedUntilMs = 0;
}

export async function getSpotifyAccessToken() {
  const now = Date.now();
  if (cachedAccessToken && now < cachedUntilMs) return cachedAccessToken;

  // If we have a persisted access token and it's still valid, use it.
  const store = readSpotifyTokenStore();
  const storedAccess = String(store?.access_token || "").trim();
  const storedUntil = Number(store?.expires_at_ms || 0);
  if (storedAccess && storedUntil && now < storedUntil - 30_000) {
    cachedAccessToken = storedAccess;
    cachedUntilMs = storedUntil - 30_000;
    return cachedAccessToken;
  }

  const { clientId, clientSecret, refreshToken } = getSpotifyRefreshConfig();

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      authorization: `Basic ${b64(`${clientId}:${clientSecret}`)}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }).toString(),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    console.error("[SPOTIFY] refresh failed", {
      status: res.status,
      data,
      hasClientId: !!process.env.SPOTIFY_CLIENT_ID,
      hasSecret: !!process.env.SPOTIFY_CLIENT_SECRET,
      hasRefresh: !!process.env.SPOTIFY_REFRESH_TOKEN,
    });
    throw new Error(`Spotify refresh failed ${res.status}: ${JSON.stringify(data)}`);
  }

  cachedAccessToken = String(data.access_token || "").trim() || null;
  const expiresSec = Number(data.expires_in || 3600);
  cachedUntilMs = Date.now() + expiresSec * 1000 - 30_000; // refresh 30s early

  if (!cachedAccessToken) throw new Error("Spotify token response missing access_token");

  // Persist latest token snapshot for status/debug.
  try {
    writeSpotifyTokenStore({
      ...store,
      access_token: cachedAccessToken,
      expires_at_ms: Date.now() + expiresSec * 1000,
    });
  } catch {}
  return cachedAccessToken;
}
