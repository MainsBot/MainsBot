import { bootstrapConfig } from "./config/bootstrap.js";
import { initStateInterceptor } from "./data/postgres/stateInterceptor.js";

const boot = await bootstrapConfig();
console.log(
  `[config] mode=${boot.mode} config=${process.env.MAINSBOT_CONFIG || "n/a"} origin=${process.env.WEB_ORIGIN || process.env.WEB_BASE_URL || "auto"} host=${process.env.WEB_HOST || "auto"} port=${process.env.WEB_PORT || "auto"} socket=${process.env.WEB_SOCKET_PATH || "auto"}`
);

await initStateInterceptor();

// Optional: dump Discord ping roles on startup for the !gameping module.
try {
  const enabled = String(process.env.MODULE_GAMEPING ?? "").trim();
  const autoDump = String(process.env.GAMEPING_ROLES_AUTO_DUMP ?? "").trim();
  const wantDump =
    /^(1|true|yes|on)$/i.test(enabled || "1") &&
    /^(1|true|yes|on)$/i.test(autoDump || "0");

  if (wantDump) {
    const { ensureGamepingRolesDump } = await import("./bot/discord/gamepingRoles.js");
    await ensureGamepingRolesDump({ logger: console });
  }
} catch (e) {
  console.warn("[gameping][roles] startup dump failed:", String(e?.message || e));
}

await import("./bot/app.js");
