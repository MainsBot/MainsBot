import React, { useEffect, useMemo, useState } from "https://esm.sh/react@18.3.1";
import { createRoot } from "https://esm.sh/react-dom@18.3.1/client";
import htm from "https://esm.sh/htm@3.1.1";
import { applyStreamerThemeFromStatus } from "/static/theme.js";

const html = htm.bind(React.createElement);

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => {
    if (ch === "&") return "&amp;";
    if (ch === "<") return "&lt;";
    if (ch === ">") return "&gt;";
    if (ch === '"') return "&quot;";
    return "&#39;";
  });
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

function App() {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [jsonText, setJsonText] = useState("{}");
  const [backend, setBackend] = useState("unknown");
  const [keywords, setKeywords] = useState({});

  async function loadKeywords() {
    const res = await fetch("/api/admin/keywords", {
      credentials: "same-origin",
      cache: "no-store",
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new Error(body?.error || `${res.status} ${res.statusText}`);
    const normalized = normalizeKeywords(body?.keywords || {});
    setKeywords(normalized);
    setJsonText(JSON.stringify(normalized, null, 2));
    setBackend(String(body?.backend || "unknown"));
  }

  async function saveKeywords() {
    setStatus("Saving keywords...");
    try {
      const parsed = JSON.parse(String(jsonText || "{}"));
      const normalized = normalizeKeywords(parsed);
      const res = await fetch("/api/admin/keywords", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ keywords: normalized }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || `${res.status} ${res.statusText}`);
      const saved = normalizeKeywords(body?.keywords || {});
      setKeywords(saved);
      setJsonText(JSON.stringify(saved, null, 2));
      setBackend(String(body?.backend || "unknown"));
      setStatus("Keywords saved.");
    } catch (e) {
      setStatus(`Error: ${String(e?.message || e)}`);
    }
  }

  useEffect(() => {
    (async () => {
      try {
        await loadKeywords();
      } catch (e) {
        setStatus(`Error: ${String(e?.message || e)}`);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const categoryCount = useMemo(() => Object.keys(keywords || {}).length, [keywords]);
  const phraseCount = useMemo(
    () =>
      Object.values(keywords || {}).reduce(
        (sum, list) => sum + (Array.isArray(list) ? list.length : 0),
        0
      ),
    [keywords]
  );

  if (loading) {
    return html`<div className="muted">Loading keywords...</div>`;
  }

  return html`
    <div className="grid">
      <div className="panel">
        <div className="panel__top">
          <div>
            <div className="pill">Keywords</div>
            <h1 style=${{ marginTop: "10px", marginBottom: 0 }}>Keyword Manager</h1>
            <div className="muted" style=${{ marginTop: "6px" }}>
              Moderator access enabled. Edit as JSON: <code>{ "category": ["phrase"] }</code>
            </div>
          </div>
          <div className="row">
            <a className="btn btn--sm btn--ghost" href="/admin">Back</a>
            <button className="btn btn--sm btn--ghost" onClick=${loadKeywords}>Reload</button>
          </div>
        </div>
      </div>

      <div className="grid grid--3">
        <div className="panel">
          <h2>Categories</h2>
          <div style=${{ marginTop: "8px" }}><strong>${categoryCount}</strong></div>
        </div>
        <div className="panel">
          <h2>Phrases</h2>
          <div style=${{ marginTop: "8px" }}><strong>${phraseCount}</strong></div>
        </div>
        <div className="panel">
          <h2>Backend</h2>
          <div style=${{ marginTop: "8px" }}><strong>${backend}</strong></div>
        </div>
      </div>

      <div className="panel">
        <textarea
          className="textarea"
          spellcheck="false"
          style=${{ minHeight: "440px" }}
          value=${jsonText}
          onInput=${(e) => setJsonText(e.target.value)}
        ></textarea>
        <div className="settings-actions">
          <button className="btn" onClick=${saveKeywords}>Save Keywords</button>
          <span className="statusline">${status}</span>
        </div>
      </div>
    </div>
  `;
}

initTopbarSession();
initStreamerTheme();

const rootEl = document.getElementById("keywordsRoot");
if (rootEl) {
  createRoot(rootEl).render(html`<${App} />`);
}
