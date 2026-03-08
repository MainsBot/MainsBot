import { ensureStateTable, readStateValue, writeStateValue } from "./stateStore.js";
import { resolveStateSchema } from "./db.js";
import { resolveInstanceName } from "../../bot/functions/instance.js";

const STATE_KEY = "donation_totals";
const VERSION = 1;

function normalizeSchema(schema) {
  const s = String(schema || "").trim();
  return s || resolveStateSchema();
}

function normalizeInstance(instance) {
  return resolveInstanceName({ instanceName: instance });
}

function asSafeText(value, max = 120) {
  const out = String(value ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .trim();
  return out.length > max ? `${out.slice(0, max)}...` : out;
}

function asIsoTs(value) {
  const raw = String(value || "").trim();
  if (!raw) return new Date().toISOString();
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : new Date().toISOString();
}

function asNonNegativeNumber(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return Math.max(0, Number(fallback) || 0);
  return Math.max(0, Number(n));
}

function asCount(value, fallback = 0) {
  return Math.max(0, Math.floor(asNonNegativeNumber(value, fallback)));
}

function normalizePlatform(value) {
  const raw = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

  if (raw === "streamlabs" || raw === "donation" || raw === "donations") {
    return "streamlabs";
  }
  if (raw === "twitch_bits" || raw === "bits" || raw === "cheer" || raw === "cheers") {
    return "twitch_bits";
  }
  if (
    raw === "twitch_subs" ||
    raw === "subs" ||
    raw === "sub" ||
    raw === "subscription" ||
    raw === "subscriptions"
  ) {
    return "twitch_subs";
  }
  if (
    raw === "twitch_gifts" ||
    raw === "gifts" ||
    raw === "gift" ||
    raw === "subgift" ||
    raw === "gift_subs"
  ) {
    return "twitch_gifts";
  }
  return "";
}

function normalizeAliasValue(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^@+/, "");
}

function normalizeCompactAlias(value) {
  return normalizeAliasValue(value).replace(/[^a-z0-9]+/g, "");
}

function buildAliases(values = []) {
  const out = new Set();
  const list = Array.isArray(values) ? values : [values];
  for (const value of list) {
    const plain = normalizeAliasValue(value);
    const compact = normalizeCompactAlias(value);
    if (plain) out.add(plain);
    if (compact) out.add(compact);
  }
  return Array.from(out);
}

function buildRecordKey({ userId, login, aliases }) {
  const safeUserId = asSafeText(userId || "", 64);
  if (safeUserId) return `id:${safeUserId}`;
  const aliasList = buildAliases([login, ...(Array.isArray(aliases) ? aliases : [])]);
  const stableAlias = aliasList.find(Boolean) || `anon_${Date.now()}`;
  return `alias:${stableAlias}`;
}

function createEmptyRecord() {
  const now = new Date().toISOString();
  return {
    userId: "",
    login: "",
    displayName: "",
    aliases: [],
    totals: {
      streamlabsUsd: 0,
      twitchBitsUsd: 0,
      twitchSubsUsd: 0,
      twitchGiftSubsUsd: 0,
    },
    counts: {
      streamlabs: 0,
      twitchBits: 0,
      twitchSubs: 0,
      twitchGifts: 0,
    },
    raw: {
      streamlabsDonations: 0,
      bits: 0,
      subs: 0,
      gifts: 0,
    },
    createdAt: now,
    updatedAt: now,
  };
}

