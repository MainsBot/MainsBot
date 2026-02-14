import { resolveStateSchema } from "../../data/postgres/db.js";
import { ensureStateTable, readStateValue, writeStateValue } from "../../data/postgres/stateStore.js";

function normalizeCommand(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw.startsWith("!")) return "";
  const cmd = raw.split(/\s+/)[0] || "";
  // keep it reasonably safe as a key
  return cmd.replace(/[^!a-z0-9_:.]/g, "");
}

function hasDatabaseUrl() {
  return Boolean(String(process.env.DATABASE_URL || "").trim());
}

function buildEmpty() {
  return { version: 1, counts: {} };
}

export function createCommandCounter({
  instance,
  schema,
  stateKey = "command_counts",
  flushDebounceMs = 5000,
  flushIntervalMs = 60000,
  logger = console,
} = {}) {
  const inst = String(instance || "").trim() || String(process.env.INSTANCE_NAME || "default").trim() || "default";
  const sch = String(schema || "").trim() || resolveStateSchema();

  if (!hasDatabaseUrl()) {
    return {
      record: () => {},
      flushNow: async () => {},
      getSnapshot: () => ({ version: 1, counts: {} }),
    };
  }

  let loaded = false;
  let base = buildEmpty();
  const pending = new Map(); // cmd -> delta

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

  async function flushInternal() {
    if (flushPromise) return flushPromise;
    if (pending.size === 0) return;

    flushPromise = (async () => {
      await ensureLoaded();

      for (const [cmd, delta] of pending.entries()) {
        if (!cmd) continue;
        const prev = Number(base.counts[cmd] || 0);
        const next = prev + Number(delta || 0);
        base.counts[cmd] = Number.isFinite(next) && next > 0 ? Math.floor(next) : 0;
      }
      pending.clear();

      await writeStateValue({ schema: sch, instance: inst, key: stateKey, value: base });
    })()
      .catch((e) => {
        logger?.warn?.("[command_counts] flush failed:", String(e?.message || e));
      })
      .finally(() => {
        flushPromise = null;
      });

    return flushPromise;
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

  function record(commandText) {
    try {
      const cmd = normalizeCommand(commandText);
      if (!cmd) return;
      pending.set(cmd, Number(pending.get(cmd) || 0) + 1);
      ensureInterval();
      scheduleDebouncedFlush();
      // kick off load in background so first flush doesn't pay cold start
      void ensureLoaded().catch(() => {});
    } catch {}
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
    for (const [cmd, delta] of pending.entries()) {
      counts[cmd] = Math.floor(Number(counts[cmd] || 0) + Number(delta || 0));
    }
    return { version: 1, counts };
  }

  return { record, flushNow, getSnapshot };
}

