console.log("[playtime] module loaded from", new URL(import.meta.url).pathname);
import fs from "fs";

const DEFAULT_PATH = String(process.env.PLAYTIME_PATH || "./playtime.json").trim();
const DEFAULT_CHAT_MAX_MESSAGE_CHARS = 320;
const DEFAULT_MAX_GAME_NAME_CHARS = 24;
const DEBUG_PLAYTIME = /^(1|true|yes|on)$/i.test(String(process.env.PLAYTIME_DEBUG || "").trim());

function normalizeState(s) {
  return {
    totals: s?.totals && typeof s.totals === "object" ? s.totals : {},
    daily: s?.daily && typeof s.daily === "object" ? s.daily : {},
    current: {
      game: s?.current?.game ?? null,
      startedAt: s?.current?.startedAt ?? null,
    },
    stream: {
      live: !!s?.stream?.live,
      startedAt: s?.stream?.startedAt ?? null,
      totals:
        s?.stream?.totals && typeof s.stream.totals === "object"
          ? s.stream.totals
          : {},
    },
  };
}

function loadJSON(path = DEFAULT_PATH) {
  try {
    const parsed = JSON.parse(fs.readFileSync(path, "utf8"));
    return normalizeState(parsed);
  } catch {
    return normalizeState(null);
  }
}

function saveJSON(data, path = DEFAULT_PATH) {
  try {
    if (DEBUG_PLAYTIME) {
      console.log("[playtime] saving state (backend handled by stateInterceptor)");
    }

    fs.writeFileSync(path, JSON.stringify(data, null, 2), "utf8");
  } catch (e) {
    console.error("[playtime] ERROR write failed:", e?.message || e);
    console.error("[playtime] path was:", path);
  }
}


function nowMs() {
  return Date.now();
}

function getLocalDateKey(ms) {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getLocalDayStartMs(dateKey) {
  const [y, m, d] = dateKey.split("-").map((v) => Number(v));
  return new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
}

function getWeekStartMs(ms) {
  const d = new Date(ms);
  const day = d.getDay(); // 0 = Sunday
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - day, 0, 0, 0, 0).getTime();
}

function getMonthStartMs(ms) {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0).getTime();
}

function getYesterdayKey(ms) {
  const d = new Date(ms);
  const y = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1, 0, 0, 0, 0);
  return getLocalDateKey(y.getTime());
}

function getNextLocalMidnightMs(ms) {
  const d = new Date(ms);
  return new Date(
    d.getFullYear(),
    d.getMonth(),
    d.getDate() + 1,
    0,
    0,
    0,
    0
  ).getTime();
}

function addToDaily(state, dateKey, gameName, msToAdd) {
  if (!gameName) return;
  if (!state.daily[dateKey]) state.daily[dateKey] = {};
  if (!state.daily[dateKey][gameName]) state.daily[dateKey][gameName] = 0;
  state.daily[dateKey][gameName] += msToAdd;
}

function addToStreamTotal(state, gameName, msToAdd) {
  if (!gameName) return;
  if (!state.stream.totals) state.stream.totals = {};
  if (!state.stream.totals[gameName]) state.stream.totals[gameName] = 0;
  state.stream.totals[gameName] += msToAdd;
}

