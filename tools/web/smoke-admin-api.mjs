import http from "http";
import https from "https";

const BASE = String(process.env.SMOKE_BASE_URL || "http://127.0.0.1:8787").trim();
const ADMIN_COOKIE = String(process.env.SMOKE_ADMIN_COOKIE || "").trim();

function requestText(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === "https:" ? https : http;
    const req = lib.request(
      {
        protocol: u.protocol,
        hostname: u.hostname,
        port: u.port || (u.protocol === "https:" ? 443 : 80),
        path: `${u.pathname}${u.search}`,
        method: "GET",
        headers,
      },
      (res) => {
        let data = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          resolve({ status: Number(res.statusCode || 0), body: data });
        });
      }
    );
    req.on("error", reject);
    req.end();
  });
}

function buildHeaders() {
  const headers = { accept: "application/json" };
  if (ADMIN_COOKIE) headers.cookie = ADMIN_COOKIE;
  return headers;
}

async function check(path, { expectAuth = false } = {}) {
  const { status, body } = await requestText(`${BASE}${path}`, buildHeaders());
  const ok = (status >= 200 && status < 300) || (expectAuth && (status === 401 || status === 403));
  if (!ok) {
    throw new Error(`${path} failed (${status}): ${String(body || "").slice(0, 300)}`);
  }
  console.log(`[smoke] ${path} -> ${status}`);
}

async function main() {
  await check("/api/status");
  await check("/api/commands");
  await check("/api/commands?platform=discord");

  const adminChecks = [
    "/api/admin/session",
    "/api/admin/activity?limit=5",
    "/api/admin/custom-commands",
    "/api/admin/analytics/commands?days=7&platform=all&limit=5",
    "/api/admin/health",
  ];

  for (const path of adminChecks) {
    await check(path, { expectAuth: !ADMIN_COOKIE });
  }

  console.log("[smoke] done");
}

main().catch((e) => {
  console.error("[smoke] failed:", String(e?.message || e));
  process.exit(1);
});

