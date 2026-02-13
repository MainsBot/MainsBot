import * as SPOTIFY from "../api/spotify/index.js";
import { hasSpotifyRefreshToken } from "../api/spotify/config.js";

function flagFromValue(value) {
  return /^(1|true|yes|on)$/i.test(String(value ?? "").trim());
}

const MISSING_SPOTIFY_LOG_INTERVAL_MS = 5 * 60 * 1000;
let lastMissingSpotifyLogMs = 0;

function logMissingSpotifyOnce({ channelName, cmd } = {}) {
  const now = Date.now();
  if (now - lastMissingSpotifyLogMs < MISSING_SPOTIFY_LOG_INTERVAL_MS) return;
  lastMissingSpotifyLogMs = now;
  console.warn(
    `[spotify] ignored command (${String(cmd || "").trim() || "unknown"}) in #${String(channelName || "").trim()}: spotify not linked (visit /auth/spotify)`
  );
}

function hasSpotifyCreds() {
  return Boolean(
    String(process.env.SPOTIFY_CLIENT_ID || "").trim() &&
      String(process.env.SPOTIFY_CLIENT_SECRET || "").trim() &&
      hasSpotifyRefreshToken()
  );
}

export function isSpotifyModuleEnabled() {
  const raw = String(process.env.MODULE_SPOTIFY ?? "").trim();
  if (raw) return flagFromValue(raw);
  // default: enable if creds exist
  return hasSpotifyCreds();
}

function cleanSpotifyTrackTitle(name) {
  let title = String(name || "").trim();
  if (!title) return "";

  title = title.replace(
    /\s*[\(\[\{][^)\]\}]*\b(?:feat\.?|ft\.?|featuring)\b[^)\]\}]*[\)\]\}]\s*/gi,
    " "
  );

  title = title.replace(/\s*[-–—,:]\s*(?:feat\.?|ft\.?|featuring)\b.*$/i, "");
  title = title.replace(/\s+(?:feat\.?|ft\.?|featuring)\b.*$/i, "");

  title = title.replace(/\s{2,}/g, " ").trim();
  title = title.replace(/\s*[-–—,:]\s*$/g, "").trim();

  return title;
}

function formatSpotifyTrackLabel(track) {
  const rawName = String(track?.name || "").trim();
  const cleanName = cleanSpotifyTrackTitle(rawName) || rawName || "Unknown Track";
  const artists = String(track?.artists || "").trim();
  return artists ? `${cleanName} - ${artists}` : cleanName;
}

