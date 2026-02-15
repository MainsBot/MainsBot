import React, { useEffect, useMemo, useState } from "https://esm.sh/react@18.3.1";
import { createRoot } from "https://esm.sh/react-dom@18.3.1/client";
import htm from "https://esm.sh/htm@3.1.1";

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

function normalizeQuotesData(raw) {
  const input =
    raw && typeof raw === "object"
      ? Array.isArray(raw.quotes)
        ? raw.quotes
        : []
      : [];

  const quotes = input
    .map((row) => ({
      id: Number(row?.id || 0),
      text: String(row?.text || "").trim(),
      addedBy: String(row?.addedBy || "").trim(),
      addedAt: String(row?.addedAt || "").trim(),
    }))
    .filter((row) => Number.isFinite(row.id) && row.id > 0 && row.text)
    .sort((a, b) => a.id - b.id);

  const maxId = quotes.reduce((m, row) => Math.max(m, row.id), 0);
  const nextIdRaw = Number(raw?.nextId || 0);
  const nextId = Number.isFinite(nextIdRaw) && nextIdRaw > maxId ? nextIdRaw : maxId + 1;

  return { nextId, quotes };
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

function App() {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [newText, setNewText] = useState("");
  const [search, setSearch] = useState("");
  const [data, setData] = useState({ nextId: 1, quotes: [] });
  const [drafts, setDrafts] = useState({});
  const [jsonText, setJsonText] = useState("");

  async function loadQuotes() {
    const res = await fetch("/api/admin/quotes", {
      credentials: "same-origin",
      cache: "no-store",
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(body?.error || `${res.status} ${res.statusText}`);
    }
    const normalized = normalizeQuotesData(body);
    setData(normalized);
    setDrafts(
      normalized.quotes.reduce((map, row) => {
        map[row.id] = row.text;
        return map;
      }, {})
    );
    setJsonText(JSON.stringify(normalized, null, 2));
    return normalized;
  }

  async function runAction(payload) {
    const res = await fetch("/api/admin/quotes", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(body?.error || `${res.status} ${res.statusText}`);
    }
    const normalized = normalizeQuotesData(body?.data || body);
    setData(normalized);
    setDrafts(
      normalized.quotes.reduce((map, row) => {
        map[row.id] = row.text;
        return map;
      }, {})
    );
    setJsonText(JSON.stringify(normalized, null, 2));
    return normalized;
  }

  useEffect(() => {
    (async () => {
      try {
        await loadQuotes();
      } catch (e) {
        setStatus(`Error: ${String(e?.message || e)}`);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const sortedQuotes = useMemo(
    () => [...(data?.quotes || [])].sort((a, b) => a.id - b.id),
    [data]
  );
  const filteredQuotes = useMemo(() => {
    const q = String(search || "").trim().toLowerCase();
    if (!q) return sortedQuotes;
    return sortedQuotes.filter((row) => {
      const text = String(row?.text || "").toLowerCase();
      const addedBy = String(row?.addedBy || "").toLowerCase();
      return text.includes(q) || addedBy.includes(q) || String(row?.id || "").includes(q);
    });
  }, [sortedQuotes, search]);

  async function onAddQuote() {
    const text = String(newText || "").trim();
    if (!text) {
      setStatus("Error: Enter quote text.");
      return;
    }
    setStatus("Adding...");
    try {
      await runAction({ action: "add", text });
      setNewText("");
      setStatus("Quote added.");
    } catch (e) {
      setStatus(`Error: ${String(e?.message || e)}`);
    }
  }

  async function onSaveQuote(id) {
    const text = String(drafts?.[id] || "").trim();
    if (!text) {
      setStatus("Error: Quote text is empty.");
      return;
    }
    setStatus(`Saving #${id}...`);
    try {
      await runAction({ action: "edit", id, text });
      setStatus(`Saved #${id}.`);
    } catch (e) {
      setStatus(`Error: ${String(e?.message || e)}`);
    }
  }

  async function onDeleteQuote(id) {
    if (!window.confirm(`Delete quote #${id}?`)) return;
    setStatus(`Deleting #${id}...`);
    try {
      await runAction({ action: "delete", id });
      setStatus(`Deleted #${id}.`);
    } catch (e) {
      setStatus(`Error: ${String(e?.message || e)}`);
    }
  }

  async function onSaveJson() {
    setStatus("Saving JSON...");
    try {
      await runAction({ action: "replace", quotesText: String(jsonText || "") });
      setStatus("JSON saved.");
    } catch (e) {
      setStatus(`Error: ${String(e?.message || e)}`);
    }
  }

  if (loading) {
    return html`<div className="muted">Loading quotes...</div>`;
  }

  return html`
    <div className="grid">
      <div className="panel">
        <div className="panel__top">
          <div>
            <div className="pill">Quotes</div>
            <h1 style=${{ marginTop: "10px", marginBottom: 0 }}>Quotes Manager</h1>
            <div className="muted" style=${{ marginTop: "6px" }}>
              Chat command: <code>!addquote &lt;text&gt;</code>
            </div>
          </div>
          <div className="row">
            <a className="btn btn--sm btn--ghost" href="/admin">Back</a>
            <a className="btn btn--sm btn--ghost" href="/admin/quotes?format=json">Download JSON</a>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="settings-actions">
          <input
            className="in"
            placeholder="New quote text..."
            value=${newText}
            onInput=${(e) => setNewText(e.target.value)}
            style=${{ flex: 1, minWidth: "220px", maxWidth: "none" }}
          />
          <button className="btn" onClick=${onAddQuote}>Add Quote</button>
          <span className="statusline">${status}</span>
        </div>
        <div className="row" style=${{ marginTop: "10px" }}>
          <input
            className="in in--sm"
            placeholder="Search by id, text, or added by..."
            value=${search}
            onInput=${(e) => setSearch(e.target.value)}
            style=${{ maxWidth: "520px" }}
          />
          <div className="muted">Showing ${filteredQuotes.length} / ${sortedQuotes.length}</div>
        </div>
      </div>

      <div className="panel">
        ${!filteredQuotes.length
          ? html`<div className="muted">No quotes match your search.</div>`
          : html`
              <div className="quotes-list">
                ${filteredQuotes.map((row) => html`
                  <article className="quote-card" key=${row.id}>
                    <div className="quote-card__head">
                      <span className="pill">#${row.id}</span>
                      <div className="row">
                        <button className="btn btn--sm" onClick=${() => onSaveQuote(row.id)}>Save</button>
                        <button className="btn btn--sm btn--danger" onClick=${() => onDeleteQuote(row.id)}>Delete</button>
                      </div>
                    </div>

                    <textarea
                      className="textarea textarea--sm quote-card__text"
                      value=${String(drafts?.[row.id] ?? row.text)}
                      onInput=${(e) => setDrafts((prev) => ({ ...prev, [row.id]: e.target.value }))}
                    ></textarea>

                    <div className="quote-card__meta">
                      <span>Added by: <strong>${row.addedBy || "-"}</strong></span>
                      <span>|</span>
                      <span>${row.addedAt || "-"}</span>
                    </div>
                  </article>
                `)}
              </div>
            `}
      </div>

      <div className="panel">
        <details className="details">
          <summary>Advanced JSON editor</summary>
          <div className="muted" style=${{ marginTop: "8px" }}>
            Edits persist to your configured state backend. Invalid JSON is rejected.
          </div>
          <textarea
            className="textarea"
            spellcheck="false"
            value=${jsonText}
            onInput=${(e) => setJsonText(e.target.value)}
          ></textarea>
          <div className="row" style=${{ marginTop: "10px" }}>
            <button className="btn" onClick=${onSaveJson}>Save JSON</button>
          </div>
        </details>
      </div>
    </div>
  `;
}

initTopbarSession();

const rootEl = document.getElementById("quotesRoot");
if (rootEl) {
  createRoot(rootEl).render(html`<${App} />`);
}

