import { spotifyRequest } from "./request.js";

/* -------------------- Read APIs -------------------- */

export async function getNowPlaying() {
  const r = await spotifyRequest("GET", "/me/player/currently-playing");

  if (r.status === 204) return { playing: false };

  if (!r.ok) {
    return {
      playing: false,
      error: `Spotify API ${r.status}`,
      raw: r.data,
    };
  }

  const item = r.data?.item;
  if (!item) return { playing: false };

  return {
    playing: true,
    isPlaying: !!r.data?.is_playing,
    name: item.name,
    artists: (item.artists || []).map((a) => a.name).join(", "),
    explicit: !!item.explicit,
    durationMs: item.duration_ms,
    progressMs: r.data?.progress_ms || 0,
    url: item.external_urls?.spotify,
    uri: item.uri,
  };
}

export async function getRecentlyPlayed(limit = 1) {
  const r = await spotifyRequest("GET", "/me/player/recently-played", {
    qs: { limit: Math.max(1, Math.min(50, Number(limit) || 1)) },
  });

  if (!r.ok) return { ok: false, error: `Spotify API ${r.status}`, raw: r.data };

  const items = r.data?.items || [];
  const tracks = items.map((it) => {
    const t = it.track;
    return {
      playedAt: it.played_at,
      name: t?.name,
      artists: (t?.artists || []).map((a) => a.name).join(", "),
      url: t?.external_urls?.spotify,
      uri: t?.uri,
    };
  });

  return { ok: true, tracks };
}

export async function getQueue() {
  const r = await spotifyRequest("GET", "/me/player/queue");
  if (!r.ok) return { ok: false, status: r.status, raw: r.data };

  const current = r.data?.currently_playing || null;
  const queue = r.data?.queue || [];

  const normalize = (t) => ({
    name: t?.name,
    artists: (t?.artists || []).map((a) => a.name).join(", "),
    url: t?.external_urls?.spotify,
    uri: t?.uri,
  });

  return {
    ok: true,
    current: current ? normalize(current) : null,
    queue: queue.map(normalize),
  };
}

/* -------------------- Control APIs -------------------- */

export async function skipNext() {
  const r = await spotifyRequest("POST", "/me/player/next");
  return { ok: r.ok, status: r.status, raw: r.data };
}

export async function skipPrevious() {
  const r = await spotifyRequest("POST", "/me/player/previous");
  return { ok: r.ok, status: r.status, raw: r.data };
}

export async function pause() {
  const r = await spotifyRequest("PUT", "/me/player/pause");
  return { ok: r.ok, status: r.status, raw: r.data };
}

export async function play() {
  const r = await spotifyRequest("PUT", "/me/player/play");
  return { ok: r.ok, status: r.status, raw: r.data };
}

export async function setVolume(percent) {
  const p = Math.max(0, Math.min(100, Number(percent)));
  if (Number.isNaN(p)) return { ok: false, status: 400, raw: "volume must be a number 0-100" };
  const r = await spotifyRequest("PUT", "/me/player/volume", { qs: { volume_percent: p } });
  return { ok: r.ok, status: r.status, raw: r.data };
}

export async function addToQueue(trackUri) {
  if (!trackUri) return { ok: false, status: 400, raw: "missing track uri" };
  const r = await spotifyRequest("POST", "/me/player/queue", { qs: { uri: trackUri } });
  return { ok: r.ok, status: r.status, raw: r.data };
}