function msToTime(ms) {
  const totalSeconds = Math.floor((Number(ms) || 0) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function registerSpotifyCommands({
  client,
  channelName,
  botPrefix = "",
  streamerDisplayName = "Streamer",
  isSharedCommandCooldownActive,
  getChatPerms,
} = {}) {
  if (!client || typeof client.on !== "function") {
    throw new Error("registerSpotifyCommands: missing tmi client");
  }
  if (!channelName) throw new Error("registerSpotifyCommands: missing channelName");
  if (client.__mainsbotSpotifyInstalled) return;
  client.__mainsbotSpotifyInstalled = true;

  client.on("message", async (channel, userstate, message, self) => {
    if (self) return;

    const msg = String(message || "").trim();
    const lower = msg.toLowerCase();

    const perms = typeof getChatPerms === "function"
      ? getChatPerms(userstate, { channelLogin: channelName })
      : { isPermitted: Boolean(userstate?.mod || userstate?.badges?.broadcaster === "1") };
    const isPermitted = !!perms.isPermitted;

    const replyPrefix =
      `@client-nonce=${userstate?.["client-nonce"] || ""};reply-parent-msg-id=${userstate?.["id"] || ""} ` +
      `PRIVMSG #${channelName} :${botPrefix || ""}`;

    const reply = (text) => client.raw(`${replyPrefix}${text}`);

    const isSongQueueCommand = lower === "!songqueue" || /^!song\s+queue$/.test(lower);
    const isLastSongCommand = lower === "!lastsong" || /^!last\s+song$/.test(lower);
    const isNextSongCommand = lower === "!nextsong" || /^!next\s+song$/.test(lower);
    const isPublicSpotifyCommand =
      lower === "!song" ||
      lower === "!np" ||
      isLastSongCommand ||
      isSongQueueCommand ||
      isNextSongCommand;

    if (isPublicSpotifyCommand && typeof isSharedCommandCooldownActive === "function") {
      if (isSharedCommandCooldownActive(userstate)) return;
    }

    // If module is enabled but Spotify isn't linked, do NOT respond in chat (avoid spam).
    // Log to console at most once per interval.
    if (isPublicSpotifyCommand && !hasSpotifyCreds()) {
      logMissingSpotifyOnce({ channelName, cmd: lower.split(/\s+/)[0] });
      return;
    }

    if (lower === "!song" || lower === "!np") {
      const np = await SPOTIFY.getNowPlaying().catch(() => null);
      if (!np || !np.playing) {
        return reply(`${streamerDisplayName} is not listening to anything right now.`);
      }

      const trackLabel = formatSpotifyTrackLabel(np);
      const explicitTag = np.explicit ? " [E]" : "";

      const progress = msToTime(np.progressMs);
      const total = msToTime(np.durationMs);

      return reply(`Now playing: ${trackLabel}${explicitTag} [${progress}/${total}]`);
    }

    if (isLastSongCommand) {
      const r = await SPOTIFY.getRecentlyPlayed(1).catch(() => null);
      const t = r?.tracks?.[0];
      if (!r?.ok || !t) return reply(`${streamerDisplayName} has not listened to anything recently.`);

      const trackLabel = formatSpotifyTrackLabel(t);
      return reply(`Last song: ${trackLabel}`);
    }

    if (isSongQueueCommand) {
      const q = await SPOTIFY.getQueue().catch(() => null);
      if (!q?.ok) return reply(`Queue failed (${q?.status || "?"}).`);

      const next = q.queue.slice(0, 3);
      if (!next.length) return reply("Spotify song queue is empty.");

      const line = next.map((t, i) => `${i + 1}) ${formatSpotifyTrackLabel(t)}`).join(" | ");
      return reply(`Up next (3): ${line}`);
    }

    if (isNextSongCommand) {
      const q = await SPOTIFY.getQueue().catch(() => null);
      if (!q?.ok) return reply(`Failed to retrive next song in queue (${q?.status || "?"}).`);

      const next = q.queue.slice(0, 1);
      if (!next.length) return reply("Spotify song queue is empty.");

      const line = next.map((t) => formatSpotifyTrackLabel(t)).join(" | ");
      return reply(`The next song in the queue is ${line}`);
    }

    if (!isPermitted) return;
    if (!hasSpotifyCreds()) {
      logMissingSpotifyOnce({ channelName, cmd: lower.split(/\s+/)[0] });
      return;
    }

    if (lower === "!skipsong") {
      const r = await SPOTIFY.skipNext().catch(() => null);
      return reply(r?.ok ? "Successfully skiped current song." : "❌ Skip failed.");
    }

    if (lower.startsWith("!songvol ")) {
      const n = Number(msg.split(/\s+/)[1]);
      if (!Number.isFinite(n)) return reply("Usage: !songvol 0-100");

      const vol = Math.max(0, Math.min(100, n));
      const r = await SPOTIFY.setVolume(vol).catch(() => null);

      return reply(r?.ok ? `Successfully set spotify volume to ${vol}%` : "Set volume failed.");
    }

    if (lower.startsWith("!addsong ")) {
      const input = msg.slice("!addsong ".length).trim();
      if (!input) return reply("Usage: !addsong <spotify link | id | search>");

      let uri = null;
      let track = null;

      try {
        const parsed = SPOTIFY.parseSpotifyTrackUri(input);
        if (parsed) {
          uri = parsed.uri || parsed;
          track = parsed.track || null;
        }

        if (!uri) {
          const s = await SPOTIFY.searchTrack(input, 1);
          track = s?.tracks?.[0];
          uri = track?.uri;
          if (!uri || !track) return reply("No track found.");
        }

        const r = await SPOTIFY.addToQueue(uri);
        return reply(
          r?.ok
            ? `Successfully added ${track?.name || "that song"} to the queue.`
            : "Add failed."
        );
      } catch (err) {
        console.error("[SPOTIFY] !addsong crashed:", err);
        return reply("Spotify error while adding song.");
      }
    }
  });
}
