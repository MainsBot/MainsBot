import pg from "pg";

let pool = null;

function normalizeSslMode(value) {
  return String(value || "").trim().toLowerCase();
}

function buildPoolConfig() {
  const connectionString = String(process.env.DATABASE_URL || "").trim();
  if (!connectionString) {
    throw new Error("DATABASE_URL is missing (set it in your INI [database].url).");
  }

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
  const raw =
    String(process.env.DATABASE_SCHEMA || process.env.PGSCHEMA || "").trim() ||
    "public";
  const schema = normalizePgIdentifier(raw) || "public";
  return schema;
}

