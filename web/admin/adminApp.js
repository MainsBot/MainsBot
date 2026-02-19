import React, { useEffect, useMemo, useState } from "https://esm.sh/react@18.3.1";
import { createRoot } from "https://esm.sh/react-dom@18.3.1/client";
import htm from "https://esm.sh/htm@3.1.1";

const html = htm.bind(React.createElement);

const MODE_TO_TWITCH = {
  "!join.on": { titleKey: "join", gameName: "Roblox" },
  "!link.on": { titleKey: "link", gameName: "Roblox" },
  "!1v1.on": { titleKey: "1v1", gameName: "Roblox" },
  "!ticket.on": { titleKey: "ticket", gameName: "Roblox" },
  "!val.on": { titleKey: "val", gameName: "VALORANT" },
  "!reddit.on": { titleKey: "reddit", gameName: "Just Chatting" },
};

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

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => {
    if (ch === "&") return "&amp;";
    if (ch === "<") return "&lt;";
    if (ch === ">") return "&gt;";
    if (ch === '"') return "&quot;";
    return "&#39;";
  });
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
  src.validModes = asArray(src.validModes);
  if (!src.validModes.length) src.validModes = Object.keys(MODE_TO_TWITCH);

  src.linkAllowlist = asArray(src.linkAllowlist);
  src.linkAllowlistText = String(src.linkAllowlistText || toCsv(src.linkAllowlist));
  src.titles = asStringMap(src.titles);
  src.modeGames = asStringMap(src.modeGames);

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

function ToggleSwitch({ checked, onChange }) {
  return html`
    <label className="switch">
      <input type="checkbox" checked=${Boolean(checked)} onChange=${onChange} />
      <span className="switch__track"></span>
      <span className="switch__label">${checked ? "ON" : "OFF"}</span>
    </label>
  `;
}