function normalizeRecord(input = {}) {
  const src = input && typeof input === "object" ? input : {};
  const base = createEmptyRecord();
  return {
    userId: asSafeText(src.userId || "", 64),
    login: asSafeText(src.login || "", 64).toLowerCase(),
    displayName: asSafeText(src.displayName || "", 64),
    aliases: buildAliases(src.aliases || []),
    totals: {
      streamlabsUsd: asNonNegativeNumber(src?.totals?.streamlabsUsd, 0),
      twitchBitsUsd: asNonNegativeNumber(src?.totals?.twitchBitsUsd, 0),
      twitchSubsUsd: asNonNegativeNumber(src?.totals?.twitchSubsUsd, 0),
      twitchGiftSubsUsd: asNonNegativeNumber(src?.totals?.twitchGiftSubsUsd, 0),
    },
    counts: {
      streamlabs: asCount(src?.counts?.streamlabs, 0),
      twitchBits: asCount(src?.counts?.twitchBits, 0),
      twitchSubs: asCount(src?.counts?.twitchSubs, 0),
      twitchGifts: asCount(src?.counts?.twitchGifts, 0),
    },
    raw: {
      streamlabsDonations: asNonNegativeNumber(src?.raw?.streamlabsDonations, 0),
      bits: asCount(src?.raw?.bits, 0),
      subs: asCount(src?.raw?.subs, 0),
      gifts: asCount(src?.raw?.gifts, 0),
    },
    createdAt: asIsoTs(src.createdAt || base.createdAt),
    updatedAt: asIsoTs(src.updatedAt || base.updatedAt),
  };
}

function normalizeState(value) {
  const src = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const usersIn = src.users && typeof src.users === "object" && !Array.isArray(src.users) ? src.users : {};
  const users = {};
  for (const [key, record] of Object.entries(usersIn)) {
    const safeKey = asSafeText(key, 160);
    if (!safeKey) continue;
    users[safeKey] = normalizeRecord(record);
  }
  return {
    version: VERSION,
    users,
  };
}

function getRecordAliases(record = {}) {
  const aliases = new Set();
  for (const alias of buildAliases(record.aliases || [])) aliases.add(alias);
  for (const alias of buildAliases([record.login, record.displayName])) aliases.add(alias);
  return aliases;
}

function findRecordKey(users = {}, { userId, login, displayName, aliases = [] } = {}) {
  const safeUserId = asSafeText(userId || "", 64);
  if (safeUserId) {
    for (const [key, record] of Object.entries(users)) {
      if (String(record?.userId || "").trim() === safeUserId) return key;
    }
  }

  const wantedAliases = buildAliases([login, displayName, ...(Array.isArray(aliases) ? aliases : [])]);
  if (!wantedAliases.length) return "";

  for (const [key, record] of Object.entries(users)) {
    const recordAliases = getRecordAliases(record);
    for (const alias of wantedAliases) {
      if (recordAliases.has(alias)) return key;
    }
  }

  return "";
}

function applyContribution(record, contribution) {
  const next = normalizeRecord(record);
  const platform = normalizePlatform(contribution?.platform);
  if (!platform) return next;

  const amountUsd = asNonNegativeNumber(contribution?.amountUsd, 0);
  const count = asCount(contribution?.count, 1);
  const rawUnits = asNonNegativeNumber(contribution?.rawUnits, 0);
  const login = asSafeText(contribution?.login || "", 64).toLowerCase();
  const displayName = asSafeText(contribution?.displayName || "", 64);
  const userId = asSafeText(contribution?.userId || "", 64);
  const aliasValues = buildAliases([
    login,
    displayName,
    ...(Array.isArray(contribution?.aliases) ? contribution.aliases : []),
  ]);

  if (userId && !next.userId) next.userId = userId;
  if (login && !next.login) next.login = login;
  if (displayName && !next.displayName) next.displayName = displayName;

  const aliasSet = new Set(getRecordAliases(next));
  for (const alias of aliasValues) aliasSet.add(alias);
  next.aliases = Array.from(aliasSet).sort();

  if (platform === "streamlabs") {
    next.totals.streamlabsUsd += amountUsd;
    next.counts.streamlabs += count;
    next.raw.streamlabsDonations += rawUnits || amountUsd;
  } else if (platform === "twitch_bits") {
    next.totals.twitchBitsUsd += amountUsd;
    next.counts.twitchBits += count;
    next.raw.bits += asCount(rawUnits, 0);
  } else if (platform === "twitch_subs") {
    next.totals.twitchSubsUsd += amountUsd;
    next.counts.twitchSubs += count;
    next.raw.subs += count;
  } else if (platform === "twitch_gifts") {
    next.totals.twitchGiftSubsUsd += amountUsd;
    next.counts.twitchGifts += count;
    next.raw.gifts += count;
  }

  next.updatedAt = new Date().toISOString();
  return next;
}

