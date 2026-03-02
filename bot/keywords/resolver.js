function normalizeKeywordCategoryName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .trim();
}

export function createKeywordResponseResolver(responseTable = {}) {
  const index = new Map();

  function rebuild() {
    index.clear();
    const table = responseTable && typeof responseTable === "object" ? responseTable : {};
    for (const key of Object.keys(table)) {
      if (typeof table[key] !== "function") continue;
      index.set(key, key);
      index.set(String(key).toLowerCase(), key);
      index.set(normalizeKeywordCategoryName(key), key);
    }
  }

  function resolve(wordSet) {
    const raw = String(wordSet || "");
    if (!raw) return null;

    const direct = index.get(raw);
    if (direct) return { key: direct, fn: responseTable[direct] };

    const lower = index.get(raw.toLowerCase());
    if (lower) return { key: lower, fn: responseTable[lower] };

    const normalized = index.get(normalizeKeywordCategoryName(raw));
    if (normalized) return { key: normalized, fn: responseTable[normalized] };

    return null;
  }

  rebuild();
  return {
    rebuild,
    resolve,
  };
}
