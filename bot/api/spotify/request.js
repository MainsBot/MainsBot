import fetch from "node-fetch";
import { getSpotifyAccessToken } from "./token.js";

const API_URL = "https://api.spotify.com/v1";

export async function spotifyRequest(method, path, { qs, body } = {}) {
  const token = await getSpotifyAccessToken();

  const url = new URL(`${API_URL}${path}`);
  if (qs && typeof qs === "object") {
    for (const [k, v] of Object.entries(qs)) {
      if (v === undefined || v === null) continue;
      url.searchParams.set(k, String(v));
    }
  }

  const res = await fetch(url.toString(), {
    method: String(method || "GET").toUpperCase(),
    headers: {
      authorization: `Bearer ${token}`,
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 204) return { ok: true, status: 204, data: null };

  const text = await res.text().catch(() => "");
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  return { ok: res.ok, status: res.status, data };
}