function App() {
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("home");
  const [status, setStatus] = useState("");
  const [settings, setSettings] = useState(null);
  const [runtime, setRuntime] = useState(null);
  const [auth, setAuth] = useState(null);
  const [session, setSession] = useState(null);

  useEffect(() => {
    const desired = String(window.location.hash || "").replace(/^#/, "").toLowerCase();
    setView(desired === "settings" ? "settings" : "home");
    const onHashChange = () => {
      const next = String(window.location.hash || "").replace(/^#/, "").toLowerCase();
      setView(next === "settings" ? "settings" : "home");
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [settingsRes, statusRes, authRes, sessionRes] = await Promise.all([
          fetch("/api/admin/settings", { credentials: "same-origin", cache: "no-store" }),
          fetch("/api/status", { credentials: "same-origin", cache: "no-store" }),
          fetch("/api/auth/status", { credentials: "same-origin", cache: "no-store" }),
          fetch("/api/admin/session", { credentials: "same-origin", cache: "no-store" }),
        ]);
        const settingsPayload = await settingsRes.json().catch(() => null);
        if (!settingsRes.ok) {
          throw new Error(settingsPayload?.error || `${settingsRes.status} ${settingsRes.statusText}`);
        }
        setSettings(normalizeSettings(settingsPayload?.settings || {}));
        setRuntime(statusRes.ok ? await statusRes.json().catch(() => null) : null);
        setAuth(authRes.ok ? await authRes.json().catch(() => null) : null);
        setSession(sessionRes.ok ? await sessionRes.json().catch(() => null) : null);
      } catch (e) {
        setStatus(`Error: ${String(e?.message || e)}`);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

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

  const setTitle = (titleKey, value) =>
    setSettings((prev) => {
      const base = normalizeSettings(prev || {});
      return normalizeSettings({
        ...base,
        titles: {
          ...base.titles,
          [titleKey]: value,
        },
      });
    });

  const setModeGame = (mode, value) =>
    setSettings((prev) => {
      const base = normalizeSettings(prev || {});
      return normalizeSettings({
        ...base,
        modeGames: {
          ...base.modeGames,
          [mode]: value,
        },
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

  const titleRows = useMemo(() => {
    if (!settings) return { rows: [], extras: [] };
    const rows = [];
    const usedKeys = new Set();
    for (const [mode, cfg] of Object.entries(MODE_TO_TWITCH)) {
      const titleKey = String(cfg?.titleKey || "").trim();
      if (!titleKey) continue;
      usedKeys.add(titleKey);
      rows.push({
        mode,
        titleKey,
        gameDefault: String(cfg?.gameName || "").trim(),
        gameValue: String(settings.modeGames?.[mode] || cfg?.gameName || "").trim(),
        titleValue: String(settings.titles?.[titleKey] || ""),
      });
    }
    const extras = Object.keys(settings.titles || {})
      .filter((k) => !usedKeys.has(k))
      .sort((a, b) => a.localeCompare(b));
    return { rows, extras };
  }, [settings]);

  async function saveSettings() {
    if (!settings) return;
    setStatus("Saving...");
    try {
      const normalized = normalizeSettings(settings);
      const cleanTitles = {};
      for (const [k, v] of Object.entries(normalized.titles || {})) {
        const key = String(k || "").trim();
        const val = String(v || "").trim();
        if (key && val) cleanTitles[key] = val;
      }
      const cleanModeGames = {};
      for (const [k, v] of Object.entries(normalized.modeGames || {})) {
        const key = String(k || "").trim();
        const val = String(v || "").trim();
        if (key && val) cleanModeGames[key] = val;
      }

      const payload = {
        settings: {
          ...normalized,
          linkAllowlist: fromCsv(normalized.linkAllowlistText),
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
          titles: normalized.titles || {},
          modeGames: normalized.modeGames || {},
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(body?.error || `${res.status} ${res.statusText}`);
      }
      setStatus("Applied to Twitch.");
    } catch (e) {
      setStatus(`Error: ${String(e?.message || e)}`);
    }
  }

  async function saveAndApplyMode() {
    await saveSettings();
    await applyToTwitch();
  }

  if (loading) {
    return html`<div className="muted">Loading dashboard...</div>`;
  }

  if (!settings) {
    return html`<div className="muted">Failed to load settings.</div>`;
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

  const twitchBotConnected = isOAuthConnected(auth?.bot);
  const twitchStreamerConnected = isOAuthConnected(auth?.streamer);
  const spotifyConnected = Boolean(
    auth?.spotify?.hasRefreshToken || auth?.spotify?.hasAccessToken
  );
  const robloxConnected = isOAuthConnected(auth?.roblox?.bot);

  return html`
    <div className="grid">
      <div className="panel">
        <div className="panel__top">
          <div>
            <div className="pill">Dashboard</div>
            <h1 style=${{ marginTop: "10px" }}>Admin</h1>
            <div className="muted" style=${{ marginTop: "6px" }}>Manage settings, filters, and OAuth links.</div>
          </div>
          <div className="row">
            ${canManageAuth ? html`<a className="btn btn--sm btn--ghost" href="/admin/auth">Auth</a>` : null}
            <a className="btn btn--sm btn--ghost" href="/admin/redemptions">Redemptions</a>
            <a className="btn btn--sm btn--ghost" href="/api/status" target="_blank" rel="noreferrer">Status JSON</a>
          </div>
        </div>
        <div className="row" style=${{ marginTop: "12px" }}>
          <button className=${view === "home" ? "btn btn--sm" : "btn btn--sm btn--ghost"} onClick=${() => (window.location.hash = "home")}>Overview</button>
          <button className=${view === "settings" ? "btn btn--sm" : "btn btn--sm btn--ghost"} onClick=${() => (window.location.hash = "settings")}>Settings</button>
        </div>
      </div>

      ${view === "home"
        ? html`
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
                  <button className="btn btn--sm" onClick=${saveSettings}>Save Quick Changes</button>
                  <button className="btn btn--sm btn--ghost" onClick=${saveAndApplyMode}>Save + Apply Mode</button>
                </div>
                <div className="meta">${status || "Use quick controls, then save."}</div>
              </div>
              <div className="panel">
                <h2>Twitch OAuth</h2>
                <div className="row" style=${{ justifyContent: "space-between", marginTop: "8px" }}><span className="k">Bot</span><span className=${twitchBotConnected ? "ok" : "warn"}>${twitchBotConnected ? "Connected" : "Not Connected"}</span></div>
                <div className="row" style=${{ justifyContent: "space-between" }}><span className="k">Streamer</span><span className=${twitchStreamerConnected ? "ok" : "warn"}>${twitchStreamerConnected ? "Connected" : "Not Connected"}</span></div>
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
                <div className="row" style=${{ marginTop: "10px" }}>
                  ${canLinkOtherOauth ? html`<a className="btn btn--sm" href="/auth/spotify">Link Spotify</a>` : null}
                  ${canLinkOtherOauth ? html`<a className="btn btn--sm" href="/auth/roblox">Link Roblox</a>` : null}
                </div>
                ${!canLinkOtherOauth
                  ? html`<div className="meta">Spotify/Roblox linking: owner or streamer account only.</div>`
                  : null}
              </div>
            </div>
          `
        : html`
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
                <h2>Twitch Titles</h2>
                <div className="meta">Edit title and game per mode. Use Apply to Twitch for immediate update.</div>
                <div className="table-wrap" style=${{ marginTop: "10px" }}>
                  <table>
                    <thead><tr><th>Mode</th><th>Title Key</th><th>Game</th><th>Title</th></tr></thead>
                    <tbody>
                      ${titleRows.rows.map((row) => html`
                        <tr key=${row.mode}>
                          <td><code>${row.mode}</code></td>
                          <td><code>${row.titleKey}</code></td>
                          <td><input className="in in--sm" value=${row.gameValue} onChange=${(e) => setModeGame(row.mode, e.target.value)} placeholder=${row.gameDefault} /></td>
                          <td><textarea className="textarea textarea--sm" value=${row.titleValue} onChange=${(e) => setTitle(row.titleKey, e.target.value)} placeholder="Stream title..." /></td>
                        </tr>
                      `)}
                      ${titleRows.extras.map((titleKey) => html`
                        <tr key=${`extra:${titleKey}`}>
                          <td className="muted">-</td>
                          <td><code>${titleKey}</code></td>
                          <td className="muted">-</td>
                          <td><textarea className="textarea textarea--sm" value=${String(settings.titles?.[titleKey] || "")} onChange=${(e) => setTitle(titleKey, e.target.value)} placeholder="Stream title..." /></td>
                        </tr>
                      `)}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="settings-actions">
                <button className="btn" onClick=${saveSettings}>Save Settings</button>
                <button className="btn btn--ghost" onClick=${applyToTwitch}>Apply to Twitch</button>
                <span className="statusline">${status}</span>
              </div>
            </div>
          `}
    </div>
  `;
}

initTopbarSession();

const rootEl = document.getElementById("adminRoot");
if (rootEl) {
  createRoot(rootEl).render(html`<${App} />`);
}
