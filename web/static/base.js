// web/base.js (BROWSER ONLY)
import { applyStreamerThemeFromStatus } from "/static/theme.js";

const $ = (id) => document.getElementById(id);

/* =========================
   ELEMENTS
   ========================= */

const els = {
  search: $("search"),
  category: $("category"),
  root: $("commandsRoot"),

  pill: $("statusPill"),
  uptime: $("uptime"),
  ks: $("twitchConn"),
  timers: $("timers"),
  mode: $("mode"),
  keywords: $("keywords"),
  lastErr: $("lastErr"),
  liveDot: $("liveDot"),
  liveText: $("liveText"),
  leftTwitch: $("leftTwitch"),
  leftRoblox: $("leftRoblox"),
  leftSpotify: $("leftSpotify"),
  footer: $("footerText"),

  themeToggle: $("themeToggle"),
  showModOnly: $("showModOnly"),
};

// Helpful debug
const missing = Object.entries(els)
  .filter(([, v]) => !v)
  .map(([k]) => k);

if (missing.length) {
  console.warn("[WEB] Missing DOM elements:", missing);
}

/* =========================
   STATE
   ========================= */

let COMMANDS = [];
let CATEGORIES = [];
let LAST_STATUS = null;
let uptimeTimer = null;

/* =========================
   HELPERS
   ========================= */

function norm(s) {
  return String(s || "").toLowerCase();
}

function fmtUptime(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return `${h}h ${m}m ${ss}s`;
}

function hasExplicitBotField(status = {}) {
  if (!status || typeof status !== "object") return false;
  return (
    Number.isFinite(Number(status.startedAt)) ||
    typeof status.ks === "boolean" ||
    typeof status.timers === "boolean" ||
    typeof status.keywords === "boolean" ||
    typeof status.online === "boolean" ||
    Boolean(String(status.currentMode || "").trim()) ||
    Boolean(String(status.lastError || "").trim())
  );
}

function pad2(value) {
  return String(Math.max(0, Number(value) || 0)).padStart(2, "0");
}

function formatCommitDate(value) {
  const ts = Date.parse(String(value || ""));
  if (!Number.isFinite(ts)) return "";
  const d = new Date(ts);
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()] || "";
  const month = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getMonth()] || "";
  const offsetMinutes = -d.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const offsetAbs = Math.abs(offsetMinutes);
  const offsetHours = pad2(Math.floor(offsetAbs / 60));
  const offsetMins = pad2(offsetAbs % 60);
  return `${weekday} ${month} ${d.getDate()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())} ${d.getFullYear()} ${sign}${offsetHours}${offsetMins}`;
}

function formatBuildFooter(build) {
  if (!build || typeof build !== "object") return "MainsBot";
  const versionLabel = `${String(build.version || "dev")}${build.dirty ? " DEV" : ""}`;
  const branch = String(build.branch || "unknown").trim() || "unknown";
  const commit = String(build.commit || "unknown").trim().slice(0, 8) || "unknown";
  const commitCount = Number.isFinite(Number(build.commitCount))
    ? `, commit ${Math.max(0, Math.floor(Number(build.commitCount)))}`
    : "";
  const commitDate = formatCommitDate(build.commitDate);
  return `Version: ${versionLabel} (${branch}, ${commit}${commitCount})${commitDate ? ` — Last commit: ${commitDate}` : ""}`;
}

function fmtDuration(ms) {
  const totalSec = Math.max(0, Math.round((Number(ms) || 0) / 1000));
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  if (mins > 0 && secs > 0) return `${mins}m ${secs}s`;
  if (mins > 0) return `${mins}m`;
  return `${secs}s`;
}

