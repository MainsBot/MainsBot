import React, { useEffect, useMemo, useRef, useState } from "https://esm.sh/react@18.3.1";
import { createRoot } from "https://esm.sh/react-dom@18.3.1/client";
import htm from "https://esm.sh/htm@3.1.1";
import { applyStreamerThemeFromStatus } from "/static/theme.js";

const html = htm.bind(React.createElement);

let keywordRowSeq = 0;

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => {
    if (ch === "&") return "&amp;";
    if (ch === "<") return "&lt;";
    if (ch === ">") return "&gt;";
    if (ch === '"') return "&quot;";
    return "&#39;";
  });
}

function makeKeywordRowId() {
  keywordRowSeq += 1;
  return `kw:${Date.now()}:${keywordRowSeq}`;
}

function parsePhraseList(value) {
  return String(value || "")
    .split(/[,\n]+/)
    .map((item) => String(item || "").trim().toLowerCase())
    .filter(Boolean);
}

function normalizeKeywords(raw) {
  const src = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const out = {};

  for (const [rawKey, rawValue] of Object.entries(src)) {
    const key = String(rawKey || "").trim().toLowerCase();
    if (!key) continue;

    const sourcePhrases = Array.isArray(rawValue)
      ? rawValue
      : Array.isArray(rawValue?.phrases)
        ? rawValue.phrases
        : [];

    const seen = new Set();
    const phrases = [];
    for (const phraseRaw of sourcePhrases) {
      const phrase = String(phraseRaw || "").trim().toLowerCase();
      if (!phrase || seen.has(phrase)) continue;
      seen.add(phrase);
      phrases.push(phrase);
    }

    const response =
      rawValue && typeof rawValue === "object" && !Array.isArray(rawValue)
        ? String(rawValue.response || "").trim()
        : "";

    if (!phrases.length && !response) continue;
    out[key] = { phrases, response };
  }

  return out;
}

function rowsFromKeywords(raw) {
  const normalized = normalizeKeywords(raw);
  return Object.entries(normalized)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, entry]) => ({
      id: makeKeywordRowId(),
      key,
      phrasesText: Array.isArray(entry?.phrases) ? entry.phrases.join(", ") : "",
      response: String(entry?.response || ""),
    }));
}

function keywordsFromRows(rows = []) {
  const out = {};

  for (const row of Array.isArray(rows) ? rows : []) {
    const key = String(row?.key || "").trim().toLowerCase();
    if (!key) continue;
    const phrases = Array.from(new Set(parsePhraseList(row?.phrasesText)));
    const response = String(row?.response || "").trim();
    if (!phrases.length && !response) continue;
    out[key] = { phrases, response };
  }

  return out;
}

