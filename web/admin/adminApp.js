import React, { useEffect, useMemo, useRef, useState } from "https://esm.sh/react@18.3.1";
import { createRoot } from "https://esm.sh/react-dom@18.3.1/client";
import htm from "https://esm.sh/htm@3.1.1";
import { applyStreamerThemeFromStatus } from "/static/theme.js";

const html = htm.bind(React.createElement);

const MODE_TO_TWITCH = {
  "!join.on": { titleKey: "join", gameName: "Roblox" },
  "!ticket.on": { titleKey: "ticket", gameName: "Roblox" },
  "!link.on": { titleKey: "link", gameName: "Roblox" },
  "!1v1.on": { titleKey: "1v1", gameName: "Roblox" },
};

const REQUIRED_BOT_SCOPES = [
  "user:read:chat",
  "user:write:chat",
  "moderator:manage:chat_messages",
  "moderator:manage:chat_settings",
];

const REQUIRED_STREAMER_SCOPES = [
  "channel:manage:broadcast",
  "channel:read:redemptions",
  "channel:manage:redemptions",
];

const FILTER_DEFAULTS = {
  spam: {
    windowMs: 7000,
    minMessages: 5,
    strikeResetMs: 600000,
    timeoutFirstSec: 30,
    timeoutRepeatSec: 60,
    reason: "[AUTOMATIC] Please stop excessively spamming - MainsBot",
    messageFirst: "{atUser}, please stop excessively spamming.",
    messageRepeat: "{atUser} Please STOP excessively spamming.",
  },
  length: {
    maxChars: 400,
    strikeResetMs: 600000,
    timeoutFirstSec: 30,
    timeoutRepeatSec: 60,
    reason: "[AUTOMATIC] Message exceeds max character limit - MainsBot",
    message: "{atUser} Message exceeds max character limit.",
  },
  link: {
    strikeResetMs: 600000,
    timeoutFirstSec: 1,
    timeoutRepeatSec: 5,
    reason: "[AUTOMATIC] No links allowed - MainsBot",
    message: "{atUser} No links allowed in chat.",
  },
};
const DEFAULT_SPOTIFY_ANNOUNCE_TEMPLATE = "{streamerDisplay} is now listening to {track}";
const DEFAULT_POLL_ANNOUNCE_TEMPLATE = "New poll! {title} :: {options}{extraVotes}";
const DEFAULT_POLL_COMPLETE_NO_POINTS_TEMPLATE =
  "Poll has ended {winning} has won the poll! Nobody dumped any {channelPointsName} Sadge";
const DEFAULT_POLL_COMPLETE_LOSS_TEMPLATE =
  "RIPBOZO @{user} just lost {channelPoints} {channelPointsName} thats {farmTime} of farming";
const DEFAULT_POLL_COMPLETE_WIN_TEMPLATE =
  "PogU @{user} just spent {channelPoints} {channelPointsName}";

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => {
    if (ch === "&") return "&amp;";
    if (ch === "<") return "&lt;";
    if (ch === ">") return "&gt;";
    if (ch === '"') return "&quot;";
    return "&#39;";
  });
}

function formatActivityTime(value) {
  const ts = Date.parse(String(value || ""));
  if (!Number.isFinite(ts) || ts <= 0) return String(value || "");
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return String(value || "");
  }
}

function formatDateTime(value) {
  const ts = Number(value) || Date.parse(String(value || ""));
  if (!Number.isFinite(ts) || ts <= 0) return "n/a";
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return "n/a";
  }
}

