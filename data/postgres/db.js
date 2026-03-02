import pg from "pg";
import { resolveInstanceName } from "../../bot/functions/instance.js";

let pool = null;

function normalizeSslMode(value) {
  return String(value || "").trim().toLowerCase();
}

function buildPoolConfig() {
  const connectionString =
    String(process.env.DATABASE_URL || "").trim() ||
    "postgresql://mainsbot@127.0.0.1:5432/mainsbot";

  const sslmode = normalizeSslMode(process.env.PGSSLMODE || process.env.PGSSL || "");
  const ssl =
    !sslmode || sslmode === "disable" || sslmode === "off"
      ? false
      : sslmode === "verify-full" || sslmode === "verify-ca"
        ? { rejectUnauthorized: true }
        : { rejectUnauthorized: false };

  return { connectionString, ssl };
}

export function getPgPool() {
  if (pool) return pool;
  const { Pool } = pg;
  pool = new Pool(buildPoolConfig());
  return pool;
}

export async function closePgPool() {
  if (!pool) return;
  const p = pool;
  pool = null;
  await p.end();
}

export function normalizePgIdentifier(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const safe = raw.toLowerCase().replace(/[^a-z0-9_]/g, "");
  if (!safe) return "";
  return safe;
}

export function resolveStateSchema() {
  const instance = normalizePgIdentifier(resolveInstanceName()) || "default";
  const defaultSchema = `mainsbot_${instance}`;
  const raw =
    String(process.env.DATABASE_SCHEMA || process.env.PGSCHEMA || "").trim() ||
    defaultSchema;
  const schema = normalizePgIdentifier(raw) || defaultSchema;
  return schema;
}
