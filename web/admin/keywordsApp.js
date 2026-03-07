import React, { useEffect, useMemo, useRef, useState } from "https://esm.sh/react@18.3.1";
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

function parsePhraseList(value) {
  return Array.from(
    new Set(
      String(value || "")
        .split(/[,\n]+/)
        .map((item) => String(item || "").trim().toLowerCase())
        .filter(Boolean)
    )
  );
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

    const phrases = Array.from(
      new Set(
        sourcePhrases
          .map((phraseRaw) => String(phraseRaw || "").trim().toLowerCase())
          .filter(Boolean)
      )
    );

    const response =
      rawValue && typeof rawValue === "object" && !Array.isArray(rawValue)
        ? String(rawValue.response || "").trim()
        : "";

    if (!phrases.length && !response) continue;
    out[key] = { phrases, response };
  }

  return out;
}

function normalizeCatalog(rawCatalog) {
  const list = Array.isArray(rawCatalog) ? rawCatalog : [];
  const out = [];
  const seen = new Set();

  for (const item of list) {
    const key = String(item?.key || "").trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({
      key,
      responseEditable: item?.responseEditable !== false,
      responseLockReason: String(item?.responseLockReason || "").trim(),
    });
  }

  return out;
}

function filterSupportedKeywords(rawKeywords, catalog = []) {
  const supported = new Set((Array.isArray(catalog) ? catalog : []).map((item) => item.key));
  const normalized = normalizeKeywords(rawKeywords);
  const out = {};

  for (const [key, entry] of Object.entries(normalized)) {
    if (!supported.has(key)) continue;
    out[key] = entry;
  }

  return out;
}

function rowsFromCatalog(catalog = [], rawKeywords = {}) {
  const normalized = normalizeKeywords(rawKeywords);
  return (Array.isArray(catalog) ? catalog : []).map((item, index) => {
    const entry = normalized[item.key] || { phrases: [], response: "" };
    return {
      id: `kw:${item.key}`,
      key: item.key,
      order: index,
      responseEditable: item.responseEditable !== false,
      responseLockReason: String(item.responseLockReason || "").trim(),
      phrasesText: Array.isArray(entry?.phrases) ? entry.phrases.join(", ") : "",
      response: item.responseEditable !== false ? String(entry?.response || "") : "",
    };
  });
}

function keywordsFromRows(rows = []) {
  const out = {};

  for (const row of Array.isArray(rows) ? rows : []) {
    const key = String(row?.key || "").trim().toLowerCase();
    if (!key) continue;
    const phrases = parsePhraseList(row?.phrasesText);
    const response = row?.responseEditable === false ? "" : String(row?.response || "").trim();
    if (!phrases.length && !response) continue;
    out[key] = { phrases, response };
  }

  return out;
}