function formatTtl(seconds) {
  const n = Number(seconds);
  if (!Number.isFinite(n)) return "n/a";
  if (n <= 0) return "expired";
  const d = Math.floor(n / 86400);
  const h = Math.floor((n % 86400) / 3600);
  const m = Math.floor((n % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatFarmHours(minutes) {
  const mins = Number(minutes);
  if (!Number.isFinite(mins) || mins <= 0) return "0h";
  const hours = mins / 60;
  if (hours >= 24) return `${(hours / 24).toFixed(1)}d`;
  return `${hours.toFixed(1)}h`;
}

function toCsv(arr) {
  return Array.isArray(arr) ? arr.join(", ") : "";
}

function fromCsv(text) {
  return String(text || "")
    .split(/[,\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function asInt(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : fallback;
}

function asArray(value) {
  return Array.isArray(value)
    ? value.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
}

function asStringMap(value) {
  const out = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return out;
  for (const [k, v] of Object.entries(value)) {
    const key = String(k || "").trim();
    const val = String(v ?? "").trim();
    if (!key) continue;
    out[key] = val;
  }
  return out;
}

function normalizeLogin(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeId(value) {
  return String(value || "").trim();
}

function normalizeModeCommand(value) {
  let out = String(value || "").trim().toLowerCase();
  if (!out) return "";
  if (!out.startsWith("!")) out = `!${out}`;
  if (!out.endsWith(".on")) out = `${out.replace(/\.off$/i, "")}.on`;
  return out;
}

function modeKeyFromCommand(modeCommand) {
  return normalizeModeCommand(modeCommand).replace(/^!/, "").replace(/\.on$/i, "");
}

function normalizeModes(input = {}, fallback = {}) {
  const src = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const out = {};
  const seed = new Set([
    ...Object.keys(fallback || {}),
    ...Object.keys(src || {}),
  ]);

  for (const rawMode of seed) {
    const command = normalizeModeCommand(rawMode);
    if (!command) continue;
    const modeKey = modeKeyFromCommand(command);
    const f = fallback?.[command] && typeof fallback[command] === "object" ? fallback[command] : {};
    const r = src?.[rawMode] && typeof src[rawMode] === "object" ? src[rawMode] : {};
    out[command] = {
      command,
      key: String(r.key || f.key || modeKey).trim() || modeKey,
      responseCommand: String(r.responseCommand || r.command || f.responseCommand || "").trim(),
      timerMessage: String(r.timerMessage || r.timer || f.timerMessage || "").trim(),
      title: String(r.title || f.title || "").trim(),
      gameName: String(r.gameName || r.game || f.gameName || "").trim(),
      keywordKey: String(r.keywordKey || r.keyword || f.keywordKey || modeKey).trim() || modeKey,
      recapSpamCount: Math.max(0, Math.floor(Number(r.recapSpamCount ?? f.recapSpamCount ?? 0) || 0)),
      recapMessage: String(r.recapMessage || f.recapMessage || "").trim(),
    };
  }

  return out;
}

function normalizeScopeList(scopes) {
  return Array.isArray(scopes)
    ? scopes.map((scope) => String(scope || "").trim().toLowerCase()).filter(Boolean)
    : [];
}

function getMissingScopes(haveScopes, requiredScopes) {
  const have = new Set(normalizeScopeList(haveScopes));
  return (Array.isArray(requiredScopes) ? requiredScopes : []).filter(
    (scope) => !have.has(String(scope || "").trim().toLowerCase())
  );
}

function normalizeKeywords(raw) {
  const src = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const out = {};
  for (const [k, list] of Object.entries(src)) {
    const key = String(k || "").trim().toLowerCase();
    if (!key) continue;
    const phrases = Array.isArray(list)
      ? list
          .map((item) => String(item || "").trim().toLowerCase())
          .filter(Boolean)
      : [];
    out[key] = Array.from(new Set(phrases));
  }
  return out;
}

function normalizeCustomCommandRows(rawRows) {
  const rows = Array.isArray(rawRows) ? rawRows : [];
  const seen = new Set();
  const out = [];
  for (const row of rows) {
    const command = String(row?.command || "").trim().toLowerCase();
    const response = String(row?.response || "").trim();
    if (!command || !command.startsWith("!")) continue;
    if (!response) continue;
    if (seen.has(command)) continue;
    seen.add(command);
    const inputPlatforms = Array.isArray(row?.platforms) ? row.platforms : [];
    const hasTwitch = inputPlatforms.includes("twitch");
    const hasDiscord = inputPlatforms.includes("discord");
    out.push({
      command,
      response,
      enabled: row?.enabled == null ? true : Boolean(row.enabled),
      deleted: Boolean(row?.deleted),
      deletedAt: row?.deletedAt ? String(row.deletedAt) : null,
      cooldowns: {
        twitchMs: Math.max(0, Math.floor(Number(row?.cooldowns?.twitchMs) || 0)),
        discordMs: Math.max(0, Math.floor(Number(row?.cooldowns?.discordMs) || 0)),
      },
      platforms:
        hasTwitch || hasDiscord
          ? [hasTwitch ? "twitch" : null, hasDiscord ? "discord" : null].filter(Boolean)
          : ["twitch", "discord"],
    });
  }
  return out.sort((a, b) => a.command.localeCompare(b.command));
}

function isOAuthConnected(entry) {
  if (!entry || typeof entry !== "object") return false;
  return Boolean(entry.hasAccessToken || entry.hasRefreshToken);
}

function normalizeSettings(raw) {
  const src = raw && typeof raw === "object" ? { ...raw } : {};
  src.ks = Boolean(src.ks);
  src.timers = src.timers == null ? true : Boolean(src.timers);
  src.keywords = src.keywords == null ? true : Boolean(src.keywords);
  src.spamFilter = src.spamFilter == null ? true : Boolean(src.spamFilter);
  src.lengthFilter = Boolean(src.lengthFilter);
  src.linkFilter = src.linkFilter == null ? true : Boolean(src.linkFilter);
  src.currentMode = String(src.currentMode || "!join.on").trim() || "!join.on";
  src.currentGame = String(src.currentGame || "Website").trim() || "Website";
  src.spotifyAnnounceEnabled = Boolean(src.spotifyAnnounceEnabled);
  src.spotifyAnnounceTemplate =
    String(src.spotifyAnnounceTemplate || DEFAULT_SPOTIFY_ANNOUNCE_TEMPLATE).trim() ||
    DEFAULT_SPOTIFY_ANNOUNCE_TEMPLATE;
  src.spotifyAnnounceEmote = String(src.spotifyAnnounceEmote || "").trim();
  src.pollAnnounceEnabled = Boolean(src.pollAnnounceEnabled);
  src.pollAnnounceTemplate =
    String(src.pollAnnounceTemplate || DEFAULT_POLL_ANNOUNCE_TEMPLATE).trim() ||
    DEFAULT_POLL_ANNOUNCE_TEMPLATE;
  src.pollAnnounceChannelPointsName =
    String(src.pollAnnounceChannelPointsName || "channel points").trim() ||
    "channel points";
  src.pollCompleteNoPointsTemplate =
    String(src.pollCompleteNoPointsTemplate || DEFAULT_POLL_COMPLETE_NO_POINTS_TEMPLATE).trim() ||
    DEFAULT_POLL_COMPLETE_NO_POINTS_TEMPLATE;
  src.pollCompleteLossTemplate =
    String(src.pollCompleteLossTemplate || DEFAULT_POLL_COMPLETE_LOSS_TEMPLATE).trim() ||
    DEFAULT_POLL_COMPLETE_LOSS_TEMPLATE;
  src.pollCompleteWinTemplate =
    String(src.pollCompleteWinTemplate || DEFAULT_POLL_COMPLETE_WIN_TEMPLATE).trim() ||
    DEFAULT_POLL_COMPLETE_WIN_TEMPLATE;

  src.linkAllowlist = asArray(src.linkAllowlist);
  src.linkAllowlistText = String(src.linkAllowlistText || toCsv(src.linkAllowlist));
  src.titles = asStringMap(src.titles);
  src.modeGames = asStringMap(src.modeGames);

  const fallbackModes = {};
  const validModesRaw = asArray(src.validModes);
  const seedModes = validModesRaw.length ? validModesRaw : Object.keys(MODE_TO_TWITCH);
  for (const rawMode of seedModes) {
    const mode = normalizeModeCommand(rawMode);
    if (!mode) continue;
    const modeKey = modeKeyFromCommand(mode);
    const baseCfg = MODE_TO_TWITCH[mode] || {};
    fallbackModes[mode] = {
      command: mode,
      key: modeKey,
      responseCommand: String(src.main?.[modeKey] || ""),
      timerMessage: String(src.timer?.[modeKey] || ""),
      title: String(src.titles?.[modeKey] || ""),
      gameName: String(src.modeGames?.[mode] || baseCfg?.gameName || ""),
      keywordKey: modeKey,
      recapSpamCount: mode === "!reddit.on" ? 3 : 0,
      recapMessage: mode === "!reddit.on" ? "REDDIT RECAP TIME: {url}" : "",
    };
  }
  src.modes = normalizeModes(src.modes, fallbackModes);
  src.validModes = Object.keys(src.modes);
  if (!src.validModes.length) src.validModes = Object.keys(fallbackModes);
  if (!src.validModes.includes(src.currentMode)) {
    src.currentMode = src.validModes[0] || "!join.on";
  }

  src.main = asStringMap(src.main);
  src.timer = asStringMap(src.timer);
  for (const mode of src.validModes) {
    const modeDef = src.modes[mode];
    if (!modeDef) continue;
    const key = String(modeDef.key || modeKeyFromCommand(mode)).trim();
    if (key && modeDef.responseCommand) src.main[key] = String(modeDef.responseCommand);
    if (key && modeDef.timerMessage) src.timer[key] = String(modeDef.timerMessage);
    if (key && modeDef.title) src.titles[key] = String(modeDef.title);
    if (modeDef.gameName) src.modeGames[mode] = String(modeDef.gameName);
  }

  const filters = src.filters && typeof src.filters === "object" ? src.filters : {};
  const spam = filters.spam && typeof filters.spam === "object" ? filters.spam : {};
  const length = filters.length && typeof filters.length === "object" ? filters.length : {};
  const link = filters.link && typeof filters.link === "object" ? filters.link : {};

  src.filters = {
    spam: {
      windowMs: asInt(spam.windowMs, FILTER_DEFAULTS.spam.windowMs),
      minMessages: asInt(spam.minMessages, FILTER_DEFAULTS.spam.minMessages),
      strikeResetMs: asInt(spam.strikeResetMs, FILTER_DEFAULTS.spam.strikeResetMs),
      timeoutFirstSec: asInt(spam.timeoutFirstSec, FILTER_DEFAULTS.spam.timeoutFirstSec),
      timeoutRepeatSec: asInt(spam.timeoutRepeatSec, FILTER_DEFAULTS.spam.timeoutRepeatSec),
      reason: String(spam.reason || FILTER_DEFAULTS.spam.reason),
      messageFirst: String(spam.messageFirst || FILTER_DEFAULTS.spam.messageFirst),
      messageRepeat: String(spam.messageRepeat || FILTER_DEFAULTS.spam.messageRepeat),
    },
    length: {
      maxChars: asInt(length.maxChars, FILTER_DEFAULTS.length.maxChars),
      strikeResetMs: asInt(length.strikeResetMs, FILTER_DEFAULTS.length.strikeResetMs),
      timeoutFirstSec: asInt(length.timeoutFirstSec, FILTER_DEFAULTS.length.timeoutFirstSec),
      timeoutRepeatSec: asInt(length.timeoutRepeatSec, FILTER_DEFAULTS.length.timeoutRepeatSec),
      reason: String(length.reason || FILTER_DEFAULTS.length.reason),
      message: String(length.message || FILTER_DEFAULTS.length.message),
    },
    link: {
      strikeResetMs: asInt(link.strikeResetMs, FILTER_DEFAULTS.link.strikeResetMs),
      timeoutFirstSec: asInt(link.timeoutFirstSec, FILTER_DEFAULTS.link.timeoutFirstSec),
      timeoutRepeatSec: asInt(link.timeoutRepeatSec, FILTER_DEFAULTS.link.timeoutRepeatSec),
      reason: String(link.reason || FILTER_DEFAULTS.link.reason),
      message: String(link.message || FILTER_DEFAULTS.link.message),
    },
  };

  return src;
}

function updateThemeToggleLabel() {
  const button = document.getElementById("themeToggle");
  if (!button) return;
  const isLight = document.documentElement.dataset.theme === "light";
  button.textContent = isLight ? "Dark" : "Light";
}

function initThemeToggle() {
  const button = document.getElementById("themeToggle");
  const saved = localStorage.getItem("theme");
  document.documentElement.dataset.theme = saved === "light" ? "light" : "dark";
  updateThemeToggleLabel();
  if (!button || button.__themeInit) return;
  button.__themeInit = true;
  button.addEventListener("click", () => {
    const isLight = document.documentElement.dataset.theme === "light";
    const next = isLight ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    localStorage.setItem("theme", next);
    updateThemeToggleLabel();
  });
}

async function initStreamerTheme() {
  try {
    const res = await fetch("/api/status", {
      cache: "no-store",
      credentials: "same-origin",
    });
    const status = res.ok ? await res.json().catch(() => null) : null;
    applyStreamerThemeFromStatus(status);
  } catch {}
}

async function initTopbarSession() {
  const right = document.getElementById("adminTopbarRight");
  if (!right) return;
  try {
    const res = await fetch("/api/admin/session", { cache: "no-store", credentials: "same-origin" });
    const session = await res.json().catch(() => null);
    const login = String(session?.login || "").trim();
    if (session?.allowed && login) {
      right.innerHTML = `
        <div class="row" style="justify-content:flex-end">
          <a class="btn btn--sm btn--ghost" href="/swagger">Swagger</a>
          <span class="muted" style="font-size:13px">Logged in as</span>
          <strong>${escapeHtml(login)}</strong>
          <a class="btn btn--sm btn--danger" href="/admin/logout">Logout</a>
        </div>
      `;
      return;
    }
  } catch {}
  right.innerHTML = `
    <div class="row" style="justify-content:flex-end">
      <a class="btn btn--sm btn--ghost" href="/swagger">Swagger</a>
      <a class="btn btn--sm" href="/admin/login">Login</a>
    </div>
  `;
}

function ToggleSwitch({ checked, onChange, disabled = false }) {
  return html`
    <label className="switch">
      <input type="checkbox" checked=${Boolean(checked)} onChange=${onChange} disabled=${Boolean(disabled)} />
      <span className="switch__track"></span>
      <span className="switch__label">${checked ? "ON" : "OFF"}</span>
    </label>
  `;
}

function renderFatalPanel(error, context = "Admin dashboard") {
  const message = String(error?.message || error || "Unknown error").trim() || "Unknown error";
  const stack = String(error?.stack || "").trim();
  return html`
    <div className="panel">
      <h2>${context} failed</h2>
      <div className="meta" style=${{ marginTop: "8px" }}>
        ${message}
      </div>
      ${stack
        ? html`
            <details className="details">
              <summary>Stack trace</summary>
              <pre className="status-json-wrap" style=${{ marginTop: "10px" }}><code>${stack}</code></pre>
            </details>
          `
        : null}
    </div>
  `;
}

function renderBootFatal(rootEl, error, context = "Admin boot") {
  if (!rootEl) return;
  const message = String(error?.message || error || "Unknown error").trim() || "Unknown error";
  const stack = String(error?.stack || "").trim();
  rootEl.className = "";
  rootEl.innerHTML = `
    <div class="panel">
      <h2>${escapeHtml(context)} failed</h2>
      <div class="meta" style="margin-top:8px">${escapeHtml(message)}</div>
      ${
        stack
          ? `<details class="details"><summary>Stack trace</summary><pre class="status-json-wrap" style="margin-top:10px"><code>${escapeHtml(stack)}</code></pre></details>`
          : ""
      }
    </div>
  `;
}

class AdminErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error: error || new Error("Unknown admin render error") };
  }

  componentDidCatch(error) {
    console.error("[admin] error boundary caught:", error);
  }

  render() {
    if (this.state?.error) {
      return renderFatalPanel(this.state.error, "Admin dashboard");
    }
    return this.props.children;
  }
}

function App() {
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("home");
  const [status, setStatus] = useState("");
  const [settings, setSettings] = useState(null);
  const [runtime, setRuntime] = useState(null);
  const [auth, setAuth] = useState(null);
  const [session, setSession] = useState(null);
  const [keywords, setKeywords] = useState({});
  const [keywordsText, setKeywordsText] = useState("{}");
  const [customCommandRows, setCustomCommandRows] = useState([]);
  const [analyticsRows, setAnalyticsRows] = useState([]);
  const [analyticsDays, setAnalyticsDays] = useState(7);
  const [analyticsPlatform, setAnalyticsPlatform] = useState("all");
  const [health, setHealth] = useState(null);
  const [simCommand, setSimCommand] = useState("!newcommand");
  const [simArgs, setSimArgs] = useState("");
  const [simOutput, setSimOutput] = useState("");
  const [importText, setImportText] = useState("");
  const [activityRows, setActivityRows] = useState([]);
  const [activityLoading, setActivityLoading] = useState(true);
  const [pointsData, setPointsData] = useState({ days: 30, users: [], userCount: 0 });
  const [pointsLoading, setPointsLoading] = useState(false);
  const [pointsDays, setPointsDays] = useState(30);
  const keywordImportFileRef = useRef(null);
  const [activityQuery, setActivityQuery] = useState({
    q: "",
    action: "",
    actor: "",
    source: "",
    from: "",
    to: "",
  });

  useEffect(() => {
    const desired = String(window.location.hash || "").replace(/^#/, "").toLowerCase();
    setView(["settings", "keywords", "commands", "points"].includes(desired) ? desired : "home");
    const onHashChange = () => {
      const next = String(window.location.hash || "").replace(/^#/, "").toLowerCase();
      setView(["settings", "keywords", "commands", "points"].includes(next) ? next : "home");
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const settingsRes = await fetch("/api/admin/settings", {
          credentials: "same-origin",
          cache: "no-store",
        });
        const settingsPayload = await settingsRes.json().catch(() => null);
        if (!settingsRes.ok) {
          throw new Error(settingsPayload?.error || `${settingsRes.status} ${settingsRes.statusText}`);
        }
        if (cancelled) return;
        setSettings(normalizeSettings(settingsPayload?.settings || {}));
      } catch (e) {
        if (!cancelled) setStatus(`Error: ${String(e?.message || e)}`);
      } finally {
        if (!cancelled) setLoading(false);
      }

      const tasks = [
        (async () => {
          const res = await fetch("/api/status", { credentials: "same-origin", cache: "no-store" });
          const body = res.ok ? await res.json().catch(() => null) : null;
          if (cancelled) return;
          setRuntime(body);
          applyStreamerThemeFromStatus(body);
        })(),
        (async () => {
          const res = await fetch("/api/auth/status", { credentials: "same-origin", cache: "no-store" });
          const body = res.ok ? await res.json().catch(() => null) : null;
          if (!cancelled) setAuth(body);
        })(),
        (async () => {
          const res = await fetch("/api/admin/session", { credentials: "same-origin", cache: "no-store" });
          const body = res.ok ? await res.json().catch(() => null) : null;
          if (!cancelled) setSession(body);
        })(),
        (async () => {
          const res = await fetch("/api/admin/keywords", { credentials: "same-origin", cache: "no-store" });
          const body = res.ok ? await res.json().catch(() => null) : null;
          if (cancelled) return;
          const normalizedKeywords = normalizeKeywords(body?.keywords || {});
          setKeywords(normalizedKeywords);
          setKeywordsText(JSON.stringify(normalizedKeywords, null, 2));
        })(),
        (async () => {
          const res = await fetch("/api/admin/custom-commands", { credentials: "same-origin", cache: "no-store" });
          const body = res.ok ? await res.json().catch(() => null) : null;
          if (!cancelled) {
            setCustomCommandRows(normalizeCustomCommandRows(body?.rows || []));
          }
        })(),
        (async () => {
          const res = await fetch("/api/admin/analytics/commands?days=7&platform=all&limit=20", {
            credentials: "same-origin",
            cache: "no-store",
          });
          const body = res.ok ? await res.json().catch(() => null) : null;
          if (!cancelled) {
            setAnalyticsRows(Array.isArray(body?.rows) ? body.rows : []);
          }
        })(),
        (async () => {
          const res = await fetch("/api/admin/health", { credentials: "same-origin", cache: "no-store" });
          const body = res.ok ? await res.json().catch(() => null) : null;
          if (!cancelled) setHealth(body || null);
        })(),
        (async () => {
          const res = await fetch("/api/admin/activity?limit=120", {
            credentials: "same-origin",
            cache: "no-store",
          });
          const body = res.ok ? await res.json().catch(() => null) : null;
          if (!cancelled) {
            setActivityRows(Array.isArray(body?.rows) ? body.rows : []);
          }
        })(),
      ];

      await Promise.allSettled(tasks);
      if (!cancelled) setActivityLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  async function refreshActivity(overrideQuery = null) {
    setActivityLoading(true);
    try {
      const activeQuery = overrideQuery || activityQuery;
      const params = new URLSearchParams();
      params.set("limit", "120");
      if (activeQuery.q) params.set("q", activeQuery.q);
      if (activeQuery.action) params.set("action", activeQuery.action);
      if (activeQuery.actor) params.set("actor", activeQuery.actor);
      if (activeQuery.source) params.set("source", activeQuery.source);
      if (activeQuery.from) params.set("from", activeQuery.from);
      if (activeQuery.to) params.set("to", activeQuery.to);
      const res = await fetch(`/api/admin/activity?${params.toString()}`, {
        credentials: "same-origin",
        cache: "no-store",
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || `${res.status} ${res.statusText}`);
      setActivityRows(Array.isArray(body?.rows) ? body.rows : []);
    } catch (e) {
      setStatus(`Error: ${String(e?.message || e)}`);
    } finally {
      setActivityLoading(false);
    }
  }

  async function refreshAnalytics() {
    try {
      const res = await fetch(
        `/api/admin/analytics/commands?days=${encodeURIComponent(String(analyticsDays || 7))}&platform=${encodeURIComponent(String(analyticsPlatform || "all"))}&limit=20`,
        { credentials: "same-origin", cache: "no-store" }
      );
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || `${res.status} ${res.statusText}`);
      setAnalyticsRows(Array.isArray(body?.rows) ? body.rows : []);
    } catch (e) {
      setStatus(`Error: ${String(e?.message || e)}`);
    }
  }

  async function refreshHealth() {
    try {
      const res = await fetch("/api/admin/health", {
        credentials: "same-origin",
        cache: "no-store",
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || `${res.status} ${res.statusText}`);
      setHealth(body || null);
    } catch (e) {
      setStatus(`Error: ${String(e?.message || e)}`);
    }
  }

  async function loadChannelPoints({ days = pointsDays, limitUsers = 300 } = {}) {
    setPointsLoading(true);
    try {
      const safeDays = Math.max(1, Math.min(365, Number(days) || 30));
      const res = await fetch(
        `/api/admin/channel-points?days=${encodeURIComponent(String(safeDays))}&limitUsers=${encodeURIComponent(
          String(limitUsers)
        )}`,
        { credentials: "same-origin", cache: "no-store" }
      );
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || `${res.status} ${res.statusText}`);
      setPointsData({
        days: Number(body?.days || safeDays),
        users: Array.isArray(body?.users) ? body.users : [],
        userCount: Number(body?.userCount || 0),
      });
    } catch (e) {
      setStatus(`Error: ${String(e?.message || e)}`);
    } finally {
      setPointsLoading(false);
    }
  }

  async function runCommandSimulation() {
    setStatus("Simulating command...");
    try {
      const res = await fetch("/api/admin/command-simulate", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          command: String(simCommand || ""),
          args: String(simArgs || ""),
          user: { login: "tester", displayName: "Tester" },
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || `${res.status} ${res.statusText}`);
      setSimOutput(String(body?.output || ""));
      setStatus("Simulation complete.");
    } catch (e) {
      setStatus(`Error: ${String(e?.message || e)}`);
    }
  }

  const setField = (key, value) =>
    setSettings((prev) => normalizeSettings({ ...(prev || {}), [key]: value }));

  const setFilterField = (group, key, value) =>
    setSettings((prev) => {
      const base = normalizeSettings(prev || {});
      return normalizeSettings({
        ...base,
        filters: {
          ...base.filters,
          [group]: {
            ...base.filters[group],
            [key]: value,
          },
        },
      });
    });

  const setModeField = (mode, key, value) =>
    setSettings((prev) => {
      const base = normalizeSettings(prev || {});
      const modeCmd = normalizeModeCommand(mode);
      if (!modeCmd || !base.modes?.[modeCmd]) return base;
      return normalizeSettings({
        ...base,
        modes: {
          ...base.modes,
          [modeCmd]: {
            ...base.modes[modeCmd],
            [key]: value,
          },
        },
      });
    });

  const addMode = () =>
    setSettings((prev) => {
      const base = normalizeSettings(prev || {});
      let nextIndex = 1;
      let modeCommand = "";
      do {
        modeCommand = normalizeModeCommand(`!custom${nextIndex}.on`);
        nextIndex += 1;
      } while (base.modes?.[modeCommand]);

      const modeKey = modeKeyFromCommand(modeCommand);
      return normalizeSettings({
        ...base,
        modes: {
          ...base.modes,
          [modeCommand]: {
            command: modeCommand,
            key: modeKey,
            responseCommand: "",
            timerMessage: "",
            title: "",
            gameName: "",
            keywordKey: modeKey,
            recapSpamCount: 0,
            recapMessage: "",
          },
        },
        currentMode: modeCommand,
      });
    });

  const removeMode = (mode) =>
    setSettings((prev) => {
      const base = normalizeSettings(prev || {});
      const modeCmd = normalizeModeCommand(mode);
      if (!modeCmd || !base.modes?.[modeCmd]) return base;
      const nextModes = { ...base.modes };
      delete nextModes[modeCmd];
      const nextValid = Object.keys(nextModes);
      return normalizeSettings({
        ...base,
        modes: nextModes,
        currentMode:
          base.currentMode === modeCmd
            ? nextValid[0] || "!join.on"
            : base.currentMode,
      });
    });

  const renameModeCommand = (mode, nextModeCommand) =>
    setSettings((prev) => {
      const base = normalizeSettings(prev || {});
      const current = normalizeModeCommand(mode);
      const next = normalizeModeCommand(nextModeCommand);
      if (!current || !next || !base.modes?.[current]) return base;
      if (current === next) return base;
      const nextModes = { ...base.modes };
      if (nextModes[next]) return base;
      const currentDef = { ...(nextModes[current] || {}) };
      delete nextModes[current];
      nextModes[next] = {
        ...currentDef,
        command: next,
        key: String(currentDef.key || modeKeyFromCommand(next)).trim() || modeKeyFromCommand(next),
      };
      return normalizeSettings({
        ...base,
        modes: nextModes,
        currentMode: base.currentMode === current ? next : base.currentMode,
      });
    });

  const modeOptions = useMemo(() => {
    if (!settings) return [];
    const seen = new Set();
    const out = [];
    for (const mode of settings.validModes) {
      if (!mode || seen.has(mode)) continue;
      seen.add(mode);
      out.push({ value: mode, label: mode });
    }
    if (settings.currentMode && !seen.has(settings.currentMode)) {
      out.push({ value: settings.currentMode, label: `${settings.currentMode} (custom)` });
    }
    return out;
  }, [settings]);

  const modeRows = useMemo(() => {
    if (!settings?.modes || typeof settings.modes !== "object") return [];
    return Object.keys(settings.modes)
      .sort((a, b) => a.localeCompare(b))
      .map((mode) => ({
        mode,
        def: settings.modes[mode] || {},
      }));
  }, [settings]);

  async function saveSettings() {
    if (!settings) return;
    setStatus("Saving...");
    try {
      const normalized = normalizeSettings(settings);
      const cleanModes = normalizeModes(normalized.modes || {});
      const cleanTitles = {};
      const cleanModeGames = {};
      const cleanMain = {};
      const cleanTimer = {};
      for (const [mode, def] of Object.entries(cleanModes)) {
        const key = String(def.key || modeKeyFromCommand(mode)).trim();
        const title = String(def.title || "").trim();
        const gameName = String(def.gameName || "").trim();
        const responseCommand = String(def.responseCommand || "").trim();
        const timerMessage = String(def.timerMessage || "").trim();
        if (key && title) cleanTitles[key] = title;
        if (gameName) cleanModeGames[mode] = gameName;
        if (key && responseCommand) cleanMain[key] = responseCommand;
        if (key && timerMessage) cleanTimer[key] = timerMessage;
      }

      const payload = {
        settings: {
          ...normalized,
          linkAllowlist: fromCsv(normalized.linkAllowlistText),
          modes: cleanModes,
          validModes: Object.keys(cleanModes),
          main: cleanMain,
          timer: cleanTimer,
          titles: cleanTitles,
          modeGames: cleanModeGames,
        },
      };
      delete payload.settings.linkAllowlistText;

      const res = await fetch("/api/admin/settings", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(body?.error || `${res.status} ${res.statusText}`);
      }
      setSettings(normalizeSettings(body?.settings || {}));
      setStatus(`Saved (${String(body?.backend || "ok")}).`);
      void refreshActivity();
    } catch (e) {
      setStatus(`Error: ${String(e?.message || e)}`);
    }
  }

  async function applyToTwitch() {
    if (!settings) return;
    setStatus("Applying to Twitch...");
    try {
      const normalized = normalizeSettings(settings);
      const res = await fetch("/api/admin/apply-mode", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mode: String(normalized.currentMode || "").trim(),
          modes: normalized.modes || {},
          titles: normalized.titles || {},
          modeGames: normalized.modeGames || {},
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(body?.error || `${res.status} ${res.statusText}`);
      }
      setStatus("Applied to Twitch.");
      void refreshActivity();
    } catch (e) {
      setStatus(`Error: ${String(e?.message || e)}`);
    }
  }

  async function saveAndApplyMode() {
    await saveSettings();
    await applyToTwitch();
  }

  async function saveKeywords() {
    setStatus("Saving keywords...");
    try {
      const parsed = JSON.parse(String(keywordsText || "{}"));
      const normalized = normalizeKeywords(parsed);
      const res = await fetch("/api/admin/keywords", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ keywords: normalized }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(body?.error || `${res.status} ${res.statusText}`);
      }
      const saved = normalizeKeywords(body?.keywords || {});
      setKeywords(saved);
      setKeywordsText(JSON.stringify(saved, null, 2));
      setStatus(`Keywords saved (${String(body?.backend || "ok")}).`);
      void refreshActivity();
    } catch (e) {
      setStatus(`Error: ${String(e?.message || e)}`);
    }
  }

  async function importKeywordsFromFile(event) {
    const file = event?.target?.files?.[0];
    if (!file) return;
    try {
      setStatus(`Importing ${String(file.name || "keywords.json")}...`);
      const text = await file.text();
      const parsed = JSON.parse(String(text || "{}"));
      const normalized = normalizeKeywords(parsed);
      setKeywords(normalized);
      setKeywordsText(JSON.stringify(normalized, null, 2));
      setStatus(
        `Imported ${Object.keys(normalized).length} categories. Click Save Keywords to persist.`
      );
    } catch (e) {
      setStatus(`Error: Invalid JSON file (${String(e?.message || e)})`);
    } finally {
      if (event?.target) event.target.value = "";
    }
  }

  function updateCustomCommandRow(index, patch = {}) {
    setCustomCommandRows((prev) => {
      const next = Array.isArray(prev) ? [...prev] : [];
      if (!next[index]) return next;
      next[index] = { ...next[index], ...patch };
      return next;
    });
  }

  function addCustomCommandRow() {
    setCustomCommandRows((prev) => {
      const next = Array.isArray(prev) ? [...prev] : [];
      next.push({
        command: "!newcommand",
        response: "",
        platforms: ["twitch", "discord"],
        enabled: true,
        deleted: false,
        deletedAt: null,
        cooldowns: { twitchMs: 0, discordMs: 0 },
      });
      return next;
    });
  }

  function removeCustomCommandRow(index) {
    setCustomCommandRows((prev) => {
      const next = Array.isArray(prev) ? [...prev] : [];
      if (!next[index]) return next;
      next[index] = {
        ...next[index],
        enabled: false,
        deleted: true,
        deletedAt: new Date().toISOString(),
      };
      return next;
    });
  }

  function restoreCustomCommandRow(index) {
    setCustomCommandRows((prev) => {
      const next = Array.isArray(prev) ? [...prev] : [];
      if (!next[index]) return next;
      next[index] = {
        ...next[index],
        enabled: true,
        deleted: false,
        deletedAt: null,
      };
      return next;
    });
  }

  async function saveCustomCommands() {
    setStatus("Saving custom commands...");
    try {
      const rows = normalizeCustomCommandRows(customCommandRows || []);
      const res = await fetch("/api/admin/custom-commands", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "replace", rows }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || `${res.status} ${res.statusText}`);
      setCustomCommandRows(normalizeCustomCommandRows(body?.rows || []));
      setStatus("Custom commands saved.");
      void refreshActivity();
    } catch (e) {
      setStatus(`Error: ${String(e?.message || e)}`);
    }
  }

  function exportCustomCommands() {
    try {
      const rows = normalizeCustomCommandRows(customCommandRows || []);
      const blob = new Blob([JSON.stringify({ rows }, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "custom-commands.json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setStatus(`Error: ${String(e?.message || e)}`);
    }
  }

  function importCustomCommandsFromText() {
    try {
      const parsed = JSON.parse(String(importText || "{}"));
      const rows = normalizeCustomCommandRows(parsed?.rows || parsed);
      setCustomCommandRows(rows);
      setStatus(`Imported ${rows.length} command rows locally. Click Save to persist.`);
    } catch (e) {
      setStatus(`Error: ${String(e?.message || e)}`);
    }
  }

  const viewerLogin = normalizeLogin(session?.login || auth?.session?.login || "");
  const viewerUserId = normalizeId(session?.userId || auth?.session?.userId || "");
  const ownerLogin = normalizeLogin(auth?.identities?.ownerLogin || "");
  const ownerUserId = normalizeId(auth?.identities?.ownerUserId || "");
  const botLogin = normalizeLogin(auth?.identities?.botLogin || auth?.bot?.login || "");
  const botUserId = normalizeId(auth?.identities?.botUserId || auth?.bot?.userId || "");
  const streamerLogin = normalizeLogin(auth?.identities?.streamerLogin || auth?.streamer?.login || "");
  const streamerUserId = normalizeId(auth?.identities?.streamerUserId || auth?.streamer?.userId || "");

  const isOwner =
    (ownerLogin && viewerLogin === ownerLogin) ||
    (ownerUserId && viewerUserId === ownerUserId);
  const isBotAccount =
    (botLogin && viewerLogin === botLogin) ||
    (botUserId && viewerUserId === botUserId);
  const isStreamerAccount =
    (streamerLogin && viewerLogin === streamerLogin) ||
    (streamerUserId && viewerUserId === streamerUserId);

  const canLinkBot = Boolean(isOwner || isBotAccount);
  const canLinkStreamer = Boolean(isOwner || isStreamerAccount);
  const canLinkOtherOauth = Boolean(isOwner || isStreamerAccount);
  const canManageAuth = Boolean(canLinkBot || canLinkStreamer || canLinkOtherOauth);
  const adminRole = String(session?.role || "viewer").trim().toLowerCase();
  const canEditCommands = adminRole === "owner" || adminRole === "editor";
  const canEditSettings = adminRole === "owner" || adminRole === "editor";
  const canViewPointsDashboard = adminRole === "owner";

  useEffect(() => {
    if (!canViewPointsDashboard) return;
    if (view !== "points") return;
    void loadChannelPoints({ days: pointsDays, limitUsers: 300 });
  }, [view, canViewPointsDashboard, pointsDays]);

  try {
    if (loading) {
      return html`<div className="muted">Loading dashboard...</div>`;
    }

    if (!settings) {
      return html`<div className="muted">Failed to load settings.</div>`;
    }

    const twitchBotConnected = isOAuthConnected(auth?.bot);
    const twitchStreamerConnected = isOAuthConnected(auth?.streamer);
    const twitchBotMissingScopes = getMissingScopes(auth?.bot?.scopes, REQUIRED_BOT_SCOPES);
    const twitchStreamerMissingScopes = getMissingScopes(
      auth?.streamer?.scopes,
      REQUIRED_STREAMER_SCOPES
    );
    const spotifyConnected = Boolean(
      auth?.spotify?.hasRefreshToken || auth?.spotify?.hasAccessToken
    );
    const robloxConnected = isOAuthConnected(auth?.roblox?.bot);
    const spotifyReady = Boolean(
      auth?.spotify?.hasClientId &&
        auth?.spotify?.hasClientSecret &&
        (auth?.spotify?.hasRefreshToken || auth?.spotify?.hasAccessToken)
    );
    const robloxReady = Boolean(robloxConnected);
    const tokenCoverageReady =
      twitchBotConnected &&
      twitchStreamerConnected &&
      !twitchBotMissingScopes.length &&
      !twitchStreamerMissingScopes.length &&
      spotifyReady &&
      robloxReady;

    return html`
    <div className="grid">
      <div className="panel">
        <div className="panel__top">
          <div>
            <div className="pill">Dashboard</div>
            <h1 style=${{ marginTop: "10px" }}>Admin</h1>
            <div className="muted" style=${{ marginTop: "6px" }}>Manage settings, filters, and OAuth links.</div>
            <div className="meta" style=${{ marginTop: "6px" }}>Role: <code>${adminRole}</code></div>
          </div>
          <div className="row">
            ${canManageAuth ? html`<a className="btn btn--sm btn--ghost" href="/admin/auth">Auth</a>` : null}
            <a className="btn btn--sm btn--ghost" href="/admin/keywords">Keywords</a>
            <a className="btn btn--sm btn--ghost" href="/admin/redemptions">Redemptions</a>
            <a className="btn btn--sm btn--ghost" href="/api/status" target="_blank" rel="noreferrer">Status JSON</a>
          </div>
        </div>
        <div className="row" style=${{ marginTop: "12px" }}>
          <button className=${view === "home" ? "btn btn--sm" : "btn btn--sm btn--ghost"} onClick=${() => (window.location.hash = "home")}>Overview</button>
          <button className=${view === "settings" ? "btn btn--sm" : "btn btn--sm btn--ghost"} onClick=${() => (window.location.hash = "settings")}>Settings</button>
          <button className=${view === "commands" ? "btn btn--sm" : "btn btn--sm btn--ghost"} onClick=${() => (window.location.hash = "commands")}>Commands</button>
          <button className=${view === "keywords" ? "btn btn--sm" : "btn btn--sm btn--ghost"} onClick=${() => (window.location.hash = "keywords")}>Keywords</button>
          ${canViewPointsDashboard
            ? html`<button className=${view === "points" ? "btn btn--sm" : "btn btn--sm btn--ghost"} onClick=${() => (window.location.hash = "points")}>Channel Points</button>`
            : null}
        </div>
      </div>

      ${view === "home"
        ? html`
            <div className="grid">
              <div className="grid grid--3">
                <div className="panel">
                <h2>Bot</h2>
                <div className="row" style=${{ justifyContent: "space-between", marginTop: "8px" }}><span className="k">Online</span><span className=${runtime?.online ? "ok" : "warn"}>${runtime?.online ? "Yes" : "No"}</span></div>
                <div className="row" style=${{ justifyContent: "space-between" }}><span className="k">Mode</span><span>${String(settings.currentMode || "n/a")}</span></div>
                <div className="row" style=${{ justifyContent: "space-between" }}><span className="k">Game</span><span>${String(settings.currentGame || "n/a")}</span></div>
                <div className="row" style=${{ justifyContent: "space-between" }}><span className="k">Kill Switch</span><span>${settings.ks ? "ON" : "OFF"}</span></div>
                <div className="fieldlist" style=${{ marginTop: "10px" }}>
                  <div className="field field--compact">
                    <div className="field__meta">
                      <div className="field__label">Quick Mode</div>
                      <div className="field__hint">Fast switch for mods/broadcaster.</div>
                    </div>
                    <select className="in in--sm" value=${String(settings.currentMode || "")} onChange=${(e) => setField("currentMode", e.target.value)}>
                      ${modeOptions.map((opt) => html`<option key=${`quick:${opt.value}`} value=${opt.value}>${opt.label}</option>`)}
                    </select>
                  </div>
                  <div className="field field--compact">
                    <div className="field__meta">
                      <div className="field__label">Quick Kill Switch</div>
                      <div className="field__hint">Toggle KS quickly from overview.</div>
                    </div>
                    <${ToggleSwitch} checked=${settings.ks} onChange=${(e) => setField("ks", e.target.checked)} />
                  </div>
                </div>
                <div className="row" style=${{ marginTop: "10px" }}>
                  <button className="btn btn--sm" onClick=${saveSettings} disabled=${!canEditSettings}>Save Quick Changes</button>
                  <button className="btn btn--sm btn--ghost" onClick=${saveAndApplyMode} disabled=${!canEditSettings}>Save + Apply Mode</button>
                </div>
                <div className="meta">${status || "Use quick controls, then save."}</div>
                </div>
                <div className="panel">
                <h2>Twitch OAuth</h2>
                <div className="row" style=${{ justifyContent: "space-between", marginTop: "8px" }}><span className="k">Bot</span><span className=${twitchBotConnected ? "ok" : "warn"}>${twitchBotConnected ? "Connected" : "Not Connected"}</span></div>
                <div className="row" style=${{ justifyContent: "space-between" }}><span className="k">Streamer</span><span className=${twitchStreamerConnected ? "ok" : "warn"}>${twitchStreamerConnected ? "Connected" : "Not Connected"}</span></div>
                <div className="meta">Bot token TTL: <code>${formatTtl(auth?.bot?.expiresInSec)}</code></div>
                <div className="meta">Streamer token TTL: <code>${formatTtl(auth?.streamer?.expiresInSec)}</code></div>
                ${twitchBotMissingScopes.length
                  ? html`<div className="meta">Bot missing scopes: <code>${twitchBotMissingScopes.join(", ")}</code></div>`
                  : null}
                ${twitchStreamerMissingScopes.length
                  ? html`<div className="meta">Streamer missing scopes: <code>${twitchStreamerMissingScopes.join(", ")}</code></div>`
                  : null}
                <div className="row" style=${{ marginTop: "10px" }}>
                  ${canLinkBot ? html`<a className="btn btn--sm" href="/auth/twitch/bot">Link Bot</a>` : null}
                  ${canLinkStreamer ? html`<a className="btn btn--sm" href="/auth/twitch/streamer">Link Streamer</a>` : null}
                </div>
                ${!canLinkBot || !canLinkStreamer
                  ? html`<div className="meta">
                      ${!canLinkBot ? "Bot link: owner or bot account only. " : ""}
                      ${!canLinkStreamer ? "Streamer link: owner or streamer account only." : ""}
                    </div>`
                  : null}
                </div>
                <div className="panel">
                <h2>Other OAuth</h2>
                <div className="row" style=${{ justifyContent: "space-between", marginTop: "8px" }}><span className="k">Spotify</span><span className=${spotifyConnected ? "ok" : "warn"}>${spotifyConnected ? "Connected" : "Not Connected"}</span></div>
                <div className="row" style=${{ justifyContent: "space-between" }}><span className="k">Roblox</span><span className=${robloxConnected ? "ok" : "warn"}>${robloxConnected ? "Connected" : "Not Connected"}</span></div>
                <div className="meta">Spotify token TTL: <code>${formatTtl(auth?.spotify?.expiresInSec)}</code></div>
                <div className="meta">Spotify linked at: <code>${formatDateTime(auth?.spotify?.linkedAtMs)}</code></div>
                <div className="meta">
                  Token readiness:
                  ${" "}
                  <span className=${tokenCoverageReady ? "ok" : "warn"}>
                    ${tokenCoverageReady ? "Ready" : "Missing required tokens/scopes"}
                  </span>
                </div>
                <div className="row" style=${{ marginTop: "10px" }}>
                  ${canLinkOtherOauth ? html`<a className="btn btn--sm" href="/auth/spotify">Link Spotify</a>` : null}
                  ${canLinkOtherOauth ? html`<a className="btn btn--sm" href="/auth/roblox">Link Roblox</a>` : null}
                </div>
                ${!canLinkOtherOauth
                  ? html`<div className="meta">Spotify/Roblox linking: owner or streamer account only.</div>`
                  : null}
                </div>
              </div>
              <div className="panel">
                <div className="panel__top">
                  <div>
                    <h2>Activity Log</h2>
                    <div className="meta">Recent bot and admin actions (mode, gamepings, toggles, keyword/command updates).</div>
                  </div>
                  <button className="btn btn--sm btn--ghost" onClick=${refreshActivity}>Refresh</button>
                </div>
                <div className="fieldlist" style=${{ marginTop: "10px" }}>
                  <div className="field field--compact"><div className="field__meta"><div className="field__label">Search</div></div><input className="in in--sm" value=${activityQuery.q} onChange=${(e)=>setActivityQuery((prev)=>({ ...prev, q: String(e.target.value || "") }))} placeholder="keyword/meta/detail" /></div>
                  <div className="field field--compact"><div className="field__meta"><div className="field__label">Action</div></div><input className="in in--sm" value=${activityQuery.action} onChange=${(e)=>setActivityQuery((prev)=>({ ...prev, action: String(e.target.value || "") }))} placeholder="admin_save_settings" /></div>
                  <div className="field field--compact"><div className="field__meta"><div className="field__label">Actor</div></div><input className="in in--sm" value=${activityQuery.actor} onChange=${(e)=>setActivityQuery((prev)=>({ ...prev, actor: String(e.target.value || "") }))} placeholder="moderator login" /></div>
                  <div className="field field--compact"><div className="field__meta"><div className="field__label">Source</div></div><input className="in in--sm" value=${activityQuery.source} onChange=${(e)=>setActivityQuery((prev)=>({ ...prev, source: String(e.target.value || "") }))} placeholder="web / discord / bot" /></div>
                  <div className="field field--compact"><div className="field__meta"><div className="field__label">From</div></div><input className="in in--sm" type="datetime-local" value=${activityQuery.from} onChange=${(e)=>setActivityQuery((prev)=>({ ...prev, from: String(e.target.value || "") }))} /></div>
                  <div className="field field--compact"><div className="field__meta"><div className="field__label">To</div></div><input className="in in--sm" type="datetime-local" value=${activityQuery.to} onChange=${(e)=>setActivityQuery((prev)=>({ ...prev, to: String(e.target.value || "") }))} /></div>
                </div>
                <div className="row" style=${{ marginTop: "8px" }}>
                  <button className="btn btn--sm" onClick=${refreshActivity}>Apply Filters</button>
                  <button
                    className="btn btn--sm btn--ghost"
                    onClick=${() => {
                      const cleared = { q: "", action: "", actor: "", source: "", from: "", to: "" };
                      setActivityQuery(cleared);
                      void refreshActivity(cleared);
                    }}
                  >
                    Clear
                  </button>
                </div>
                <div style=${{ marginTop: "10px" }}>
                  ${activityLoading
                    ? html`<div className="muted">Loading activity...</div>`
                    : !activityRows.length
                    ? html`<div className="muted">No recent activity yet.</div>`
                    : html`
                        <div className="table-wrap">
                          <table>
                            <thead>
                              <tr>
                                <th>Time</th>
                                <th>Action</th>
                                <th>Actor</th>
                                <th>Source</th>
                                <th>Detail</th>
                                <th>Meta</th>
                              </tr>
                            </thead>
                            <tbody>
                              ${activityRows.map((row, idx) => html`
                                <tr key=${`${String(row?.ts || "")}:${idx}`}>
                                  <td>${formatActivityTime(row?.ts)}</td>
                                  <td><code>${String(row?.action || "")}</code></td>
                                  <td>${String(row?.actor || "")}</td>
                                  <td>${String(row?.source || "")}</td>
                                  <td title=${String(row?.detail || "")}>${String(row?.detail || "")}</td>
                                  <td><code>${JSON.stringify(row?.meta || {})}</code></td>
                                </tr>
                              `)}
                            </tbody>
                          </table>
                        </div>
                      `}
                </div>
              </div>
            </div>
          `
        : view === "settings"
        ? html`
            <div className="grid">
              <div className="panel">
                <h2>Core Settings</h2>
                <div className="fieldlist">
                  <div className="field">
                    <div className="field__meta">
                      <div className="field__label">Current Mode</div>
                      <div className="field__hint">Only valid modes are listed.</div>
                    </div>
                    <select className="in in--sm" value=${String(settings.currentMode || "")} onChange=${(e) => setField("currentMode", e.target.value)}>
                      ${modeOptions.map((opt) => html`<option key=${opt.value} value=${opt.value}>${opt.label}</option>`)}
                    </select>
                  </div>
                  <div className="field">
                    <div className="field__meta">
                      <div className="field__label">Link Allowlist</div>
                      <div className="field__hint">Comma-separated domains.</div>
                    </div>
                    <input className="in in--sm" value=${String(settings.linkAllowlistText || "")} onChange=${(e) => setField("linkAllowlistText", e.target.value)} placeholder="example.com, twitch.tv" />
                  </div>
                  <div className="field"><div className="field__meta"><div className="field__label">Kill Switch</div><div className="field__hint">Disable most bot actions.</div></div><${ToggleSwitch} checked=${settings.ks} onChange=${(e) => setField("ks", e.target.checked)} /></div>
                  <div className="field"><div className="field__meta"><div className="field__label">Timers</div><div className="field__hint">Periodic timer messages.</div></div><${ToggleSwitch} checked=${settings.timers} onChange=${(e) => setField("timers", e.target.checked)} /></div>
                  <div className="field"><div className="field__meta"><div className="field__label">Keywords</div><div className="field__hint">Keyword responses.</div></div><${ToggleSwitch} checked=${settings.keywords} onChange=${(e) => setField("keywords", e.target.checked)} /></div>
                  <div className="field"><div className="field__meta"><div className="field__label">Spam Filter</div><div className="field__hint">Burst protection.</div></div><${ToggleSwitch} checked=${settings.spamFilter} onChange=${(e) => setField("spamFilter", e.target.checked)} /></div>
                  <div className="field"><div className="field__meta"><div className="field__label">Length Filter</div><div className="field__hint">Long message protection.</div></div><${ToggleSwitch} checked=${settings.lengthFilter} onChange=${(e) => setField("lengthFilter", e.target.checked)} /></div>
                  <div className="field"><div className="field__meta"><div className="field__label">Link Filter</div><div className="field__hint">Block links unless allowlisted.</div></div><${ToggleSwitch} checked=${settings.linkFilter} onChange=${(e) => setField("linkFilter", e.target.checked)} /></div>
                </div>
              </div>

              <div className="grid grid--3">
                <div className="panel">
                  <h3>Chat Announcers</h3>
                  <div className="fieldlist">
                    <div className="field">
                      <div className="field__meta">
                        <div className="field__label">Enable Song Change Message</div>
                        <div className="field__hint">Announce the new track in chat whenever Spotify switches songs.</div>
                      </div>
                      <${ToggleSwitch} checked=${settings.spotifyAnnounceEnabled} onChange=${(e) => setField("spotifyAnnounceEnabled", e.target.checked)} />
                    </div>
                    <div className="field">
                      <div className="field__meta">
                        <div className="field__label">Announcement Template</div>
                        <div className="field__hint">Placeholders: <code>{"{streamerDisplay}"}</code>, <code>{"{song}"}</code>, <code>{"{artists}"}</code>, <code>{"{track}"}</code>, <code>{"{emote}"}</code>.</div>
                      </div>
                      <input className="in in--sm" value=${String(settings.spotifyAnnounceTemplate || "")} onChange=${(e) => setField("spotifyAnnounceTemplate", e.target.value)} placeholder="${DEFAULT_SPOTIFY_ANNOUNCE_TEMPLATE}" />
                    </div>
                    <div className="field">
                      <div className="field__meta">
                        <div className="field__label">Emote Text</div>
                        <div className="field__hint">Optional. Enter the emote text you want around the song title.</div>
                      </div>
                      <input className="in in--sm" value=${String(settings.spotifyAnnounceEmote || "")} onChange=${(e) => setField("spotifyAnnounceEmote", e.target.value)} placeholder="channelJam" />
                    </div>
                    <div className="field">
                      <div className="field__meta">
                        <div className="field__label">Enable Poll Created Message</div>
                        <div className="field__hint">Announce newly created polls in chat with the title, options, and extra-vote info.</div>
                      </div>
                      <${ToggleSwitch} checked=${settings.pollAnnounceEnabled} onChange=${(e) => setField("pollAnnounceEnabled", e.target.checked)} />
                    </div>
                    <div className="field">
                      <div className="field__meta">
                        <div className="field__label">Poll Announcement Template</div>
                        <div className="field__hint">Placeholders: <code>{"{title}"}</code>, <code>{"{options}"}</code>, <code>{"{extraVotes}"}</code>, <code>{"{channelPoints}"}</code>, <code>{"{cpCost}"}</code>, <code>{"{channelPointsName}"}</code>, <code>{"{streamerDisplay}"}</code>.</div>
                      </div>
                      <input className="in in--sm" value=${String(settings.pollAnnounceTemplate || "")} onChange=${(e) => setField("pollAnnounceTemplate", e.target.value)} placeholder="${DEFAULT_POLL_ANNOUNCE_TEMPLATE}" />
                    </div>
                    <div className="field">
                      <div className="field__meta">
                        <div className="field__label">Poll Channel Points Name</div>
                        <div className="field__hint">Used in the extra-votes text, for example sand, grass, or channel points.</div>
                      </div>
                      <input className="in in--sm" value=${String(settings.pollAnnounceChannelPointsName || "")} onChange=${(e) => setField("pollAnnounceChannelPointsName", e.target.value)} placeholder="channel points" />
                    </div>
                    <div className="field">
                      <div className="field__meta">
                        <div className="field__label">Poll Complete: No Extra Votes</div>
                        <div className="field__hint">Shown when channel-point extra votes were available but nobody used them. Placeholders: <code>{"{winning}"}</code>, <code>{"{title}"}</code>, <code>{"{channelPointsName}"}</code>.</div>
                      </div>
                      <input className="in in--sm" value=${String(settings.pollCompleteNoPointsTemplate || "")} onChange=${(e) => setField("pollCompleteNoPointsTemplate", e.target.value)} placeholder="${DEFAULT_POLL_COMPLETE_NO_POINTS_TEMPLATE}" />
                    </div>
                    <div className="field">
                      <div className="field__meta">
                        <div className="field__label">Poll Complete: Losing Top Spend</div>
                        <div className="field__hint">Shown when the biggest channel-point dump landed on a losing option. Placeholders: <code>{"{user}"}</code>, <code>{"{channelPoints}"}</code>, <code>{"{channelPointsName}"}</code>, <code>{"{farmTime}"}</code>, <code>{"{winning}"}</code>.</div>
                      </div>
                      <input className="in in--sm" value=${String(settings.pollCompleteLossTemplate || "")} onChange=${(e) => setField("pollCompleteLossTemplate", e.target.value)} placeholder="${DEFAULT_POLL_COMPLETE_LOSS_TEMPLATE}" />
                    </div>
                    <div className="field">
                      <div className="field__meta">
                        <div className="field__label">Poll Complete: Winning Top Spend</div>
                        <div className="field__hint">Shown when the biggest channel-point dump landed on the winning option. Placeholders: <code>{"{user}"}</code>, <code>{"{channelPoints}"}</code>, <code>{"{channelPointsName}"}</code>, <code>{"{winning}"}</code>.</div>
                      </div>
                      <input className="in in--sm" value=${String(settings.pollCompleteWinTemplate || "")} onChange=${(e) => setField("pollCompleteWinTemplate", e.target.value)} placeholder="${DEFAULT_POLL_COMPLETE_WIN_TEMPLATE}" />
                    </div>
                  </div>
                </div>
                <div className="panel">
                  <h3>Spam Filter</h3>
                  <div className="fieldlist">
                    <div className="field field--compact"><div className="field__meta"><div className="field__label">Window (ms)</div></div><input className="in in--sm" type="number" min="0" step="100" value=${settings.filters.spam.windowMs} onChange=${(e) => setFilterField("spam", "windowMs", e.target.value)} /></div>
                    <div className="field field--compact"><div className="field__meta"><div className="field__label">Min Messages</div></div><input className="in in--sm" type="number" min="0" step="1" value=${settings.filters.spam.minMessages} onChange=${(e) => setFilterField("spam", "minMessages", e.target.value)} /></div>
                    <div className="field field--compact"><div className="field__meta"><div className="field__label">Strike reset (ms)</div></div><input className="in in--sm" type="number" min="0" step="1000" value=${settings.filters.spam.strikeResetMs} onChange=${(e) => setFilterField("spam", "strikeResetMs", e.target.value)} /></div>
                    <div className="field field--compact"><div className="field__meta"><div className="field__label">Timeout first (sec)</div></div><input className="in in--sm" type="number" min="0" step="1" value=${settings.filters.spam.timeoutFirstSec} onChange=${(e) => setFilterField("spam", "timeoutFirstSec", e.target.value)} /></div>
                    <div className="field field--compact"><div className="field__meta"><div className="field__label">Timeout repeat (sec)</div></div><input className="in in--sm" type="number" min="0" step="1" value=${settings.filters.spam.timeoutRepeatSec} onChange=${(e) => setFilterField("spam", "timeoutRepeatSec", e.target.value)} /></div>
                    <div className="field field--compact"><div className="field__meta"><div className="field__label">Reason</div></div><input className="in in--sm" value=${settings.filters.spam.reason} onChange=${(e) => setFilterField("spam", "reason", e.target.value)} /></div>
                    <div className="field field--compact"><div className="field__meta"><div className="field__label">Message first</div></div><input className="in in--sm" value=${settings.filters.spam.messageFirst} onChange=${(e) => setFilterField("spam", "messageFirst", e.target.value)} /></div>
                    <div className="field field--compact"><div className="field__meta"><div className="field__label">Message repeat</div></div><input className="in in--sm" value=${settings.filters.spam.messageRepeat} onChange=${(e) => setFilterField("spam", "messageRepeat", e.target.value)} /></div>
                  </div>
                </div>
                <div className="panel">
                  <h3>Length Filter</h3>
                  <div className="fieldlist">
                    <div className="field field--compact"><div className="field__meta"><div className="field__label">Max chars</div></div><input className="in in--sm" type="number" min="0" step="1" value=${settings.filters.length.maxChars} onChange=${(e) => setFilterField("length", "maxChars", e.target.value)} /></div>
                    <div className="field field--compact"><div className="field__meta"><div className="field__label">Strike reset (ms)</div></div><input className="in in--sm" type="number" min="0" step="1000" value=${settings.filters.length.strikeResetMs} onChange=${(e) => setFilterField("length", "strikeResetMs", e.target.value)} /></div>
                    <div className="field field--compact"><div className="field__meta"><div className="field__label">Timeout first (sec)</div></div><input className="in in--sm" type="number" min="0" step="1" value=${settings.filters.length.timeoutFirstSec} onChange=${(e) => setFilterField("length", "timeoutFirstSec", e.target.value)} /></div>
                    <div className="field field--compact"><div className="field__meta"><div className="field__label">Timeout repeat (sec)</div></div><input className="in in--sm" type="number" min="0" step="1" value=${settings.filters.length.timeoutRepeatSec} onChange=${(e) => setFilterField("length", "timeoutRepeatSec", e.target.value)} /></div>
                    <div className="field field--compact"><div className="field__meta"><div className="field__label">Reason</div></div><input className="in in--sm" value=${settings.filters.length.reason} onChange=${(e) => setFilterField("length", "reason", e.target.value)} /></div>
                    <div className="field field--compact"><div className="field__meta"><div className="field__label">Message</div></div><input className="in in--sm" value=${settings.filters.length.message} onChange=${(e) => setFilterField("length", "message", e.target.value)} /></div>
                  </div>
                </div>
                <div className="panel">
                  <h3>Link Filter</h3>
                  <div className="fieldlist">
                    <div className="field field--compact"><div className="field__meta"><div className="field__label">Strike reset (ms)</div></div><input className="in in--sm" type="number" min="0" step="1000" value=${settings.filters.link.strikeResetMs} onChange=${(e) => setFilterField("link", "strikeResetMs", e.target.value)} /></div>
                    <div className="field field--compact"><div className="field__meta"><div className="field__label">Timeout first (sec)</div></div><input className="in in--sm" type="number" min="0" step="1" value=${settings.filters.link.timeoutFirstSec} onChange=${(e) => setFilterField("link", "timeoutFirstSec", e.target.value)} /></div>
                    <div className="field field--compact"><div className="field__meta"><div className="field__label">Timeout repeat (sec)</div></div><input className="in in--sm" type="number" min="0" step="1" value=${settings.filters.link.timeoutRepeatSec} onChange=${(e) => setFilterField("link", "timeoutRepeatSec", e.target.value)} /></div>
                    <div className="field field--compact"><div className="field__meta"><div className="field__label">Reason</div></div><input className="in in--sm" value=${settings.filters.link.reason} onChange=${(e) => setFilterField("link", "reason", e.target.value)} /></div>
                    <div className="field field--compact"><div className="field__meta"><div className="field__label">Message</div></div><input className="in in--sm" value=${settings.filters.link.message} onChange=${(e) => setFilterField("link", "message", e.target.value)} /></div>
                  </div>
                </div>
              </div>

              <div className="panel">
                <div className="panel__top">
                  <div>
                    <h2>Mode Manager</h2>
                    <div className="meta">Create/edit modes without touching JSON files. Titles support <code>{"{game}"}</code>.</div>
                  </div>
                  <button className="btn btn--sm btn--ghost" onClick=${addMode}>Add Mode</button>
                </div>
                <div className="table-wrap" style=${{ marginTop: "10px" }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Mode</th>
                        <th>Chat Command</th>
                        <th>Timer Message</th>
                        <th>Keyword Key</th>
                        <th>Game</th>
                        <th>Title</th>
                        <th>Recap Spam</th>
                        <th>Recap Message</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${modeRows.map((row) => {
                        const mode = row.mode;
                        const def = row.def || {};
                        return html`
                          <tr key=${mode}>
                            <td>
                              <input
                                className="in in--sm"
                                defaultValue=${mode}
                                onBlur=${(e) => renameModeCommand(mode, e.target.value)}
                                placeholder="!join.on"
                              />
                            </td>
                            <td><input className="in in--sm" value=${String(def.responseCommand || "")} onChange=${(e) => setModeField(mode, "responseCommand", e.target.value)} placeholder="!join" /></td>
                            <td><input className="in in--sm" value=${String(def.timerMessage || "")} onChange=${(e) => setModeField(mode, "timerMessage", e.target.value)} placeholder="type !join to join the game" /></td>
                            <td><input className="in in--sm" value=${String(def.keywordKey || "")} onChange=${(e) => setModeField(mode, "keywordKey", e.target.value)} placeholder="join" /></td>
                            <td><input className="in in--sm" value=${String(def.gameName || "")} onChange=${(e) => setModeField(mode, "gameName", e.target.value)} placeholder="Roblox" /></td>
                            <td><textarea className="textarea textarea--sm" value=${String(def.title || "")} onChange=${(e) => setModeField(mode, "title", e.target.value)} placeholder="Stream title..." /></td>
                            <td><input className="in in--sm" type="number" min="0" step="1" value=${String(def.recapSpamCount || 0)} onChange=${(e) => setModeField(mode, "recapSpamCount", e.target.value)} /></td>
                            <td><input className="in in--sm" value=${String(def.recapMessage || "")} onChange=${(e) => setModeField(mode, "recapMessage", e.target.value)} placeholder="REDDIT RECAP TIME: {url}" /></td>
                            <td>
                              <button className="btn btn--sm btn--danger" onClick=${() => removeMode(mode)} disabled=${modeRows.length <= 1}>Delete</button>
                            </td>
                          </tr>
                        `;
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="settings-actions">
                <button className="btn" onClick=${saveSettings} disabled=${!canEditSettings}>Save Settings</button>
                <button className="btn btn--ghost" onClick=${applyToTwitch} disabled=${!canEditSettings}>Apply to Twitch</button>
                <span className="statusline">${status}</span>
              </div>
              ${!canEditSettings ? html`<div className="meta">Role is ${adminRole}. Settings editing requires editor/owner.</div>` : null}
            </div>
          `
        : view === "commands"
        ? html`
            <div className="grid">
              <div className="panel">
                <div className="panel__top">
                  <div>
                    <h2>Custom Commands</h2>
                    <div className="meta">Manage custom commands and choose where they are enabled.</div>
                  </div>
                  <button className="btn btn--sm btn--ghost" onClick=${addCustomCommandRow}>Add Command</button>
                </div>
                <div className="table-wrap" style=${{ marginTop: "10px" }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Command</th>
                        <th>Response</th>
                        <th>Enabled</th>
                        <th>Twitch</th>
                        <th>Discord</th>
                        <th>Tw CD (ms)</th>
                        <th>Dc CD (ms)</th>
                        <th>Deleted</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${customCommandRows.map((row, idx) => {
                        const platforms = Array.isArray(row?.platforms) ? row.platforms : ["twitch", "discord"];
                        const deleted = Boolean(row?.deleted);
                        return html`
                          <tr key=${`${row?.command || "row"}:${idx}`}>
                            <td>
                              <input
                                className="in in--sm"
                                value=${String(row?.command || "")}
                                onChange=${(e) =>
                                  updateCustomCommandRow(idx, {
                                    command: String(e.target.value || "").trim().toLowerCase(),
                                  })}
                                placeholder="!command"
                                disabled=${!canEditCommands || deleted}
                              />
                            </td>
                            <td>
                              <input
                                className="in in--sm"
                                value=${String(row?.response || "")}
                                onChange=${(e) =>
                                  updateCustomCommandRow(idx, { response: String(e.target.value || "") })}
                                placeholder="Command response..."
                                disabled=${!canEditCommands || deleted}
                              />
                            </td>
                            <td>
                              <${ToggleSwitch}
                                checked=${row?.enabled !== false}
                                onChange=${(e) => updateCustomCommandRow(idx, { enabled: e.target.checked })}
                                disabled=${!canEditCommands || deleted}
                              />
                            </td>
                            <td>
                              <${ToggleSwitch}
                                checked=${platforms.includes("twitch")}
                                onChange=${(e) => {
                                  const next = new Set(platforms);
                                  if (e.target.checked) next.add("twitch");
                                  else next.delete("twitch");
                                  updateCustomCommandRow(idx, { platforms: Array.from(next) });
                                }}
                                disabled=${!canEditCommands || deleted}
                              />
                            </td>
                            <td>
                              <${ToggleSwitch}
                                checked=${platforms.includes("discord")}
                                onChange=${(e) => {
                                  const next = new Set(platforms);
                                  if (e.target.checked) next.add("discord");
                                  else next.delete("discord");
                                  updateCustomCommandRow(idx, { platforms: Array.from(next) });
                                }}
                                disabled=${!canEditCommands || deleted}
                              />
                            </td>
                            <td>
                              <input
                                className="in in--sm"
                                type="number"
                                min="0"
                                step="100"
                                value=${String(row?.cooldowns?.twitchMs || 0)}
                                onChange=${(e) =>
                                  updateCustomCommandRow(idx, {
                                    cooldowns: {
                                      ...(row?.cooldowns || {}),
                                      twitchMs: Math.max(0, Math.floor(Number(e.target.value) || 0)),
                                    },
                                  })}
                                disabled=${!canEditCommands || deleted}
                              />
                            </td>
                            <td>
                              <input
                                className="in in--sm"
                                type="number"
                                min="0"
                                step="100"
                                value=${String(row?.cooldowns?.discordMs || 0)}
                                onChange=${(e) =>
                                  updateCustomCommandRow(idx, {
                                    cooldowns: {
                                      ...(row?.cooldowns || {}),
                                      discordMs: Math.max(0, Math.floor(Number(e.target.value) || 0)),
                                    },
                                  })}
                                disabled=${!canEditCommands || deleted}
                              />
                            </td>
                            <td>${deleted ? "yes" : "no"}</td>
                            <td>
                              <div className="row">
                                <button
                                  className="btn btn--sm btn--danger"
                                  onClick=${() => removeCustomCommandRow(idx)}
                                  disabled=${!canEditCommands || deleted}
                                >
                                  Delete
                                </button>
                                <button
                                  className="btn btn--sm btn--ghost"
                                  onClick=${() => restoreCustomCommandRow(idx)}
                                  disabled=${!canEditCommands || !deleted}
                                >
                                  Restore
                                </button>
                              </div>
                            </td>
                          </tr>
                        `;
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="settings-actions">
                  <button className="btn" onClick=${saveCustomCommands} disabled=${!canEditCommands}>Save Custom Commands</button>
                  <button className="btn btn--ghost" onClick=${exportCustomCommands}>Export</button>
                  <button className="btn btn--ghost" onClick=${refreshAnalytics}>Refresh Analytics</button>
                  <button className="btn btn--ghost" onClick=${refreshHealth}>Refresh Health</button>
                  <span className="statusline">${status}</span>
                </div>
                <div className="fieldlist" style=${{ marginTop: "10px" }}>
                  <div className="field">
                    <div className="field__meta">
                      <div className="field__label">Import JSON</div>
                      <div className="field__hint">Paste exported rows JSON then click Import.</div>
                    </div>
                    <textarea
                      className="textarea textarea--sm"
                      value=${importText}
                      onChange=${(e) => setImportText(String(e.target.value || ""))}
                      placeholder='{"rows":[{"command":"!test","response":"ok","platforms":["twitch","discord"]}]}'
                    />
                    <div className="row" style=${{ marginTop: "8px" }}>
                      <button className="btn btn--sm btn--ghost" onClick=${importCustomCommandsFromText}>Import</button>
                    </div>
                  </div>
                </div>
                ${!canEditCommands ? html`<div className="meta">Role is ${adminRole}. Command editing requires editor/owner.</div>` : null}
              </div>
              <div className="grid grid--3">
                <div className="panel">
                  <h3>Command Simulator</h3>
                  <div className="fieldlist">
                    <div className="field field--compact"><div className="field__meta"><div className="field__label">Command</div></div><input className="in in--sm" value=${simCommand} onChange=${(e)=>setSimCommand(e.target.value)} placeholder="!command" /></div>
                    <div className="field field--compact"><div className="field__meta"><div className="field__label">Args</div></div><input className="in in--sm" value=${simArgs} onChange=${(e)=>setSimArgs(e.target.value)} placeholder="arg1 arg2" /></div>
                  </div>
                  <div className="row" style=${{ marginTop: "10px" }}>
                    <button className="btn btn--sm" onClick=${runCommandSimulation}>Run</button>
                  </div>
                  <div className="meta" style=${{ marginTop: "8px" }}><code>${simOutput || "(no output yet)"}</code></div>
                </div>
                <div className="panel">
                  <h3>Top Commands</h3>
                  <div className="row">
                    <select className="in in--sm" value=${String(analyticsDays)} onChange=${(e)=>setAnalyticsDays(Number(e.target.value)||7)}>
                      <option value="1">24h</option>
                      <option value="7">7d</option>
                      <option value="30">30d</option>
                    </select>
                    <select className="in in--sm" value=${analyticsPlatform} onChange=${(e)=>setAnalyticsPlatform(String(e.target.value||"all"))}>
                      <option value="all">All</option>
                      <option value="twitch">Twitch</option>
                      <option value="discord">Discord</option>
                    </select>
                    <button className="btn btn--sm btn--ghost" onClick=${refreshAnalytics}>Load</button>
                  </div>
                  <div className="table-wrap" style=${{ marginTop: "8px" }}>
                    <table>
                      <thead><tr><th>Command</th><th>Uses</th></tr></thead>
                      <tbody>
                        ${analyticsRows.map((row, idx) => html`<tr key=${`a:${idx}`}><td><code>${String(row?.command || "")}</code></td><td>${Number(row?.uses || 0)}</td></tr>`)}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div className="panel">
                  <h3>Health</h3>
                  <div className="meta">Overall: <strong>${health?.ok ? "OK" : "Issues"}</strong></div>
                  <div className="table-wrap" style=${{ marginTop: "8px" }}>
                    <table>
                      <thead><tr><th>Check</th><th>Status</th><th>Detail</th></tr></thead>
                      <tbody>
                        ${Object.entries(health?.checks || {}).map(([k, v]) => html`<tr key=${k}><td>${k}</td><td>${v?.ok ? "ok" : "fail"}</td><td>${String(v?.detail || "")}</td></tr>`)}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          `
        : view === "points"
        ? html`
            <div className="grid">
              ${!canViewPointsDashboard
                ? html`
                    <div className="panel">
                      <h2>Channel Points Dashboard</h2>
                      <div className="meta">Owner-only section.</div>
                    </div>
                  `
                : null}
              ${canViewPointsDashboard
                ? html`
              <div className="panel">
                <div className="panel__top">
                  <div>
                    <h2>Channel Points Dashboard</h2>
                    <div className="meta">Owner-only analytics from poll/prediction/reward spend events.</div>
                  </div>
                  <div className="row">
                    <select
                      className="in in--sm"
                      value=${String(pointsDays)}
                      onChange=${(e) => setPointsDays(Number(e.target.value) || 30)}
                    >
                      <option value="7">7 days</option>
                      <option value="30">30 days</option>
                      <option value="90">90 days</option>
                      <option value="180">180 days</option>
                    </select>
                    <button className="btn btn--sm btn--ghost" onClick=${() => loadChannelPoints({ days: pointsDays, limitUsers: 300 })}>
                      Refresh
                    </button>
                  </div>
                </div>
                <div className="meta" style=${{ marginTop: "8px" }}>
                  Users: ${Number(pointsData?.userCount || 0)} | Window: ${Number(pointsData?.days || pointsDays)} days
                </div>
                <div className="table-wrap" style=${{ marginTop: "10px" }}>
                  <table>
                    <thead>
                      <tr>
                        <th>User</th>
                        <th>Spent</th>
                        <th>Lost</th>
                        <th>Events</th>
                        <th>Tier</th>
                        <th>Est. Farm</th>
                        <th>Last Seen</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${pointsLoading
                        ? html`<tr><td colSpan="7">Loading channel points...</td></tr>`
                        : !(Array.isArray(pointsData?.users) && pointsData.users.length)
                        ? html`<tr><td colSpan="7">No data yet.</td></tr>`
                        : pointsData.users.map((row, idx) => html`
                            <tr key=${`cp:${idx}:${String(row?.userId || row?.login || "")}`}>
                              <td>${String(row?.displayName || row?.login || row?.userId || "unknown")}</td>
                              <td>${Number(row?.pointsSpent || 0).toLocaleString()}</td>
                              <td>${Number(row?.pointsLost || 0).toLocaleString()}</td>
                              <td>${Number(row?.events || 0)}</td>
                              <td>${row?.subTier ? String(row.subTier) : "-"}</td>
                              <td>${formatFarmHours(row?.estimatedFarmMinutes || 0)}</td>
                              <td>${formatActivityTime(row?.lastSeenTs)}</td>
                            </tr>
                          `)}
                    </tbody>
                  </table>
                </div>
              </div>
                  `
                : null}
            </div>
          `
        : html`
            <div className="grid">
              <div className="panel">
                <h2>Keyword Manager</h2>
                <div className="meta">Edit keyword categories as JSON: <code>{ "category": ["phrase"] }</code></div>
                <div className="meta" style=${{ marginTop: "6px" }}>
                  Categories: ${Object.keys(keywords || {}).length}
                </div>
                <textarea
                  className="textarea"
                  style=${{ minHeight: "420px", marginTop: "10px" }}
                  value=${keywordsText}
                  onChange=${(e) => setKeywordsText(e.target.value)}
                />
                <input
                  ref=${keywordImportFileRef}
                  type="file"
                  accept="application/json,.json"
                  style=${{ display: "none" }}
                  onChange=${importKeywordsFromFile}
                />
                <div className="settings-actions">
                  <button className="btn btn--ghost" onClick=${() => keywordImportFileRef.current?.click?.()}>
                    Import JSON File
                  </button>
                  <button className="btn" onClick=${saveKeywords}>Save Keywords</button>
                  <span className="statusline">${status}</span>
                </div>
              </div>
            </div>
          `}
    </div>
  `;
  } catch (error) {
    console.error("[admin] render failed:", error);
    return renderFatalPanel(error, "Admin dashboard");
  }
}

initThemeToggle();
initTopbarSession();
initStreamerTheme();

const rootEl = document.getElementById("adminRoot");
if (rootEl) {
  window.addEventListener("error", (event) => {
    if (!event?.error) return;
    console.error("[admin] window error:", event.error);
    renderBootFatal(rootEl, event.error, "Admin runtime");
  });
  window.addEventListener("unhandledrejection", (event) => {
    const reason = event?.reason || new Error("Unhandled promise rejection");
    console.error("[admin] unhandled rejection:", reason);
    renderBootFatal(rootEl, reason, "Admin runtime");
  });
  try {
    createRoot(rootEl).render(html`<${AdminErrorBoundary}><${App} /></${AdminErrorBoundary}>`);
  } catch (error) {
    console.error("[admin] boot failed:", error);
    renderBootFatal(rootEl, error, "Admin boot");
  }
}
