export function parseSpotifyTrackUri(input) {
  if (!input) return null;
  const s = String(input).trim();

  // spotify:track:<id>
  if (s.startsWith("spotify:track:")) return s;

  // https://open.spotify.com/track/<id>?...
  try {
    const u = new URL(s);
    if (u.hostname.includes("spotify.com")) {
      const parts = u.pathname.split("/").filter(Boolean);
      if (parts[0] === "track" && parts[1]) {
        return `spotify:track:${parts[1]}`;
      }
    }
  } catch {}

  // raw track id (22 chars)
  if (/^[A-Za-z0-9]{22}$/.test(s)) return `spotify:track:${s}`;

  return null;
}

