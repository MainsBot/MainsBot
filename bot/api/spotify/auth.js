import fetch from "node-fetch";

import {
  resolveSpotifyTokenStorePath,
  readSpotifyTokenStore,
  writeSpotifyTokenStore,
} from "./store.js";

const AUTHORIZE_URL = "https://accounts.spotify.com/authorize";
const TOKEN_URL = "https://accounts.spotify.com/api/token";

function flagFromEnv(value) {
  return /^(1|true|yes|on)$/i.test(String(value || "").trim());
}

function base64Basic(clientId, clientSecret) {
  return Buffer.from(`${clientId}:${clientSecret}`, "utf8").toString("base64");
}

export function buildSpotifyAuthSettings() {
  const clientId = String(process.env.SPOTIFY_CLIENT_ID || "").trim();
  const clientSecret = String(process.env.SPOTIFY_CLIENT_SECRET || "").trim();
  const redirectUri = String(process.env.SPOTIFY_AUTH_REDIRECT_URI || "").trim();
  const forceDynamicRedirect = flagFromEnv(process.env.SPOTIFY_AUTH_DYNAMIC_REDIRECT || "");

  return {
    clientId,
    clientSecret,
    redirectUri,
    forceDynamicRedirect,
    tokenStorePath: resolveSpotifyTokenStorePath(),
    scopes: [
      // Read
      "user-read-currently-playing",
      "user-read-playback-state",
      "user-read-recently-played",
      // Control
      "user-modify-playback-state",
    ],
  };
}

export function buildSpotifyAuthorizeUrl({ settings, state } = {}) {
  if (!settings?.clientId) throw new Error("Missing spotify client id");
  if (!settings?.redirectUri) throw new Error("Missing spotify redirect uri");
  if (!state) throw new Error("Missing state");

  const params = new URLSearchParams();
  params.set("response_type", "code");
  params.set("client_id", String(settings.clientId));
  params.set("redirect_uri", String(settings.redirectUri));
  params.set("state", String(state));
  params.set("scope", String((settings.scopes || []).join(" ")));
  params.set("show_dialog", "true");
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

export async function exchangeSpotifyCode({ code, settings, tokenStorePath } = {}) {
  if (!code) throw new Error("Missing code");
  if (!settings?.clientId || !settings?.clientSecret) {
    throw new Error("Missing spotify client id/secret (set them in your INI [spotify]).");
  }
  if (!settings?.redirectUri) throw new Error("Missing spotify redirect uri");

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      authorization: `Basic ${base64Basic(settings.clientId, settings.clientSecret)}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: String(code),
      redirect_uri: String(settings.redirectUri),
    }).toString(),
  });

  const text = await res.text().catch(() => "");
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!res.ok) {
    const msg =
      (data && typeof data === "object" && (data.error_description || data.error)) ||
      text ||
      res.statusText;
    throw new Error(`Spotify token error ${res.status}: ${msg}`);
  }

  const accessToken = String(data?.access_token || "").trim();
  const refreshToken = String(data?.refresh_token || "").trim();
  const expiresInSec = Number(data?.expires_in || 3600);

  if (!accessToken) throw new Error("Spotify token response missing access_token");

  // NOTE: Spotify may omit refresh_token if user already authorized the app and you didn't force show_dialog.
  // We always set show_dialog=true in authorize URL to encourage getting a refresh_token.
  const prev = readSpotifyTokenStore(tokenStorePath);
  const next = {
    ...prev,
    access_token: accessToken,
    refresh_token: refreshToken || String(prev?.refresh_token || "").trim() || "",
    expires_at_ms: Date.now() + expiresInSec * 1000,
    linked_at_ms: Date.now(),
  };

  const storePath = tokenStorePath || resolveSpotifyTokenStorePath();
  writeSpotifyTokenStore(next, storePath);

  return {
    ok: true,
    refreshToken: next.refresh_token ? true : false,
    tokenStorePath: storePath,
  };
}

export function getPublicSpotifyTokenSnapshot() {
  const store = readSpotifyTokenStore();
  return {
    tokenStorePath: resolveSpotifyTokenStorePath(),
    hasClientId: Boolean(String(process.env.SPOTIFY_CLIENT_ID || "").trim()),
    hasClientSecret: Boolean(String(process.env.SPOTIFY_CLIENT_SECRET || "").trim()),
    hasRefreshToken: Boolean(String(store?.refresh_token || "").trim()),
    linkedAtMs: Number(store?.linked_at_ms || 0) || null,
  };
}