function buildCommandCooldownLabel(cooldownKey) {
  if (typeof cooldownKey === "number" || /^\d+$/.test(String(cooldownKey || "").trim())) {
    const ms = Math.max(0, Number(cooldownKey) || 0);
    if (ms <= 0) return "";
    return `Cooldown: ${fmtDuration(ms)} per user`;
  }
  const key = String(cooldownKey || "")
    .toLowerCase()
    .replace(/\s+/g, "");
  if (!key) return "";

  const cooldowns = LAST_STATUS?.cooldowns || {};
  const globalMs = Number(cooldowns.commandGlobalMs);
  const userMs = Number(cooldowns.commandUserMs);
  const gamesMs = Number(cooldowns.gamesPlayedChatMs);
  const friendMs = Number(cooldowns.friendCommandMs);
  const activeGlobalMs = Number(cooldowns.activeCommandGlobalRemainingMs);
  const activeGamesMs = Number(cooldowns.activeGamesPlayedRemainingMs);
  const activeFriendMs = Number(cooldowns.activeFriendRemainingMs);

  const sharedLabel =
    Number.isFinite(globalMs) && Number.isFinite(userMs)
      ? `${fmtDuration(globalMs)} global / ${fmtDuration(userMs)} user`
      : "10s global / 30s user";
  const gamesLabel = Number.isFinite(gamesMs) ? fmtDuration(gamesMs) : "15s";
  const friendLabel = Number.isFinite(friendMs) ? fmtDuration(friendMs) : "30s";

  const sharedActive =
    activeGlobalMs > 0 ? ` (active ${fmtDuration(activeGlobalMs)} left)` : "";
  const gamesActive =
    activeGamesMs > 0 ? ` (active ${fmtDuration(activeGamesMs)} left)` : "";
  const friendActive =
    activeFriendMs > 0 ? ` (active ${fmtDuration(activeFriendMs)} left)` : "";

  if (key === "shared") return `Cooldown: ${sharedLabel}${sharedActive}`;
  if (key === "shared+games" || key === "sharedgames") {
    return `Cooldown: ${sharedLabel}; games list ${gamesLabel}${gamesActive}`;
  }
  if (key === "friend") return `Cooldown: ${friendLabel}${friendActive}`;

  return "";
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (m) =>
    ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[m])
  );
}

const setText = (el, v) => {
  if (el) el.textContent = v;
};

const setClass = (el, v) => {
  if (el) el.className = v;
};

const NO_ERROR_EMOTE_URL =
  "https://cdn.betterttv.net/emote/5e74e336d6581c3724c0d49d/3x.webp";

function getThemeToggleMarkup() {
  return `<button class="btn btn--sm btn--ghost theme-toggle" id="themeToggle" type="button">Light</button>`;
}

function setLastErrorDisplay(lastError) {
  if (!els.lastErr) return;

  const message = String(lastError || "").trim();
  if (message) {
    setText(els.lastErr, message);
    return;
  }

  els.lastErr.innerHTML = `- <img class="status__ok-emote" src="${NO_ERROR_EMOTE_URL}" alt="No errors" loading="lazy" decoding="async">`;
}

/* =========================
   SESSION (TOPBAR)
   ========================= */

function renderTopbarSession(session) {
  const right = document.querySelector(".topbar__right");
  const adminLinkSlot = document.getElementById("topbarAdminLink");
  if (!right) return;

  const allowed = !!session?.allowed;
  const login = String(session?.login || "").trim();

  if (allowed && login) {
    if (adminLinkSlot) {
      adminLinkSlot.innerHTML = `<a class="btn btn--sm btn--ghost" href="/admin">Admin</a>`;
    }
    right.innerHTML = `
      <div class="row" style="justify-content:flex-end">
        ${getThemeToggleMarkup()}
        <a class="btn btn--sm btn--ghost" href="/swagger">Swagger</a>
        <span class="muted" style="font-size:13px">Logged in as</span>
        <strong>${escapeHtml(login)}</strong>
        <a class="btn btn--sm btn--danger" href="/admin/logout">Logout</a>
      </div>
    `;
    initThemeToggle();
    return;
  }

  if (adminLinkSlot) adminLinkSlot.innerHTML = "";
  right.innerHTML = `
    <div class="row" style="justify-content:flex-end">
      ${getThemeToggleMarkup()}
      <a class="btn btn--sm btn--ghost" href="/swagger">Swagger</a>
      <a class="btn btn--sm" href="/admin/login">Login</a>
    </div>
  `;
  initThemeToggle();
}

async function initTopbarSession() {
  try {
    const res = await fetch("/api/admin/session", { cache: "no-store" });
    const data = await res.json().catch(() => null);
    renderTopbarSession(data);
  } catch {
    renderTopbarSession({ allowed: false });
  }
}

/* =========================
   THEME
   ========================= */

function initThemeToggle() {
  els.themeToggle = $("themeToggle");
  if (!els.themeToggle) return;

  const setThemeLabel = () => {
    const isLight = document.documentElement.dataset.theme === "light";
    els.themeToggle.textContent = isLight ? "Dark" : "Light";
  };

  const saved = localStorage.getItem("theme");
  document.documentElement.dataset.theme = saved === "light" ? "light" : "dark";
  setThemeLabel();

  els.themeToggle.addEventListener("click", () => {
    const isLight = document.documentElement.dataset.theme === "light";
    document.documentElement.dataset.theme = isLight ? "dark" : "light";
    localStorage.setItem("theme", isLight ? "dark" : "light");
    setThemeLabel();
    render();
  });
}

