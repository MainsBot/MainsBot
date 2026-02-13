import fs from "fs";
import path from "path";

import { bootstrapConfig } from "../../config/bootstrap.js";
import { getPgPool, normalizePgIdentifier, resolveStateSchema } from "../../data/postgres/db.js";

function parseArgs(argv = process.argv) {
  const out = Object.create(null);
  const args = Array.from(argv || []);
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--config" || a === "-c") {
      out.config = args[i + 1];
      i++;
      continue;
    }
    if (a === "--file" || a === "-f") {
      out.file = args[i + 1];
      i++;
      continue;
    }
  }
  return out;
}

function asAbs(p) {
  if (!p) return "";
  return path.isAbsolute(p) ? p : path.resolve(process.cwd(), p);
}

function readJsonFile(filePath) {
  const abs = asAbs(filePath);
  const raw = fs.readFileSync(abs, "utf8");
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`Invalid JSON: ${abs}`);
  }
}

async function ensureSchemaAndTable(schema) {
  const safe = normalizePgIdentifier(schema);
  if (!safe) throw new Error("Invalid DATABASE_SCHEMA (only a-z0-9_ allowed).");
  const pool = getPgPool();
  await pool.query(`create schema if not exists ${safe}`);
  await pool.query(
    `create table if not exists ${safe}.mainsbot_state (` +
      `instance text not null, ` +
      `key text not null, ` +
      `value jsonb not null, ` +
      `updated_at timestamptz not null default now(), ` +
      `primary key (instance, key)` +
      `)`
  );
}

const args = parseArgs(process.argv);
if (args.config) process.env.MAINSBOT_CONFIG = args.config;

await bootstrapConfig();

const instance = String(process.env.INSTANCE_NAME || "default").trim() || "default";
const schema = resolveStateSchema();
await ensureSchemaAndTable(schema);

const filePath =
  String(args.file || "").trim() ||
  String(process.env.WORDS_PATH || "").trim() ||
  "./WORDS.json";

const words = readJsonFile(filePath);
if (!words || typeof words !== "object") {
  throw new Error("WORDS.json must be a JSON object.");
}

const safeSchema = normalizePgIdentifier(schema);
const pool = getPgPool();
await pool.query(
  `insert into ${safeSchema}.mainsbot_state (instance, key, value) values ($1,$2,$3) ` +
    `on conflict (instance, key) do update set value=excluded.value, updated_at=now()`,
  [instance, "words", words]
);

console.log(
  `[db] imported words -> schema=${safeSchema} instance=${instance} key=words from=${asAbs(filePath)}`
);

