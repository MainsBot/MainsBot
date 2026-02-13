import { getSpotifyStoredRefreshToken } from "./store.js";

function mustEnv(name) {
  const v = String(process.env[name] || "").trim();
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

export function getSpotifyRefreshConfig() {
  const stored = getSpotifyStoredRefreshToken();
  const refreshToken =
    stored || String(process.env.SPOTIFY_REFRESH_TOKEN || "").trim() || "";
  if (!refreshToken) {
    throw new Error(
      "Spotify is not linked. Visit /auth/spotify to connect, or set SPOTIFY_REFRESH_TOKEN (legacy)."
    );
  }
  return {
    clientId: mustEnv("SPOTIFY_CLIENT_ID"),
    clientSecret: mustEnv("SPOTIFY_CLIENT_SECRET"),
    refreshToken,
  };
}

export function hasSpotifyRefreshToken() {
  return Boolean(
    getSpotifyStoredRefreshToken() || String(process.env.SPOTIFY_REFRESH_TOKEN || "").trim()
  );
}
