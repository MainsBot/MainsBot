import { spotifyRequest } from "./request.js";
import { parseSpotifyTrackUri } from "./parse.js";

function normalizeTrack(t) {
  return {
    name: t?.name,
    artists: (t?.artists || []).map((a) => a.name).join(", "),
    url: t?.external_urls?.spotify,
    uri: t?.uri,
  };
}

export async function searchTrack(query, limit = 1) {
  if (!query) return { ok: false, error: "missing query" };

  const r = await spotifyRequest("GET", "/search", {
    qs: {
      q: query,
      type: "track",
      limit: Math.max(1, Math.min(10, Number(limit) || 1)),
    },
  });

  if (!r.ok) return { ok: false, error: `Spotify API ${r.status}`, raw: r.data };

  const items = r.data?.tracks?.items || [];
  const tracks = items.map((t) => normalizeTrack(t));

  return { ok: true, tracks };
}

export async function getTrackByUri(input) {
  const parsed = parseSpotifyTrackUri(input);
  const uri = String(parsed || "").trim();
  if (!uri.startsWith("spotify:track:")) {
    return { ok: false, error: "invalid track uri" };
  }

  const trackId = uri.slice("spotify:track:".length).trim();
  if (!trackId) return { ok: false, error: "invalid track uri" };

  const r = await spotifyRequest("GET", `/tracks/${encodeURIComponent(trackId)}`);
  if (!r.ok) return { ok: false, error: `Spotify API ${r.status}`, raw: r.data };

  return { ok: true, track: normalizeTrack(r.data || {}) };
}