function createKeywordRow(seed = {}) {
  return {
    id: makeKeywordRowId(),
    key: String(seed?.key || "").trim().toLowerCase(),
    phrasesText: String(seed?.phrasesText || "").trim(),
    response: String(seed?.response || ""),
  };
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
  const [backend, setBackend] = useState("unknown");
  const [rows, setRows] = useState([]);
  const [jsonText, setJsonText] = useState("{}");
  const importFileRef = useRef(null);

  const normalizedKeywords = useMemo(() => keywordsFromRows(rows), [rows]);
  const categoryCount = useMemo(() => Object.keys(normalizedKeywords).length, [normalizedKeywords]);
  const phraseCount = useMemo(
    () =>
      Object.values(normalizedKeywords).reduce(
        (sum, entry) => sum + (Array.isArray(entry?.phrases) ? entry.phrases.length : 0),
        0
      ),
    [normalizedKeywords]
  );
  const customResponseCount = useMemo(
    () =>
      Object.values(normalizedKeywords).reduce(
        (sum, entry) => sum + (String(entry?.response || "").trim() ? 1 : 0),
        0
      ),
    [normalizedKeywords]
  );

  useEffect(() => {
    setJsonText(JSON.stringify(normalizedKeywords, null, 2));
  }, [normalizedKeywords]);

  function syncRowsFromKeywords(nextKeywords, nextBackend = backend) {
    const normalized = normalizeKeywords(nextKeywords);
    setRows(rowsFromKeywords(normalized));
    setBackend(String(nextBackend || "unknown"));
    return normalized;
  }

  async function loadKeywords() {
    const res = await fetch("/api/admin/keywords", {
      credentials: "same-origin",
      cache: "no-store",
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new Error(body?.error || `${res.status} ${res.statusText}`);
    syncRowsFromKeywords(body?.keywords || {}, body?.backend || "unknown");
  }

  async function saveKeywords() {
    setStatus("Saving keywords...");
    try {
      const res = await fetch("/api/admin/keywords", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ keywords: normalizedKeywords }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || `${res.status} ${res.statusText}`);
      syncRowsFromKeywords(body?.keywords || {}, body?.backend || "unknown");
      setStatus("Keywords saved.");
    } catch (e) {
      setStatus(`Error: ${String(e?.message || e)}`);
    }
  }

  async function saveJsonEditor() {
    setStatus("Saving JSON...");
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
      syncRowsFromKeywords(body?.keywords || {}, body?.backend || "unknown");
      setStatus("Keywords saved from JSON.");
    } catch (e) {
      setStatus(`Error: ${String(e?.message || e)}`);
    }
  }

  async function importKeywordsFile(event) {
    const file = event?.target?.files?.[0];
    if (!file) return;
    try {
      setStatus(`Importing ${String(file.name || "keywords.json")}...`);
      const text = await file.text();
      const parsed = JSON.parse(String(text || "{}"));
      const normalized = normalizeKeywords(parsed);
      syncRowsFromKeywords(normalized, backend);
      setStatus(
        `Imported ${Object.keys(normalized).length} keyword entries. Click Save Keywords to persist.`
      );
    } catch (e) {
      setStatus(`Error: Invalid JSON file (${String(e?.message || e)})`);
    } finally {
      if (event?.target) event.target.value = "";
    }
  }

  function updateRow(id, patch = {}) {
    setRows((prev) =>
      prev.map((row) =>
        row.id === id
          ? {
              ...row,
              ...patch,
              key:
                patch.key == null
                  ? row.key
                  : String(patch.key || "").trim().toLowerCase(),
            }
          : row
      )
    );
  }

  function removeRow(id) {
    setRows((prev) => prev.filter((row) => row.id !== id));
  }

  function duplicateRow(id) {
    setRows((prev) => {
      const found = prev.find((row) => row.id === id);
      if (!found) return prev;
      return [...prev, createKeywordRow({
        key: found.key ? `${found.key}_copy` : "",
        phrasesText: found.phrasesText,
        response: found.response,
      })];
    });
  }

  function addRow() {
    setRows((prev) => [...prev, createKeywordRow()]);
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
              Add phrase triggers and either keep a built-in handler or set a custom response.
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
          <h2>Entries</h2>
          <div style=${{ marginTop: "8px" }}><strong>${categoryCount}</strong></div>
        </div>
        <div className="panel">
          <h2>Phrases</h2>
          <div style=${{ marginTop: "8px" }}><strong>${phraseCount}</strong></div>
        </div>
        <div className="panel">
          <h2>Custom Replies</h2>
          <div style=${{ marginTop: "8px" }}><strong>${customResponseCount}</strong></div>
          <div className="meta">Backend: ${backend}</div>
        </div>
      </div>

      <div className="panel">
        <div className="settings-actions" style=${{ marginTop: 0 }}>
          <button className="btn btn--ghost" onClick=${() => importFileRef.current?.click?.()}>
            Import JSON File
          </button>
          <button className="btn btn--ghost" onClick=${addRow}>
            Add Keyword
          </button>
          <button className="btn" onClick=${saveKeywords}>
            Save Keywords
          </button>
          <span className="statusline">${status}</span>
        </div>

        <input
          ref=${importFileRef}
          type="file"
          accept="application/json,.json"
          style=${{ display: "none" }}
          onChange=${importKeywordsFile}
        />

        <div className="quotes-list" style=${{ marginTop: "14px" }}>
          ${rows.length
            ? rows.map((row) => html`
                <article className="quote-card" key=${row.id}>
                  <div className="quote-card__head">
                    <span className="pill">${row.key || "New keyword"}</span>
                    <div className="row">
                      <button className="btn btn--sm btn--ghost" onClick=${() => duplicateRow(row.id)}>
                        Duplicate
                      </button>
                      <button className="btn btn--sm btn--danger" onClick=${() => removeRow(row.id)}>
                        Delete
                      </button>
                    </div>
                  </div>

                  <div className="fieldlist">
                    <div className="field">
                      <div className="field__meta">
                        <div className="field__label">Key</div>
                        <div className="field__hint">
                          Internal keyword key. Keep built-in names like <code>join</code> or <code>game</code> if you want their existing handler.
                        </div>
                      </div>
                      <input
                        className="in in--sm"
                        value=${row.key}
                        onInput=${(e) => updateRow(row.id, { key: e.target.value })}
                        placeholder="join"
                      />
                    </div>

                    <div className="field">
                      <div className="field__meta">
                        <div className="field__label">Trigger Phrases</div>
                        <div className="field__hint">
                          Comma-separated phrases. Any phrase match will trigger this entry.
                        </div>
                      </div>
                      <textarea
                        className="textarea textarea--sm"
                        value=${row.phrasesText}
                        onInput=${(e) => updateRow(row.id, { phrasesText: e.target.value })}
                        placeholder="can i join, joins off, how do i join"
                      ></textarea>
                    </div>

                    <div className="field">
                      <div className="field__meta">
                        <div className="field__label">Custom Response</div>
                        <div className="field__hint">
                          Leave blank to use a built-in handler. Supported tokens: <code>{user}</code>, <code>{streamerDisplay}</code>, <code>{channel}</code>, <code>{message}</code>
                        </div>
                      </div>
                      <textarea
                        className="textarea textarea--sm"
                        value=${row.response}
                        onInput=${(e) => updateRow(row.id, { response: e.target.value })}
                        placeholder="@{user}, {streamerDisplay} is currently switching games."
                      ></textarea>
                    </div>
                  </div>
                </article>
              `)
            : html`
                <div className="panel">
                  <div className="muted">No keyword entries yet. Add one to start managing trigger phrases and responses.</div>
                </div>
              `}
        </div>
      </div>

      <div className="panel">
        <details className="details">
          <summary>Advanced JSON editor</summary>
          <div className="meta" style=${{ marginTop: "8px" }}>
            Supports both legacy <code>{ "join": ["phrase"] }</code> and new
            <code>{ "join": { "phrases": ["phrase"], "response": "" } }</code> formats.
          </div>
          <textarea
            className="textarea"
            spellcheck="false"
            style=${{ minHeight: "320px", marginTop: "10px" }}
            value=${jsonText}
            onInput=${(e) => setJsonText(e.target.value)}
          ></textarea>
          <div className="row" style=${{ marginTop: "10px" }}>
            <button className="btn" onClick=${saveJsonEditor}>Save JSON</button>
          </div>
        </details>
      </div>
    </div>
  `;
}

initThemeToggle();
initTopbarSession();
initStreamerTheme();

const rootEl = document.getElementById("keywordsRoot");
if (rootEl) {
  createRoot(rootEl).render(html`<${App} />`);
}
