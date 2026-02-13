import fs from "fs";
import path from "path";
import { Client, GatewayIntentBits } from "discord.js";

function flagFromValue(value) {
  return /^(1|true|yes|on)$/i.test(String(value ?? "").trim());
}

function normalizeChannelLogin(value) {
  return String(value || "")
    .trim()
    .replace(/^[@#]+/, "")
    .toLowerCase();
}

function readDataDir() {
  return String(process.env.DATA_DIR || "").trim();
}

function resolveDefaultOutPath() {
  const dataDir = readDataDir();
  if (dataDir) return path.resolve(dataDir, "d", "game_pings.json");
  return path.resolve(process.cwd(), "game_pings.json");
}

function resolveOutPath() {
  const configured = String(process.env.GAMEPING_ROLES_PATH || "").trim();
  return path.resolve(configured || resolveDefaultOutPath());
}

function ensureDirFor(filePath) {
  const dir = path.dirname(String(filePath || ""));
  if (!dir || dir === "." || dir === filePath) return;
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readDumpMode() {
  const raw = String(process.env.GAMEPING_ROLES_DUMP_MODE || "missing").trim().toLowerCase();
  if (raw === "always") return "always";
  if (raw === "stale") return "stale";
  return "missing";
}

function readStaleHours() {
  const n = Number(process.env.GAMEPING_ROLES_STALE_HOURS ?? 24);
  return Number.isFinite(n) && n >= 0 ? n : 24;
}

function shouldDump(outPath) {
  const enabled = flagFromValue(process.env.GAMEPING_ROLES_AUTO_DUMP ?? "0");
  if (!enabled) return false;

  const mode = readDumpMode();
  if (mode === "always") return true;

  const backend = String(process.env.STATE_BACKEND || "file").trim().toLowerCase();
  const isPostgres = backend === "postgres" || backend === "pg";

  if (!fs.existsSync(outPath)) return true;

  // In Postgres mode, the "file" always exists. Treat empty/default payload as missing.
  if (isPostgres) {
    try {
      const parsed = JSON.parse(String(fs.readFileSync(outPath, "utf8") || ""));
      const pingCount = parsed?.pings && typeof parsed.pings === "object"
        ? Object.keys(parsed.pings).length
        : 0;
      const hasGeneratedAt = Boolean(parsed?.generatedAt);
      if (pingCount === 0 || !hasGeneratedAt) return true;
    } catch {
      return true;
    }
  }

  if (mode === "missing") return false;

  const hours = readStaleHours();
  if (hours === 0) return true;
  const ms = hours * 60 * 60 * 1000;

  // In Postgres mode, the roles file is virtual (stored in DB), so statSync isn't meaningful.
  // Use the stored JSON's generatedAt timestamp instead.
  if (isPostgres) {
    try {
      const parsed = JSON.parse(String(fs.readFileSync(outPath, "utf8") || ""));
      const t = Date.parse(String(parsed?.generatedAt || ""));
      if (!Number.isFinite(t)) return true;
      return Date.now() - t > ms;
    } catch {
      return true;
    }
  }

  try {
    const stat = fs.statSync(outPath);
    const age = Date.now() - Number(stat.mtimeMs || 0);
    return age > ms;
  } catch {
    return true;
  }
}

function parseExcludeRoleNames() {
  const raw = String(process.env.GAMEPING_ROLES_EXCLUDE || "").trim();
  const entries = raw
    ? raw.split(/[,\r\n]+/).map((s) => s.trim()).filter(Boolean)
    : [];
  const set = new Set(["Anti Ghost Ping"]);
  for (const name of entries) set.add(name);
  return set;
}

function keyFromRoleName(roleName) {
  return String(roleName || "")
    .replace(/\s*ping\s*$/i, "")
    .trim()
    .toLowerCase();
}

function labelFromRoleName(roleName) {
  return String(roleName || "").replace(/\s*ping\s*$/i, "").trim();
}

export function isDiscordRoleDumpConfigured() {
  const token = String(process.env.DISCORD_BOT_TOKEN || "").trim();
  const guildId = String(process.env.GUILD_ID || "").trim();
  return Boolean(token && guildId);
}

export async function ensureGamepingRolesDump({ logger = console } = {}) {
  const outPath = resolveOutPath();
  if (!shouldDump(outPath)) return { ran: false, outPath };

  const token = String(process.env.DISCORD_BOT_TOKEN || "").trim();
  const guildId = String(process.env.GUILD_ID || "").trim();
  if (!token || !guildId) {
    logger?.warn?.("[gameping][roles] DISCORD_BOT_TOKEN/GUILD_ID missing; cannot dump roles.");
    return { ran: false, outPath, reason: "missing_discord_config" };
  }

  ensureDirFor(outPath);

  const EXCLUDE_ROLE_NAMES = parseExcludeRoleNames();
  const output = {
    generatedAt: new Date().toISOString(),
    guildId,
    gameChangeRoleId: null,
    pings: {},
  };

  const client = new Client({ intents: [GatewayIntentBits.Guilds] });

  try {
    await client.login(token);
    const guild = await client.guilds.fetch(guildId);
    const roles = await guild.roles.fetch();

    for (const role of roles.values()) {
      const name = role.name;
      if (EXCLUDE_ROLE_NAMES.has(name)) continue;

      if (/^game change ping$/i.test(name)) {
        output.gameChangeRoleId = role.id;
        continue;
      }

      if (!/\bping\b/i.test(name)) continue;

      const key = keyFromRoleName(name);
      const label = labelFromRoleName(name);
      if (!key) continue;

      output.pings[key] = { label, roleId: role.id };
    }

    fs.writeFileSync(outPath, JSON.stringify(output, null, 2), "utf8");
    logger?.log?.(
      `[gameping][roles] dumped ${Object.keys(output.pings).length} ping roles -> ${outPath}`
    );
    return { ran: true, outPath, count: Object.keys(output.pings).length };
  } catch (e) {
    logger?.warn?.("[gameping][roles] dump failed:", String(e?.message || e));
    return { ran: false, outPath, reason: "error", error: String(e?.message || e) };
  } finally {
    try {
      await client.destroy?.();
    } catch {}
  }
}