export async function appendDonationContributionState({
  schema,
  instance,
  contribution,
} = {}) {
  const safeSchema = normalizeSchema(schema);
  const safeInstance = normalizeInstance(instance);
  const platform = normalizePlatform(contribution?.platform);
  if (!platform) return { appended: false, reason: "invalid_platform" };

  await ensureStateTable({ schema: safeSchema });
  const current = await readStateValue({
    schema: safeSchema,
    instance: safeInstance,
    key: STATE_KEY,
    fallback: { version: VERSION, users: {} },
  });
  const state = normalizeState(current);
  const existingKey = findRecordKey(state.users, contribution || {});
  const key = existingKey || buildRecordKey(contribution || {});
  const currentRecord = state.users[key] || createEmptyRecord();
  state.users[key] = applyContribution(currentRecord, contribution || {});

  await writeStateValue({
    schema: safeSchema,
    instance: safeInstance,
    key: STATE_KEY,
    value: state,
  });

  return { appended: true, key, record: state.users[key] };
}

export async function readDonationSummaryState({
  schema,
  instance,
  lookup,
} = {}) {
  const safeSchema = normalizeSchema(schema);
  const safeInstance = normalizeInstance(instance);
  const rawLookup = asSafeText(lookup || "", 64);
  const aliases = buildAliases([rawLookup]);

  await ensureStateTable({ schema: safeSchema });
  const current = await readStateValue({
    schema: safeSchema,
    instance: safeInstance,
    key: STATE_KEY,
    fallback: { version: VERSION, users: {} },
  });
  const state = normalizeState(current);
  const key = findRecordKey(state.users, {
    login: rawLookup,
    displayName: rawLookup,
    aliases,
  });
  const record = key ? normalizeRecord(state.users[key]) : null;

  const totals = {
    streamlabsUsd: asNonNegativeNumber(record?.totals?.streamlabsUsd, 0),
    twitchBitsUsd: asNonNegativeNumber(record?.totals?.twitchBitsUsd, 0),
    twitchSubsUsd: asNonNegativeNumber(record?.totals?.twitchSubsUsd, 0),
    twitchGiftSubsUsd: asNonNegativeNumber(record?.totals?.twitchGiftSubsUsd, 0),
  };

  return {
    lookup: rawLookup,
    found: Boolean(record),
    key: key || null,
    record,
    totals: {
      ...totals,
      twitchUsd:
        totals.twitchBitsUsd + totals.twitchSubsUsd + totals.twitchGiftSubsUsd,
      combinedUsd:
        totals.streamlabsUsd +
        totals.twitchBitsUsd +
        totals.twitchSubsUsd +
        totals.twitchGiftSubsUsd,
    },
    counts: {
      streamlabs: asCount(record?.counts?.streamlabs, 0),
      twitchBits: asCount(record?.counts?.twitchBits, 0),
      twitchSubs: asCount(record?.counts?.twitchSubs, 0),
      twitchGifts: asCount(record?.counts?.twitchGifts, 0),
    },
    raw: {
      streamlabsDonations: asNonNegativeNumber(record?.raw?.streamlabsDonations, 0),
      bits: asCount(record?.raw?.bits, 0),
      subs: asCount(record?.raw?.subs, 0),
      gifts: asCount(record?.raw?.gifts, 0),
    },
  };
}