export function formatDuration(ms) {
  ms = Math.max(0, Number(ms) || 0);

  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts = [];
  if (hours > 0) parts.push(`${hours} hour${hours === 1 ? "" : "s"}`);
  if (minutes > 0) parts.push(`${minutes} minute${minutes === 1 ? "" : "s"}`);
  if (seconds > 0 || parts.length === 0)
    parts.push(`${seconds} second${seconds === 1 ? "" : "s"}`);

  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts[0]}, ${parts[1]} and ${parts[2]}`;
}

function formatDurationCompact(ms) {
  ms = Math.max(0, Number(ms) || 0);

  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  if (minutes > 0) return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
  return `${seconds}s`;
}

function truncateGameName(name, maxChars = DEFAULT_MAX_GAME_NAME_CHARS) {
  const clean = String(name || "").trim() || "Unknown";
  if (clean.length <= maxChars) return clean;
  if (maxChars <= 3) return clean.slice(0, maxChars);
  return `${clean.slice(0, maxChars - 3)}...`;
}

function addToGameTotal(state, gameName, msToAdd) {
  if (!gameName) return;
  if (!state.totals[gameName]) state.totals[gameName] = 0;
  state.totals[gameName] += msToAdd;
}

function addRangeToTotals(state, gameName, startMs, endMs) {
  if (!gameName) return 0;
  if (!startMs || !endMs || endMs <= startMs) return 0;

  let added = 0;
  let cursor = startMs;
  const streamLive =
    !!state.stream?.live && typeof state.stream?.startedAt === "number";
  const streamStart = streamLive ? state.stream.startedAt : null;

  while (cursor < endMs) {
    const dayKey = getLocalDateKey(cursor);
    const nextMidnight = getNextLocalMidnightMs(cursor);
    const segmentEnd = Math.min(endMs, nextMidnight);
    const segmentMs = Math.max(0, segmentEnd - cursor);

    if (segmentMs > 0) {
      addToGameTotal(state, gameName, segmentMs);
      addToDaily(state, dayKey, gameName, segmentMs);
      if (streamLive && streamStart != null) {
        const streamSegStart = Math.max(cursor, streamStart);
        const streamSegEnd = segmentEnd;
        if (streamSegEnd > streamSegStart) {
          addToStreamTotal(state, gameName, streamSegEnd - streamSegStart);
        }
      }
      added += segmentMs;
    }

    cursor = segmentEnd;
  }

  return added;
}

function closeCurrentIfAny(state) {
  const cur = state.current;
  if (!cur.game || !cur.startedAt) return 0;

  const elapsed = addRangeToTotals(state, cur.game, cur.startedAt, nowMs());

  // clear current
  cur.game = null;
  cur.startedAt = null;

  return elapsed;
}

function flushCurrentIfAny(state) {
  const cur = state.current;
  if (!cur.game || !cur.startedAt) return 0;

  const now = nowMs();
  const elapsed = addRangeToTotals(state, cur.game, cur.startedAt, now);

  if (elapsed > 0) {
    cur.startedAt = now;
  }

  return elapsed;
}

function getOverlapMs(startMs, endMs, rangeStart, rangeEnd) {
  const s = Math.max(startMs, rangeStart);
  const e = Math.min(endMs, rangeEnd);
  return Math.max(0, e - s);
}

/**
 * Call this when stream starts (optional but recommended).
 * It marks stream live.
 */
export function onStreamStart(path = DEFAULT_PATH) {
  const state = loadJSON(path);

  state.stream.live = true;
  state.stream.startedAt = nowMs();
  state.stream.totals = {};

  // split current session at stream start so stream totals are accurate
  flushCurrentIfAny(state);

  saveJSON(state, path);
}

/**
 * Call this whenever the game changes.
 * - Closes previous game and adds time to totals
 * - Starts new game timer
 */
export function onGameChange(newGame, path = DEFAULT_PATH) {
  const state = loadJSON(path);

  // close previous session chunk
  closeCurrentIfAny(state);

  // start new
  if (newGame) {
    state.current.game = String(newGame);
    state.current.startedAt = nowMs();
  } else {
    state.current.game = null;
    state.current.startedAt = null;
  }

  saveJSON(state, path);
}

/**
 * Get current playtime for active game (live session)
 */
export function getCurrentPlaytime(path = DEFAULT_PATH) {
  const state = loadJSON(path);
  const cur = state.current;

  if (!cur.game || !cur.startedAt) {
    return { game: null, ms: 0 };
  }

  const ms = nowMs() - cur.startedAt;
  return { game: cur.game, ms };
}

function totalsToTopList(totals, n = 5) {
  return Object.entries(totals)
    .map(([game, ms]) => ({ game, ms: Number(ms) || 0 }))
    .sort((a, b) => b.ms - a.ms)
    .slice(0, n);
}

/**
 * Returns top N games by total time (includes active game in-progress).
 */
export function getTopGames(n = 5, path = DEFAULT_PATH) {
  const state = loadJSON(path);

  // copy totals
  const totals = { ...state.totals };

  // include active session in totals (preview)
  if (state.current.game && state.current.startedAt) {
    const extra = nowMs() - state.current.startedAt;
    totals[state.current.game] = (totals[state.current.game] || 0) + extra;
  }

  return totalsToTopList(totals, n);
}

/**
 * Returns top N games for a specific local day (YYYY-MM-DD).
 * Includes the active in-progress game time for that day.
 */
export function getTopGamesForDay(dateKey, n = 5, path = DEFAULT_PATH) {
  const state = loadJSON(path);
  const totals = { ...(state.daily[dateKey] || {}) };

  if (state.current.game && state.current.startedAt) {
    const dayStart = getLocalDayStartMs(dateKey);
    const dayEnd = dayStart + 24 * 60 * 60 * 1000;
    const overlap = getOverlapMs(
      state.current.startedAt,
      nowMs(),
      dayStart,
      dayEnd
    );
    if (overlap > 0) {
      totals[state.current.game] = (totals[state.current.game] || 0) + overlap;
    }
  }

  return totalsToTopList(totals, n);
}

/**
 * Returns top N games for the last X days (including today).
 */
export function getTopGamesForLastDays(days = 7, n = 5, path = DEFAULT_PATH) {
  const state = loadJSON(path);
  const totals = {};

  const now = nowMs();
  const start = now - days * 24 * 60 * 60 * 1000;

  let cursor = new Date(start);
  cursor = new Date(
    cursor.getFullYear(),
    cursor.getMonth(),
    cursor.getDate(),
    0,
    0,
    0,
    0
  );

  while (cursor.getTime() <= now) {
    const key = getLocalDateKey(cursor.getTime());
    const bucket = state.daily[key];
    if (bucket) {
      for (const [game, ms] of Object.entries(bucket)) {
        totals[game] = (totals[game] || 0) + (Number(ms) || 0);
      }
    }
    cursor = new Date(
      cursor.getFullYear(),
      cursor.getMonth(),
      cursor.getDate() + 1,
      0,
      0,
      0,
      0
    );
  }

  if (state.current.game && state.current.startedAt) {
    const overlap = getOverlapMs(state.current.startedAt, now, start, now);
    if (overlap > 0) {
      totals[state.current.game] = (totals[state.current.game] || 0) + overlap;
    }
  }

  return totalsToTopList(totals, n);
}

/**
 * Returns top N games for the current week (Sunday -> now).
 */
export function getTopGamesForWeekToDate(n = 5, path = DEFAULT_PATH) {
  const state = loadJSON(path);
  const totals = {};

  const now = nowMs();
  const start = getWeekStartMs(now);

  let cursor = new Date(start);

  while (cursor.getTime() <= now) {
    const key = getLocalDateKey(cursor.getTime());
    const bucket = state.daily[key];
    if (bucket) {
      for (const [game, ms] of Object.entries(bucket)) {
        totals[game] = (totals[game] || 0) + (Number(ms) || 0);
      }
    }
    cursor = new Date(
      cursor.getFullYear(),
      cursor.getMonth(),
      cursor.getDate() + 1,
      0,
      0,
      0,
      0
    );
  }

  if (state.current.game && state.current.startedAt) {
    const overlap = getOverlapMs(state.current.startedAt, now, start, now);
    if (overlap > 0) {
      totals[state.current.game] = (totals[state.current.game] || 0) + overlap;
    }
  }

  return totalsToTopList(totals, n);
}

/**
 * Returns top N games for the current month (1st -> now).
 */
export function getTopGamesForMonthToDate(n = 5, path = DEFAULT_PATH) {
  const state = loadJSON(path);
  const totals = {};

  const now = nowMs();
  const start = getMonthStartMs(now);

  let cursor = new Date(start);

  while (cursor.getTime() <= now) {
    const key = getLocalDateKey(cursor.getTime());
    const bucket = state.daily[key];
    if (bucket) {
      for (const [game, ms] of Object.entries(bucket)) {
        totals[game] = (totals[game] || 0) + (Number(ms) || 0);
      }
    }
    cursor = new Date(
      cursor.getFullYear(),
      cursor.getMonth(),
      cursor.getDate() + 1,
      0,
      0,
      0,
      0
    );
  }

  if (state.current.game && state.current.startedAt) {
    const overlap = getOverlapMs(state.current.startedAt, now, start, now);
    if (overlap > 0) {
      totals[state.current.game] = (totals[state.current.game] || 0) + overlap;
    }
  }

  return totalsToTopList(totals, n);
}

/**
 * Returns top N games for the current live stream.
 */
export function getTopGamesForStream(n = 5, path = DEFAULT_PATH) {
  const state = loadJSON(path);
  if (!state.stream.live || !state.stream.startedAt) {
    return { live: false, top: [] };
  }

  const totals = { ...(state.stream.totals || {}) };

  if (state.current.game && state.current.startedAt) {
    const overlapStart = Math.max(state.current.startedAt, state.stream.startedAt);
    const overlap = Math.max(0, nowMs() - overlapStart);
    if (overlap > 0) {
      totals[state.current.game] = (totals[state.current.game] || 0) + overlap;
    }
  }

  return { live: true, top: totalsToTopList(totals, n) };
}

/**
 * Call this on stream end to:
 * - mark stream not live
 *
 * If you want totals to RESET each stream, set resetTotals=true.
 */
export function onStreamEnd(path = DEFAULT_PATH, resetTotals = false) {
  const state = loadJSON(path);

  state.stream.live = false;
  state.stream.startedAt = null;
  state.stream.totals = {};

  if (resetTotals) {
    state.totals = {};
    state.daily = {};
    state.current.game = null;
    state.current.startedAt = null;
  }

  saveJSON(state, path);
}

/**
 * Flush in-progress time to JSON without changing the current game.
 */
export function tick(path = DEFAULT_PATH) {
  const state = loadJSON(path);
  const elapsed = flushCurrentIfAny(state);
  if (elapsed > 0) {
    saveJSON(state, path);
  }
}

/**
 * Build a single-line chat message for !gamesplayed
 */
export function buildTopGamesMessage(n = 5, path = DEFAULT_PATH, options = {}) {
  const scope = options?.scope || "all";
  const dateKey = options?.dateKey || getLocalDateKey(nowMs());
  const days = options?.days || 7;
  const yesterdayKey = getYesterdayKey(nowMs());
  const maxMessageChars = Math.max(
    120,
    Number(options?.maxMessageChars) || DEFAULT_CHAT_MAX_MESSAGE_CHARS
  );
  const maxNameChars = Math.max(
    10,
    Number(options?.maxNameChars) || DEFAULT_MAX_GAME_NAME_CHARS
  );

  let top = [];
  if (scope === "day") {
    top = getTopGamesForDay(dateKey, n, path);
  } else if (scope === "yesterday") {
    top = getTopGamesForDay(yesterdayKey, n, path);
  } else if (scope === "week") {
    top = getTopGamesForWeekToDate(n, path);
  } else if (scope === "month") {
    top = getTopGamesForMonthToDate(n, path);
  } else if (scope === "stream") {
    const streamResult = getTopGamesForStream(n, path);
    if (!streamResult.live) return "No live stream right now.";
    top = streamResult.top;
  } else if (scope === "lastDays") {
    top = getTopGamesForLastDays(days, n, path);
  } else {
    top = getTopGames(n, path);
  }

  if (!top.length) return "No games tracked yet.";

  const label =
    scope === "day"
      ? "Today"
      : scope === "yesterday"
      ? "Yday"
      : scope === "week"
      ? "Week"
      : scope === "month"
      ? "Month"
      : scope === "stream"
      ? "Stream"
      : scope === "lastDays"
      ? `${days}d`
      : "All";

  const header = `Top ${label}: `;
  const parts = top.map(
    (x, i) => `${i + 1}) ${truncateGameName(x.game, maxNameChars)} ${formatDurationCompact(x.ms)}`
  );

  const listParts = [];
  for (const part of parts) {
    const next =
      listParts.length > 0
        ? `${listParts.join(" | ")} | ${part}`
        : part;
    if (header.length + next.length > maxMessageChars) break;
    listParts.push(part);
  }

  const finalParts = listParts.length > 0 ? listParts : [parts[0]];
  let list = finalParts.join(" | ");

  if (finalParts.length < parts.length) {
    const suffix = ` | +${parts.length - finalParts.length} more`;
    if (header.length + list.length + suffix.length <= maxMessageChars) {
      list += suffix;
    }
  }

  return `${header}${list}`;
}


