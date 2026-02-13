import fetch from "node-fetch";

import { bootstrapConfig } from "../../config/bootstrap.js";
import { initStateInterceptor, shutdownStateInterceptor } from "../../data/postgres/stateInterceptor.js";
import { startWebServer } from "../../bot/web/server.js";

function parseArgs(argv = process.argv) {
  const args = Array.from(argv || []);
  const out = Object.create(null);
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--config" || a === "-c") {
      out.config = args[i + 1];
      i++;
      continue;
    }
    if (a === "--url" || a === "-u") {
      out.url = args[i + 1];
      i++;
      continue;
    }
  }
  return out;
}

const args = parseArgs(process.argv);
if (args.config) process.env.MAINSBOT_CONFIG = String(args.config);

await bootstrapConfig();
await initStateInterceptor();

const web = startWebServer({});

const host = String(process.env.WEB_HOST || "127.0.0.1").trim() || "127.0.0.1";
const port = Number(process.env.WEB_PORT || 8787);
const targetUrl = String(args.url || `http://${host}:${port}/`);

try {
  const res = await fetch(targetUrl, { redirect: "manual" });
  const ct = res.headers.get("content-type") || "";
  const text = await res.text().catch(() => "");
  console.log(`[web] ${targetUrl} -> ${res.status} content-type=${ct} bytes=${text.length}`);
} finally {
  try {
    web?.stop?.();
  } catch {}
  await shutdownStateInterceptor();
}

