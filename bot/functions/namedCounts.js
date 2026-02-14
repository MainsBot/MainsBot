import { resolveStateSchema } from "../../data/postgres/db.js";
import { ensureStateTable, readStateValue, writeStateValue } from "../../data/postgres/stateStore.js";

function hasDatabaseUrl() {
  return Boolean(String(process.env.DATABASE_URL || "").trim());
}

function normalizeKey(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  // allow simple pajbot-style keys: letters/numbers/_-:
  return raw.replace(/[^a-z0-9_:\-]/g, "");
}

function buildEmpty() {
  return { version: 1, counts: {} };
}

export function createNamedCountStore({
  instance,
  schema,
  stateKey = "named_counts",
  flushDebounceMs = 5000,
  flushIntervalMs = 60000,
  logger = console,
} = {}) {
  const inst = String(instance || "").trim() || String(process.env.INSTANCE_NAME || "default").trim() || "default";
  const sch = String(schema || "").trim() || resolveStateSchema();

  if (!hasDatabaseUrl()) {
    return {
      get: () => 0,
      update: () => 0,
      flushNow: async () => {},
      getSnapshot: () => ({ version: 1, counts: {} }),
    };
  }

  let loaded = false;
  let base = buildEmpty();
  const pending = new Map(); // key -> delta

  let loadPromise = null;
  let flushPromise = null;
  let debounceTimer = null;
  let intervalTimer = null;

  async function ensureLoaded() {
    if (loaded) return base;
    if (loadPromise) return loadPromise;
    loadPromise = (async () => {
      await ensureStateTable({ schema: sch });
      const value = await readStateValue({ schema: sch, instance: inst, key: stateKey, fallback: buildEmpty() });
      if (value && typeof value === "object" && value.counts && typeof value.counts === "object") {
        base = { version: 1, counts: { ...value.counts } };
      } else {
        base = buildEmpty();
      }
      loaded = true;
      return base;
    })().finally(() => {
      loadPromise = null;
    });
    return loadPromise;
  }

  function scheduleDebouncedFlush() {
    if (debounceTimer) return;
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      void flushInternal();
    }, Math.max(250, Number(flushDebounceMs) || 5000));
    debounceTimer.unref?.();
  }

  function ensureInterval() {
    if (intervalTimer) return;
    intervalTimer = setInterval(() => {
      if (pending.size === 0) return;
      void flushInternal();
    }, Math.max(1000, Number(flushIntervalMs) || 60000));
    intervalTimer.unref?.();
  }

  async function flushInternal() {
    if (flushPromise) return flushPromise;
    if (pending.size === 0) return;

    flushPromise = (async () => {
      await ensureLoaded();
      for (const [k, delta] of pending.entries()) {
        const prev = Number(base.counts[k] || 0);
        const next = prev + Number(delta || 0);
        base.counts[k] = Number.isFinite(next) ? Math.floor(next) : prev;
      }
      pending.clear();
      await writeStateValue({ schema: sch, instance: inst, key: stateKey, value: base });
    })()
      .catch((e) => {
        logger?.warn?.("[named_counts] flush failed:", String(e?.message || e));
      })
      .finally(() => {
        flushPromise = null;
      });

    return flushPromise;
  }

  function get(key) {
    const k = normalizeKey(key);
    if (!k) return 0;
    const baseV = Number(base?.counts?.[k] || 0);
    const pendingV = Number(pending.get(k) || 0);
    const v = baseV + pendingV;
    return Number.isFinite(v) ? Math.floor(v) : 0;
  }

  function update(key, delta = 1) {
    const k = normalizeKey(key);
    if (!k) return 0;
    const d = Number(delta);
    const inc = Number.isFinite(d) ? Math.floor(d) : 0;
    pending.set(k, Number(pending.get(k) || 0) + inc);
    ensureInterval();
    scheduleDebouncedFlush();
    void ensureLoaded().catch(() => {});
    return get(k);
  }

  async function flushNow() {
    try {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
      await flushInternal();
    } catch {}
  }

  function getSnapshot() {
    const counts = { ...(base?.counts || {}) };
    for (const [k, delta] of pending.entries()) {
      counts[k] = Math.floor(Number(counts[k] || 0) + Number(delta || 0));
    }
    return { version: 1, counts };
  }

  return { get, update, flushNow, getSnapshot };
}