/* =========================
   COMMANDS
   ========================= */

async function loadCommands() {
  const res = await fetch("/api/commands?platform=all", { cache: "no-store" });
  if (!res.ok) throw new Error(`/api/commands http ${res.status}`);

  const data = await res.json();

  COMMANDS = [];
  CATEGORIES = [];

  for (const cat of data.categories || []) {
    const catName = cat.name || "Commands";
    if (!CATEGORIES.includes(catName)) CATEGORIES.push(catName);

    for (const c of cat.commands || []) {
      COMMANDS.push({
        category: catName,
        cmd: c.cmd || "",
        desc: c.desc || "",
        modOnly: !!c.modOnly,
        cooldown: c.cooldown || "",
        source: c.source || "default",
        platforms: Array.isArray(c.platforms) ? c.platforms : ["twitch"],
      });
    }
  }

  if (!els.category) return;

  els.category.innerHTML = `<option value="all">All categories</option>`;

  for (const name of CATEGORIES) {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    els.category.appendChild(opt);
  }
}

function render() {
  if (!els.root) return;

  const q = norm(els.search?.value || "");
  const cat = els.category?.value || "all";
  const modOnly = !!els.showModOnly?.checked;

  const filtered = COMMANDS.filter((c) => {
    if (modOnly && !c.modOnly) return false;
    if (cat !== "all" && c.category !== cat) return false;
    if (!q) return true;

    return norm(c.cmd).includes(q) || norm(c.desc).includes(q);
  });

  if (!filtered.length) {
    els.root.innerHTML = `<div class="empty">No commands found</div>`;
    return;
  }

  // Group by category so your .commands__section styles can be used
  const grouped = new Map();
  for (const c of filtered) {
    if (!grouped.has(c.category)) grouped.set(c.category, []);
    grouped.get(c.category).push(c);
  }

  let html = "";

  for (const [categoryName, cmds] of grouped.entries()) {
    html += `
      <section class="commands__section">
        <h2 class="commands__title">${escapeHtml(categoryName)}</h2>
        ${cmds
          .map((c) => {
            const modClass = c.modOnly ? "mod-only" : "";
            const cooldownText = buildCommandCooldownLabel(c.cooldown);
            return `
              <div class="cmdcard ${modClass}">
                <div class="cmdcard__left">
                  <div class="cmdcard__cmd">${escapeHtml(c.cmd)}</div>
                  <div class="cmdcard__desc">${escapeHtml(c.desc)}</div>
                  ${cooldownText ? `<div class="cmdcard__cooldown">${escapeHtml(cooldownText)}</div>` : ``}
                  ${c.modOnly ? `<div class="cmdcard__modline">mod only</div>` : ``}
                  <div class="cmdcard__cooldown">Platforms: ${escapeHtml((c.platforms || []).join(", ") || "twitch")}</div>
                </div>
                <div class="cmdcard__right">
                  ${c.source === "custom" ? `<span class="badge">CUSTOM</span>` : ``}
                  ${c.modOnly ? `<span class="badge">MOD</span>` : ``}
                </div>
              </div>
            `;
          })
          .join("")}
      </section>
    `;
  }

  els.root.innerHTML = html;
}


/* =========================
   STATUS
   ========================= */

