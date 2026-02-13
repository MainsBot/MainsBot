import { bootstrapConfig } from "../../config/bootstrap.js";

// Load INI so DISCORD_BOT_TOKEN/GUILD_ID/DATA_DIR are available.
await bootstrapConfig();

const { ensureGamepingRolesDump } = await import("../../bot/modules/gamepingRoles.js");

// Force a dump for this one-off tool run.
process.env.GAMEPING_ROLES_AUTO_DUMP = "1";
process.env.GAMEPING_ROLES_DUMP_MODE = "always";

const res = await ensureGamepingRolesDump({ logger: console });
if (!res?.ran) {
  process.exitCode = 1;
}

