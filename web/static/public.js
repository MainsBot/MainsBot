import { applyStreamerThemeFromStatus } from "/static/theme.js";

const $ = (id) => document.getElementById(id);

const els = {
  themeToggle: $("themeToggle"),
  adminLinkSlot: $("topbarAdminLink"),
  right: document.querySelector(".topbar__right"),
  heroBotName: $("heroBotName"),
  heroBotLogin: $("heroBotLogin"),
  heroChannelName: $("heroChannelName"),
  heroChannelLogin: $("heroChannelLogin"),
  bot: $("homeBot"),
  channel: $("homeChannel"),
  twitch: $("homeTwitch"),
  roblox: $("homeRoblox"),
  spotify: $("homeSpotify"),
  uptime: $("homeUptime"),
  mode: $("homeMode"),
  keywords: $("homeKeywords"),
  footer: $("homeFooter"),
  json: $("liveStatusJson"),
};

let startedAt = 0;
let uptimeTimer = null;

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => {
    if (ch === "&") return "&amp;";
    if (ch === "<") return "&lt;";
    if (ch === ">") return "&gt;";
    if (ch === '"') return "&quot;";
    return "&#39;";
  });
}

function fmtUptime(ms) {
  const s = Math.floor(Math.max(0, Number(ms) || 0) / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}h ${m}m ${sec}s`;
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

function setText(el, value) {
  if (el) el.textContent = String(value ?? "");
}

function setThemeLabel() {
  if (!els.themeToggle) return;
  const isLight = document.documentElement.dataset.theme === "light";
  els.themeToggle.textContent = isLight ? "Dark" : "Light";
}

function initThemeToggle() {
  if (!els.themeToggle) return;
  const saved = localStorage.getItem("theme");
  document.documentElement.dataset.theme = saved === "light" ? "light" : "dark";
  setThemeLabel();

  els.themeToggle.addEventListener("click", () => {
    const isLight = document.documentElement.dataset.theme === "light";
    const next = isLight ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    localStorage.setItem("theme", next);
    setThemeLabel();
  });
}

function renderTopbarSession(session) {
  if (!els.right) return;
  const allowed = Boolean(session?.allowed);
  const login = String(session?.login || "").trim();

  if (allowed && login) {
    if (els.adminLinkSlot) {
      els.adminLinkSlot.innerHTML = `<a class="btn btn--sm btn--ghost" href="/admin">Admin</a>`;
    }
    els.right.innerHTML = `
      <div class="row" style="justify-content:flex-end">
        <a class="btn btn--sm btn--ghost" href="/swagger">Swagger</a>
        <span class="muted" style="font-size:13px">Logged in as</span>
        <strong>${escapeHtml(login)}</strong>
        <a class="btn btn--sm btn--danger" href="/admin/logout">Logout</a>
      </div>
    `;
    return;
  }

  if (els.adminLinkSlot) els.adminLinkSlot.innerHTML = "";
  els.right.innerHTML = `
    <div class="row" style="justify-content:flex-end">
      <a class="btn btn--sm btn--ghost" href="/swagger">Swagger</a>
      <a class="btn btn--sm" href="/admin/login">Login</a>
    </div>
  `;
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

function startUptimeClock() {
  if (!startedAt) return;
  if (uptimeTimer) return;
  uptimeTimer = setInterval(() => {
    if (!startedAt) return;
    setText(els.uptime, fmtUptime(Date.now() - startedAt));
  }, 1000);
}

function updateFromStatus(status) {
  const s = status && typeof status === "object" ? status : {};
  applyStreamerThemeFromStatus(s);

  const channelLabel = String(
    s.channelDisplayName || s.channelNameDisplay || s.channel || s.channelName || ""
  ).trim();
  if (channelLabel) {
    setText(els.heroChannelName, channelLabel);
    document.title = document.title.includes("MainsBot")
      ? document.title
      : `MainsBot - ${channelLabel}`;
  }

  const botLabel = String(s.botDisplayName || s.botName || "").trim();
  const botLogin = String(s.botName || "").trim();
  if (botLabel) setText(els.heroBotName, botLabel);
  if (botLogin) {
    setText(els.heroBotLogin, botLogin);
    setText(els.bot, botLogin);
  }

  const channelLogin = String(s.channelName || "").trim();
  if (channelLogin) {
    setText(els.heroChannelLogin, channelLogin);
    setText(els.channel, channelLogin);
  }

  let twitchText = s.twitchLive === true ? "Live" : s.twitchLive === false ? "Offline" : "-";
  if (s.twitchLive === true && s.twitchUptime) twitchText = `Live • ${s.twitchUptime}`;
  setText(els.twitch, twitchText);

  let robloxText = "-";
  if (s.roblox) {
    if (s.roblox.game && s.roblox.game !== "Website") robloxText = s.roblox.game;
    else if (s.roblox.presenceType === 0) robloxText = "Offline";
    else if (s.roblox.game === "Website") robloxText = "In Menus";
  }
  setText(els.roblox, robloxText);

  let spotifyText = "Not playing";
  if (s.spotify?.playing && s.spotify?.name) {
    spotifyText = `${s.spotify.name} - ${s.spotify.artists || ""}`.trim();
  }
  setText(els.spotify, spotifyText);

  if (Number.isFinite(Number(s.startedAt))) {
    startedAt = Number(s.startedAt);
    setText(els.uptime, fmtUptime(Date.now() - startedAt));
    startUptimeClock();
  }

  const modeRaw = String(s.currentMode || "").trim();
  const modePretty = modeRaw
    ? modeRaw.replace(/^!/, "").replace(/\.on$|\.off$/i, "")
    : "-";
  setText(
    els.mode,
    modePretty && modePretty !== "-"
      ? modePretty.charAt(0).toUpperCase() + modePretty.slice(1)
      : "-"
  );

  const keywordsOn =
    typeof s.keywords === "boolean"
      ? s.keywords
      : Array.isArray(s.keywords)
      ? s.keywords.length > 0
      : Object.keys(s.keywords || {}).length > 0;
  setText(els.keywords, keywordsOn ? "On" : "Off");

  if (els.footer) {
    const build = s.build && typeof s.build === "object" ? s.build : null;
    setText(els.footer, formatBuildFooter(build));
  }

  if (els.json) {
    els.json.textContent = JSON.stringify(s, null, 2);
  }
}

async function refreshStatus() {
  try {
    const res = await fetch("/api/status", { cache: "no-store" });
    if (!res.ok) throw new Error(`status http ${res.status}`);
    const status = await res.json();
    updateFromStatus(status);
  } catch (e) {
    if (els.json) {
      els.json.textContent = `Failed to load status: ${String(e?.message || e)}`;
    }
  }
}

async function main() {
  initThemeToggle();
  initTopbarSession();
  await refreshStatus();
  setInterval(refreshStatus, 30000);
}

main().catch((err) => {
  console.error("[WEB][PUBLIC] init failed:", err);
});
