import { getPgPool, normalizePgIdentifier } from "./db.js";

export async function ensureStateTable({ schema }) {
  const safeSchema = normalizePgIdentifier(schema);
  if (!safeSchema) {
    throw new Error("Invalid schema name (only a-z0-9_ allowed).");
  }

  const pool = getPgPool();
  await pool.query(`create schema if not exists ${safeSchema}`);
  await pool.query(
    `create table if not exists ${safeSchema}.mainsbot_state (` +
      `instance text not null, ` +
      `key text not null, ` +
      `value jsonb not null, ` +
      `updated_at timestamptz not null default now(), ` +
      `primary key (instance, key)` +
      `)`
  );
  return safeSchema;
}

export async function readStateValue({ schema, instance, key, fallback = null }) {
  const safeSchema = normalizePgIdentifier(schema);
  if (!safeSchema) throw new Error("Invalid schema name.");
  const inst = String(instance || "").trim();
  const k = String(key || "").trim();
  if (!inst) throw new Error("Missing instance.");
  if (!k) throw new Error("Missing key.");

  const pool = getPgPool();
  const res = await pool.query(
    `select value from ${safeSchema}.mainsbot_state where instance=$1 and key=$2`,
    [inst, k]
  );
  if (!res?.rows?.length) return fallback;
  return res.rows[0]?.value ?? fallback;
}

export async function writeStateValue({ schema, instance, key, value }) {
  const safeSchema = normalizePgIdentifier(schema);
  if (!safeSchema) throw new Error("Invalid schema name.");
  const inst = String(instance || "").trim();
  const k = String(key || "").trim();
  if (!inst) throw new Error("Missing instance.");
  if (!k) throw new Error("Missing key.");

  const pool = getPgPool();
  await pool.query(
    `insert into ${safeSchema}.mainsbot_state (instance, key, value) values ($1,$2,$3) ` +
      `on conflict (instance, key) do update set value=excluded.value, updated_at=now()`,
    [inst, k, value]
  );
}

