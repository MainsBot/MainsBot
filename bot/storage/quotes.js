import fs from "fs";
import path from "path";

const QUOTES_PATH = String(process.env.QUOTES_PATH || "./QUOTES.json").trim();

function ensureDirFor(filePath) {
  const dir = path.dirname(filePath);
  if (!dir || dir === "." || dir === filePath) return;
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function buildDefaultQuotes() {
  return { nextId: 1, quotes: [] };
}

function normalizeQuotesData(raw) {
  const data = raw && typeof raw === "object" ? raw : {};
  const inputQuotes = Array.isArray(data.quotes) ? data.quotes : [];
  const quotes = [];
  let maxId = 0;

  for (const entry of inputQuotes) {
    if (!entry || typeof entry !== "object") continue;
    const id = Number(entry.id);
    const text = typeof entry.text === "string" ? entry.text.trim() : "";
    if (!Number.isInteger(id) || id <= 0 || !text) continue;

    const normalized = { id, text };
    if (typeof entry.addedBy === "string" && entry.addedBy.trim()) {
      normalized.addedBy = entry.addedBy.trim();
    }
    if (typeof entry.addedAt === "string" && entry.addedAt.trim()) {
      normalized.addedAt = entry.addedAt.trim();
    }

    quotes.push(normalized);
    if (id > maxId) maxId = id;
  }

  let nextId = Number(data.nextId);
  if (!Number.isInteger(nextId) || nextId <= maxId) {
    nextId = maxId + 1;
  }
  if (nextId < 1) nextId = 1;

  return { nextId, quotes };
}

export function loadQuotes() {
  try {
    if (!QUOTES_PATH) return buildDefaultQuotes();
    if (!fs.existsSync(QUOTES_PATH)) {
      return buildDefaultQuotes();
    }
    const raw = JSON.parse(fs.readFileSync(QUOTES_PATH, "utf8"));
    return normalizeQuotesData(raw);
  } catch {
    return buildDefaultQuotes();
  }
}

export function saveQuotes(data) {
  if (!QUOTES_PATH) return;
  ensureDirFor(QUOTES_PATH);
  fs.writeFileSync(QUOTES_PATH, JSON.stringify(data, null, 2));
}

