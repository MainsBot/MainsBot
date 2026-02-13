import fs from "fs";
import path from "path";

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

export function resolveSpotifyTokenStorePath() {
  const raw =
    String(process.env.SPOTIFY_TOKEN_STORE_PATH || "").trim() ||
    "./secrets/spotify_tokens.json";
  return abs(raw);
}

export function readSpotifyTokenStore(filePathOverride = "") {
  const filePath = abs(String(filePathOverride || "").trim()) || resolveSpotifyTokenStorePath();
  try {
    if (!fs.existsSync(filePath)) return { refresh_token: "" };
    const text = fs.readFileSync(filePath, "utf8");
    const parsed = safeJsonParse(text, null);
    if (!parsed || typeof parsed !== "object") return { refresh_token: "" };
    return parsed;
  } catch {
    return { refresh_token: "" };
  }
}

export function writeSpotifyTokenStore(next, filePathOverride = "") {
  const filePath = abs(String(filePathOverride || "").trim()) || resolveSpotifyTokenStorePath();
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const payload = next && typeof next === "object" ? next : {};
  if (payload.refresh_token == null) payload.refresh_token = "";
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf8");
  return filePath;
}

export function getSpotifyStoredRefreshToken() {
  const store = readSpotifyTokenStore();
  const token = String(store?.refresh_token || "").trim();
  return token || "";
}
