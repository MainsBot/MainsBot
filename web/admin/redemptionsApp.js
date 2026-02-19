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

function nint(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.floor(n));
}

function normalizeReward(row = {}) {
  return {
    id: String(row?.id || "").trim(),
    title: String(row?.title || "").trim(),
    prompt: String(row?.prompt || "").trim(),
    cost: nint(row?.cost, 1),
    is_enabled: Boolean(row?.is_enabled),
    is_user_input_required: Boolean(row?.is_user_input_required),
    should_redemptions_skip_request_queue: Boolean(row?.should_redemptions_skip_request_queue),
  };
}

function App() {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [rewards, setRewards] = useState([]);
  const [selectedRewardId, setSelectedRewardId] = useState("");
  const [rewardDraft, setRewardDraft] = useState({
    title: "",
    prompt: "",
    cost: 1,
    is_enabled: true,
    is_user_input_required: false,
    should_redemptions_skip_request_queue: false,
  });
  const [redeemStatus, setRedeemStatus] = useState("UNFULFILLED");
  const [redemptions, setRedemptions] = useState([]);
  const [logs, setLogs] = useState([]);

  const selectedReward = useMemo(
    () => rewards.find((r) => r.id === selectedRewardId) || null,
    [rewards, selectedRewardId]
  );

  async function apiGet(url) {
    const res = await fetch(url, { credentials: "same-origin", cache: "no-store" });
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new Error(body?.error || `${res.status} ${res.statusText}`);
    return body || {};
  }

  async function apiPost(url, payload) {
    const res = await fetch(url, {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload || {}),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new Error(body?.error || `${res.status} ${res.statusText}`);
    return body || {};
  }

  async function loadRewards({ keepSelection = true } = {}) {
    const body = await apiGet("/api/admin/redemptions/rewards?manageable=true");
    const rows = Array.isArray(body?.rewards) ? body.rewards.map(normalizeReward) : [];
    setRewards(rows);
    if (!rows.length) {
      setSelectedRewardId("");
      return;
    }

    if (keepSelection && rows.some((r) => r.id === selectedRewardId)) {
      return;
    }
    setSelectedRewardId(rows[0].id);
  }

  async function loadLogs() {
    const body = await apiGet("/api/admin/redemptions/log?limit=120");
    setLogs(Array.isArray(body?.entries) ? body.entries : []);
  }

  async function loadRedemptions() {
    if (!selectedRewardId) {
      setRedemptions([]);
      return;
    }
    const body = await apiGet(
      `/api/admin/redemptions/list?rewardId=${encodeURIComponent(selectedRewardId)}&status=${encodeURIComponent(
        redeemStatus
      )}&first=50`
    );
    setRedemptions(Array.isArray(body?.redemptions) ? body.redemptions : []);
    if (Array.isArray(body?.logEntries)) setLogs(body.logEntries);
  }

  useEffect(() => {
    (async () => {
      try {
        await loadRewards({ keepSelection: false });
        await loadLogs();
        setStatus("Loaded.");
      } catch (e) {
        setStatus(`Error: ${String(e?.message || e)}`);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!selectedReward) return;
    setRewardDraft({
      title: selectedReward.title,
      prompt: selectedReward.prompt,
      cost: selectedReward.cost,
      is_enabled: selectedReward.is_enabled,
      is_user_input_required: selectedReward.is_user_input_required,
      should_redemptions_skip_request_queue: selectedReward.should_redemptions_skip_request_queue,
    });
  }, [selectedRewardId, selectedReward?.id]);

  useEffect(() => {
    void loadRedemptions();
  }, [selectedRewardId, redeemStatus]);

  async function onCreateReward() {
    const payload = {
      title: String(rewardDraft.title || "").trim(),
      prompt: String(rewardDraft.prompt || "").trim(),
      cost: Math.max(1, nint(rewardDraft.cost, 1)),
      is_enabled: Boolean(rewardDraft.is_enabled),
      is_user_input_required: Boolean(rewardDraft.is_user_input_required),
      should_redemptions_skip_request_queue: Boolean(
        rewardDraft.should_redemptions_skip_request_queue
      ),
    };
    if (!payload.title) {
      setStatus("Error: reward title is required.");
      return;
    }
    setStatus("Creating reward...");
    try {
      await apiPost("/api/admin/redemptions/rewards", {
        action: "create",
        reward: payload,
      });
      await loadRewards({ keepSelection: false });
      await loadLogs();
      setStatus("Reward created.");
    } catch (e) {
      setStatus(`Error: ${String(e?.message || e)}`);
    }
  }

  async function onUpdateReward() {
    if (!selectedRewardId) return;
    setStatus("Saving reward...");
    try {
      await apiPost("/api/admin/redemptions/rewards", {
        action: "update",
        rewardId: selectedRewardId,
        reward: {
          title: String(rewardDraft.title || "").trim(),
          prompt: String(rewardDraft.prompt || "").trim(),
          cost: Math.max(1, nint(rewardDraft.cost, 1)),
          is_enabled: Boolean(rewardDraft.is_enabled),
          is_user_input_required: Boolean(rewardDraft.is_user_input_required),
          should_redemptions_skip_request_queue: Boolean(
            rewardDraft.should_redemptions_skip_request_queue
          ),
        },
      });
      await loadRewards();
      setStatus("Reward saved.");
    } catch (e) {
      setStatus(`Error: ${String(e?.message || e)}`);
    }
  }

  async function onDeleteReward() {
    if (!selectedRewardId) return;
    if (!window.confirm("Delete this reward?")) return;
    setStatus("Deleting reward...");
    try {
      await apiPost("/api/admin/redemptions/rewards", {
        action: "delete",
        rewardId: selectedRewardId,
      });
      setRedemptions([]);
      await loadRewards({ keepSelection: false });
      await loadLogs();
      setStatus("Reward deleted.");
    } catch (e) {
      setStatus(`Error: ${String(e?.message || e)}`);
    }
  }

  async function onUpdateRedemptionStatus(redemptionId, nextStatus) {
    if (!selectedRewardId || !redemptionId) return;
    setStatus(`Marking redemption ${nextStatus.toLowerCase()}...`);
    try {
      await apiPost("/api/admin/redemptions/status", {
        rewardId: selectedRewardId,
        redemptionIds: [redemptionId],
        status: String(nextStatus || "").toUpperCase(),
      });
      await loadRedemptions();
      await loadLogs();
      setStatus(`Redemption ${nextStatus.toLowerCase()}.`);
    } catch (e) {
      setStatus(`Error: ${String(e?.message || e)}`);
    }
  }

  if (loading) {
    return html`<div className="muted">Loading redemptions...</div>`;
  }

  return html`
    <div className="grid">
      <div className="panel">
        <div className="panel__top">
          <div>
            <div className="pill">Owner Only</div>
            <h1 style=${{ marginTop: "10px", marginBottom: 0 }}>Channel Point Redemptions</h1>
            <div className="muted" style=${{ marginTop: "6px" }}>
              Manage rewards, see redemptions, and track who redeemed.
            </div>
          </div>
          <div className="row">
            <a className="btn btn--sm btn--ghost" href="/admin">Back</a>
            <a className="btn btn--sm btn--ghost" href="/swagger">Swagger</a>
          </div>
        </div>
        <div className="meta">${status}</div>
      </div>

      <div className="grid grid--2">
        <div className="panel">
          <h2>Rewards</h2>
          <div className="row" style=${{ marginTop: "8px" }}>
            <select
              className="in in--sm"
              value=${selectedRewardId}
              onChange=${(e) => setSelectedRewardId(e.target.value)}
              style=${{ minWidth: "320px", maxWidth: "none" }}
            >
              ${rewards.map((row) => html`
                <option key=${row.id} value=${row.id}>
                  ${row.title || row.id} (${row.cost})
                </option>
              `)}
            </select>
            <button className="btn btn--sm btn--ghost" onClick=${() => loadRewards()}>Refresh</button>
          </div>

          <div className="fieldlist" style=${{ marginTop: "10px" }}>
            <div className="field">
              <div className="field__label">Title</div>
              <input
                className="in in--sm"
                value=${rewardDraft.title}
                onInput=${(e) => setRewardDraft((prev) => ({ ...prev, title: e.target.value }))}
              />
            </div>
            <div className="field">
              <div className="field__label">Cost</div>
              <input
                className="in in--sm"
                type="number"
                min="1"
                value=${String(rewardDraft.cost)}
                onInput=${(e) =>
                  setRewardDraft((prev) => ({ ...prev, cost: Math.max(1, nint(e.target.value, 1)) }))}
              />
            </div>
            <div className="field" style=${{ gridColumn: "1/-1" }}>
              <div className="field__label">Prompt</div>
              <textarea
                className="textarea textarea--sm"
                value=${rewardDraft.prompt}
                onInput=${(e) => setRewardDraft((prev) => ({ ...prev, prompt: e.target.value }))}
              ></textarea>
            </div>
          </div>

          <div className="row" style=${{ marginTop: "8px" }}>
            <label><input type="checkbox" checked=${rewardDraft.is_enabled} onChange=${(e) => setRewardDraft((prev) => ({ ...prev, is_enabled: e.target.checked }))} /> Enabled</label>
            <label><input type="checkbox" checked=${rewardDraft.is_user_input_required} onChange=${(e) => setRewardDraft((prev) => ({ ...prev, is_user_input_required: e.target.checked }))} /> User Input Required</label>
            <label><input type="checkbox" checked=${rewardDraft.should_redemptions_skip_request_queue} onChange=${(e) => setRewardDraft((prev) => ({ ...prev, should_redemptions_skip_request_queue: e.target.checked }))} /> Auto-Fulfill</label>
          </div>

          <div className="row" style=${{ marginTop: "10px" }}>
            <button className="btn btn--sm" onClick=${onUpdateReward} disabled=${!selectedRewardId}>Save Reward</button>
            <button className="btn btn--sm btn--ghost" onClick=${onCreateReward}>Create New</button>
            <button className="btn btn--sm btn--danger" onClick=${onDeleteReward} disabled=${!selectedRewardId}>Delete</button>
          </div>
        </div>

        <div className="panel">
          <h2>Redemption Queue</h2>
          <div className="row" style=${{ marginTop: "8px" }}>
            <select className="in in--sm" value=${redeemStatus} onChange=${(e) => setRedeemStatus(e.target.value)}>
              <option value="UNFULFILLED">UNFULFILLED</option>
              <option value="FULFILLED">FULFILLED</option>
              <option value="CANCELED">CANCELED</option>
            </select>
            <button className="btn btn--sm btn--ghost" onClick=${() => loadRedemptions()}>Refresh</button>
          </div>
          ${!redemptions.length
            ? html`<div className="muted" style=${{ marginTop: "12px" }}>No redemptions in this view.</div>`
            : html`
                <div className="quotes-list" style=${{ marginTop: "10px" }}>
                  ${redemptions.map((row) => html`
                    <article className="quote-card" key=${row.id}>
                      <div className="quote-card__head">
                        <span className="pill">${row.status || "?"}</span>
                        <div className="row">
                          <button className="btn btn--sm" onClick=${() => onUpdateRedemptionStatus(row.id, "FULFILLED")}>Fulfill</button>
                          <button className="btn btn--sm btn--danger" onClick=${() => onUpdateRedemptionStatus(row.id, "CANCELED")}>Cancel</button>
                        </div>
                      </div>
                      <div><strong>${row.user_name || row.user_login || "unknown"}</strong> (${row.user_id || "-"})</div>
                      <div className="muted">${row.user_input ? `Input: ${row.user_input}` : "No user input."}</div>
                      <div className="quote-card__meta">
                        <span>${row.redeemed_at || "-"}</span>
                        <span>|</span>
                        <span>${row.id}</span>
                      </div>
                    </article>
                  `)}
                </div>
              `}
        </div>
      </div>

      <div className="panel">
        <h2>Redemption Log</h2>
        ${!logs.length
          ? html`<div className="muted">No logged redemptions yet.</div>`
          : html`
              <div className="quotes-list" style=${{ marginTop: "10px" }}>
                ${logs.map((row) => html`
                  <article className="quote-card" key=${row.redemptionId}>
                    <div className="quote-card__head">
                      <span className="pill">${row.status || "?"}</span>
                      <span className="muted">${row.rewardTitle || row.rewardId || "reward"}</span>
                    </div>
                    <div><strong>${row.userName || row.userLogin || "unknown"}</strong> (${row.userId || "-"})</div>
                    <div className="muted">${row.userInput ? `Input: ${row.userInput}` : "No user input."}</div>
                    <div className="quote-card__meta">
                      <span>${row.redeemedAt || row.loggedAt || "-"}</span>
                      <span>|</span>
                      <span>${row.redemptionId}</span>
                    </div>
                  </article>
                `)}
              </div>
            `}
      </div>
    </div>
  `;
}

initTopbarSession();

const rootEl = document.getElementById("redemptionsRoot");
if (rootEl) {
  createRoot(rootEl).render(html`<${App} />`);
}
