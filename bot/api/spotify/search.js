import { spotifyRequest } from "./request.js";

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
  const tracks = items.map((t) => ({
    name: t.name,
    artists: (t.artists || []).map((a) => a.name).join(", "),
    url: t.external_urls?.spotify,
    uri: t.uri,
  }));

  return { ok: true, tracks };
}

