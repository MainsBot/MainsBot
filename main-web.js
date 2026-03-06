import { bootstrapConfig } from "./config/bootstrap.js";
import { initStateInterceptor, shutdownStateInterceptor } from "./data/postgres/stateInterceptor.js";
import { startWebServer } from "./bot/web/server.js";

const boot = await bootstrapConfig();
console.log(
  `[web-config] mode=${boot.mode} config=${process.env.MAINSBOT_CONFIG || "n/a"} listen=${process.env.WEB_LISTEN || "auto"} origin=${process.env.WEB_ORIGIN || process.env.WEB_BASE_URL || "auto"} host=${process.env.WEB_HOST || "auto"} port=${process.env.WEB_PORT || "auto"} socket=${process.env.WEB_SOCKET_PATH || "auto"} overlay_socket=${process.env.WEB_OVERLAY_SOCKET_PATH || "auto"}`
);

await initStateInterceptor();

const WEB = startWebServer({});

async function gracefulShutdown(signal = "shutdown") {
  try {
    console.log(`[web-shutdown] ${signal}: stopping web server...`);
    try {
      WEB?.stop?.();
    } catch {}
    await shutdownStateInterceptor();
  } catch (e) {
    console.warn("[web-shutdown] failed:", String(e?.message || e));
  } finally {
    process.exit(0);
  }
}

process.on("SIGINT", () => void gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => void gracefulShutdown("SIGTERM"));