function hasRowContent(row) {
  return parsePhraseList(row?.phrasesText).length > 0 || String(row?.response || "").trim().length > 0;
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

function getThemeToggleMarkup() {
  return `<button class="btn btn--sm btn--ghost theme-toggle" id="themeToggle" type="button">Light</button>`;
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
  } catch {}
  right.innerHTML = `
    <div class="row" style="justify-content:flex-end">
      ${getThemeToggleMarkup()}
      <a class="btn btn--sm btn--ghost" href="/swagger">Swagger</a>
      <a class="btn btn--sm" href="/admin/login">Login</a>
    </div>
  `;
  initThemeToggle();
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
  const [catalog, setCatalog] = useState([]);
  const [hiddenCategoryCount, setHiddenCategoryCount] = useState(0);
  const [rows, setRows] = useState([]);
  const [jsonText, setJsonText] = useState("{}");
  const importFileRef = useRef(null);

  const orderedRows = useMemo(
    () =>
      [...rows].sort((a, b) => {
        const activeDelta = Number(hasRowContent(b)) - Number(hasRowContent(a));
        if (activeDelta !== 0) return activeDelta;
        return Number(a.order || 0) - Number(b.order || 0);
      }),
    [rows]
  );
  const normalizedKeywords = useMemo(() => keywordsFromRows(rows), [rows]);
  const activeKeywordCount = useMemo(
    () => rows.reduce((sum, row) => sum + (hasRowContent(row) ? 1 : 0), 0),
    [rows]
  );
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

  function syncRowsFromKeywords(
    nextKeywords,
    nextBackend = backend,
    nextCatalog = catalog,
    nextHiddenCategoryCount = hiddenCategoryCount
  ) {
    const safeCatalog = normalizeCatalog(nextCatalog);
    const filtered = filterSupportedKeywords(nextKeywords, safeCatalog);
    setCatalog(safeCatalog);
    setRows(rowsFromCatalog(safeCatalog, filtered));
    setBackend(String(nextBackend || "unknown"));
    setHiddenCategoryCount(Math.max(0, Number(nextHiddenCategoryCount) || 0));
    return filtered;
  }

  async function loadKeywords() {
    const res = await fetch("/api/admin/keywords", {
      credentials: "same-origin",
      cache: "no-store",
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new Error(body?.error || `${res.status} ${res.statusText}`);
    syncRowsFromKeywords(
      body?.keywords || {},
      body?.backend || "unknown",
      body?.catalog || [],
      body?.hiddenCategoryCount || 0
    );
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
      syncRowsFromKeywords(
        body?.keywords || {},
        body?.backend || "unknown",
        body?.catalog || catalog,
        body?.hiddenCategoryCount || 0
      );
      setStatus("Keywords saved.");
    } catch (e) {
      setStatus(`Error: ${String(e?.message || e)}`);
    }
  }

  async function saveJsonEditor() {
    setStatus("Saving JSON...");
    try {
      const parsed = JSON.parse(String(jsonText || "{}"));
      const filtered = filterSupportedKeywords(parsed, catalog);
      const ignoredCount = Object.keys(normalizeKeywords(parsed)).length - Object.keys(filtered).length;
      const res = await fetch("/api/admin/keywords", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ keywords: filtered }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || `${res.status} ${res.statusText}`);
      syncRowsFromKeywords(
        body?.keywords || {},
        body?.backend || "unknown",
        body?.catalog || catalog,
        body?.hiddenCategoryCount || 0
      );
      setStatus(
        ignoredCount > 0
          ? `Keywords saved from JSON. Ignored ${ignoredCount} unsupported categories.`
          : "Keywords saved from JSON."
      );
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
      const filtered = filterSupportedKeywords(parsed, catalog);
      const ignoredCount = Object.keys(normalizeKeywords(parsed)).length - Object.keys(filtered).length;
      syncRowsFromKeywords(filtered, backend, catalog, hiddenCategoryCount);
      setStatus(
        ignoredCount > 0
          ? `Imported ${Object.keys(filtered).length} supported keyword entries and ignored ${ignoredCount} unsupported categories. Click Save Keywords to persist.`
          : `Imported ${Object.keys(filtered).length} supported keyword entries. Click Save Keywords to persist.`
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
              response:
                row.responseEditable === false && Object.prototype.hasOwnProperty.call(patch, "response")
                  ? ""
                  : Object.prototype.hasOwnProperty.call(patch, "response")
                    ? String(patch.response || "")
                    : row.response,
            }
          : row
      )
    );
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
              Only built-in keyword categories from <code>responses.js</code> are shown here. Dynamic keywords keep their built-in reply logic.
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
          <h2>Supported</h2>
          <div style=${{ marginTop: "8px" }}><strong>${catalog.length}</strong></div>
        </div>
        <div className="panel">
          <h2>Active</h2>
          <div style=${{ marginTop: "8px" }}><strong>${activeKeywordCount}</strong></div>
        </div>
        <div className="panel">
          <h2>Custom Replies</h2>
          <div style=${{ marginTop: "8px" }}><strong>${customResponseCount}</strong></div>
          <div className="meta">Phrases: ${phraseCount} • Backend: ${backend}</div>
          ${hiddenCategoryCount > 0
            ? html`<div className="meta">Hidden legacy categories preserved: ${hiddenCategoryCount}</div>`
            : null}
        </div>
      </div>

      <div className="panel">
        <div className="settings-actions" style=${{ marginTop: 0 }}>
          <button className="btn btn--ghost" onClick=${() => importFileRef.current?.click?.()}>
            Import JSON File
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
          ${orderedRows.length
            ? orderedRows.map((row) => html`
                <article className="quote-card" key=${row.id}>
                  <div className="quote-card__head">
                    <span className="pill">${row.key}</span>
                    <span className="meta">${hasRowContent(row) ? "Configured" : "Inactive"}</span>
                  </div>

                  <div className="fieldlist">
                    <div className="field">
                      <div className="field__meta">
                        <div className="field__label">Trigger Phrases</div>
                        <div className="field__hint">
                          Comma-separated phrases. Any phrase match will trigger the <code>${row.key}</code> keyword.
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
                        <div className="field__label">Response</div>
                        <div className="field__hint">
                          ${row.responseEditable
                            ? html`Leave blank to keep the built-in handler. Supported tokens: <code>{user}</code>, <code>{streamerDisplay}</code>, <code>{channel}</code>, <code>{message}</code>.`
                            : row.responseLockReason || "This keyword uses its built-in response logic and is not editable here."}
                        </div>
                      </div>
                      <textarea
                        className="textarea textarea--sm"
                        value=${row.response}
                        disabled=${row.responseEditable === false}
                        onInput=${(e) => updateRow(row.id, { response: e.target.value })}
                        placeholder=${row.responseEditable === false
                          ? "Built-in response only"
                          : "@{user}, {streamerDisplay} is currently switching games."}
                        style=${row.responseEditable === false
                          ? { opacity: 0.6, cursor: "not-allowed" }
                          : null}
                      ></textarea>
                    </div>
                  </div>
                </article>
              `)
            : html`
                <div className="panel">
                  <div className="muted">No built-in keyword categories are available.</div>
                </div>
              `}
        </div>
      </div>

      <div className="panel">
        <details className="details">
          <summary>Advanced JSON editor</summary>
          <div className="meta" style=${{ marginTop: "8px" }}>
            Only supported keyword categories from <code>responses.js</code> are accepted here. Hidden unsupported categories stay stored but are not editable from the website.
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