async function refreshStatus() {
  if (!els.pill || !els.lastErr) return;

  try {
    const r = await fetch("/api/status", { cache: "no-store" });
    if (!r.ok) throw new Error(`status http ${r.status}`);

    const s = await r.json();
    applyStreamerThemeFromStatus(s);

    const hasBotRuntime = hasExplicitBotField(s) && s.statusSource !== "web";
    const online =
      hasBotRuntime && typeof s.online === "boolean" ? s.online : true;
    const pillText = hasBotRuntime ? (online ? "ONLINE" : "OFFLINE") : "READY";

    setClass(
      els.pill,
      `status__pill ${
        pillText === "OFFLINE" ? "status__pill--bad" : "status__pill--ok"
      }`
    );
    setText(els.pill, pillText);

    LAST_STATUS = s;

    const channelLabel = String(
      s.channelDisplayName || s.channelNameDisplay || s.channel || s.channelName || ""
    ).trim();
    if (channelLabel) {
      document.title = `MainsBot - ${channelLabel}`;
    }

    if (els.footer) {
      const build = s.build && typeof s.build === "object" ? s.build : null;
      setText(els.footer, formatBuildFooter(build));
    }
    setText(
      els.uptime,
      s.startedAt ? fmtUptime(Date.now() - s.startedAt) : "-"
    );

    if (!uptimeTimer) {
      uptimeTimer = setInterval(() => {
        if (LAST_STATUS?.startedAt) {
          setText(
            els.uptime,
            fmtUptime(Date.now() - LAST_STATUS.startedAt)
          );
        }
      }, 1000);
    }

    const ksKnown = typeof s.ks === "boolean";
    const ksOn = ksKnown ? !!s.ks : null;
    const timersKnown =
      typeof s.timers === "boolean" ||
      Array.isArray(s.timers) ||
      (s.timers && typeof s.timers === "object");
    const timersOn =
      typeof s.timers === "boolean"
        ? s.timers
        : Array.isArray(s.timers)
        ? s.timers.length > 0
        : Object.keys(s.timers || {}).length > 0;

    const keywordsKnown =
      typeof s.keywords === "boolean" ||
      Array.isArray(s.keywords) ||
      (s.keywords && typeof s.keywords === "object");
    const keywordsOn =
      typeof s.keywords === "boolean"
        ? s.keywords
        : Array.isArray(s.keywords)
        ? s.keywords.length > 0
        : Object.keys(s.keywords || {}).length > 0;

    const modeRaw = s.currentMode || "";
    const modePretty = modeRaw
      ? modeRaw.replace(/^!/, "").replace(/\.on$|\.off$/i, "")
      : "-";
    const modeLabel =
      modePretty && modePretty !== "-"
        ? modePretty.charAt(0).toUpperCase() + modePretty.slice(1)
        : "-";

    setText(els.ks, ksKnown ? (ksOn ? "ON" : "OFF") : "-");
    setText(els.timers, timersKnown ? (timersOn ? "ON" : "OFF") : "-");
    setText(els.keywords, keywordsKnown ? (keywordsOn ? "ON" : "OFF") : "-");
    setText(els.mode, modeLabel);

    setLastErrorDisplay(s.lastError);

    const twitchLiveText =
      s.twitchLive === true ? "LIVE" : s.twitchLive === false ? "OFFLINE" : "-";
    let twitchLeftText = twitchLiveText;
    if (s.twitchLive === true && s.twitchUptime) {
      twitchLeftText = `LIVE • ${s.twitchUptime}`;
    }
    setText(els.liveText, twitchLiveText);
    if (els.liveDot) {
      els.liveDot.className = `live-dot ${
        s.twitchLive === true
          ? "live-dot--on"
          : s.twitchLive === false
          ? "live-dot--off"
          : ""
      }`;
    }
    setText(els.leftTwitch, twitchLeftText);

    let robloxText = "-";
    if (s.roblox) {
      if (s.roblox.game && s.roblox.game !== "Website") {
        robloxText = s.roblox.game;
      } else if (s.roblox.presenceType === 0) {
        robloxText = "Offline";
      } else if (s.roblox.game === "Website") {
        robloxText = "In Menus";
      }
    }
    setText(els.leftRoblox, robloxText);

    let spotifyText = "Not playing";
    if (s.spotify?.playing && s.spotify?.name) {
      spotifyText = `${s.spotify.name} - ${s.spotify.artists || ""}`.trim();
    }
    setText(els.leftSpotify, spotifyText);

    // Cooldown text in command cards depends on latest /status values.
    render();
  } catch (e) {
    setClass(els.pill, "status__pill status__pill--bad");
    setText(els.pill, "UNREACHABLE");
    setText(els.lastErr, String(e?.message || e));
    LAST_STATUS = null;
    render();
  }
}

/* =========================
   INIT
   ========================= */

async function main() {
  initTopbarSession();
  initThemeToggle();

  try {
    await loadCommands();
    render();
  } catch (e) {
    console.error("[WEB] commands load failed:", e);
    if (els.root)
      els.root.innerHTML = `<div class="empty">Failed to load command catalog</div>`;
    setText(els.lastErr, e?.message || String(e));
  }

  els.search?.addEventListener("input", render);
  els.category?.addEventListener("change", render);
  els.showModOnly?.addEventListener("change", render);

  refreshStatus();
  setInterval(refreshStatus, 30000);
}

main().catch((err) => {
  console.error("[WEB] init failed:", err);

  try {
    if (els.root)
      els.root.innerHTML = `<div class="empty">Fatal init error</div>`;
    setText(els.lastErr, err?.message || String(err));
  } catch (e) {
    console.error("[WEB] error while rendering init failure:", e);
  }
});
