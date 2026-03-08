import fetch from "node-fetch";

const STREAMLABS_API_BASE = "https://streamlabs.com/api/v2.0";
const DONATION_CACHE_TTL_MS = 5 * 60 * 1000;
const donationQueryCache = new Map();

function asSafeText(value, max = 120) {
  const out = String(value ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .trim();
  return out.length > max ? `${out.slice(0, max)}...` : out;
}

function normalizeLookup(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^@+/, "")
    .replace(/[^a-z0-9]+/g, "");
}

function buildCandidateLookups(row = {}) {
  return Array.from(
    new Set(
      [
        row?.name,
        row?.from,
        row?.username,
        row?.twitch_username,
        row?.twitchUsername,
        row?.payer,
      ]
        .map((value) => normalizeLookup(value))
        .filter(Boolean)
    )
  );
}

function parseAmount(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return 0;
  const clean = raw.replace(/[^\d.,-]/g, "");
  if (!clean) return 0;

  let normalized = clean;
  if (normalized.includes(",") && normalized.includes(".")) {
    normalized =
      normalized.lastIndexOf(",") > normalized.lastIndexOf(".")
        ? normalized.replace(/\./g, "").replace(",", ".")
        : normalized.replace(/,/g, "");
  } else if (normalized.includes(",") && !normalized.includes(".")) {
    normalized = normalized.replace(",", ".");
  }

  const amount = Number(normalized);
  return Number.isFinite(amount) ? Math.max(0, amount) : 0;
}

async function fetchStreamlabsJson({ accessToken, path, searchParams = {} }) {
  const token = String(accessToken || "").trim();
  if (!token) throw new Error("Missing Streamlabs access token");

  const url = new URL(`${STREAMLABS_API_BASE}${path}`);
  for (const [key, value] of Object.entries(searchParams || {})) {
    if (value == null || value === "") continue;
    url.searchParams.set(key, String(value));
  }

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });

  const text = await response.text().catch(() => "");
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (!response.ok) {
    const message =
      json?.error?.message ||
      json?.message ||
      text ||
      response.statusText ||
      "request_failed";
    throw new Error(`Streamlabs HTTP ${response.status}: ${message}`);
  }

  return json;
}

export async function getStreamlabsDonationTotalByName({
  accessToken = process.env.STREAMLABS_ACCESS_TOKEN,
  lookup,
  limit = 100,
  maxPages = 40,
} = {}) {
  const token = String(accessToken || "").trim();
  const normalizedLookup = normalizeLookup(lookup);
  if (!token) {
    return {
      enabled: false,
      totalUsd: 0,
      matchedCount: 0,
      skippedNonUsd: 0,
      source: "disabled",
    };
  }
  if (!normalizedLookup) {
    return {
      enabled: true,
      totalUsd: 0,
      matchedCount: 0,
      skippedNonUsd: 0,
      source: "api",
    };
  }

  const cacheKey = `${token.slice(-8)}:${normalizedLookup}`;
  const cached = donationQueryCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  let totalUsd = 0;
  let matchedCount = 0;
  let skippedNonUsd = 0;
  let before = "";
  let pages = 0;

  while (pages < Math.max(1, Math.floor(Number(maxPages) || 40))) {
    pages += 1;
    const json = await fetchStreamlabsJson({
      accessToken: token,
      path: "/donations",
      searchParams: {
        limit: Math.max(1, Math.min(100, Math.floor(Number(limit) || 100))),
        ...(before ? { before } : {}),
      },
    });

    const rows = Array.isArray(json?.data) ? json.data : [];
    if (!rows.length) break;

    for (const row of rows) {
      const candidates = buildCandidateLookups(row);
      if (!candidates.includes(normalizedLookup)) continue;

      const currency = String(
        row?.currency || row?.currency_code || row?.currencyCode || "USD"
      )
        .trim()
        .toUpperCase();

      if (currency && currency !== "USD") {
        skippedNonUsd += 1;
        continue;
      }

      totalUsd += parseAmount(
        row?.amount ?? row?.amount_raw ?? row?.formatted_amount ?? row?.amount_formatted
      );
      matchedCount += 1;
    }

    const lastRow = rows[rows.length - 1];
    const nextBefore = String(
      lastRow?.donation_id || lastRow?.id || lastRow?.created_at || ""
    ).trim();
    if (!nextBefore || nextBefore === before) break;
    before = nextBefore;
  }

  const value = {
    enabled: true,
    totalUsd: Number(totalUsd.toFixed(2)),
    matchedCount,
    skippedNonUsd,
    source: "api",
    lookup: asSafeText(lookup || "", 64),
  };

  donationQueryCache.set(cacheKey, {
    expiresAt: Date.now() + DONATION_CACHE_TTL_MS,
    value,
  });

  return value;
}
