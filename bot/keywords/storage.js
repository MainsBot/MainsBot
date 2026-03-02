import fs from "fs";
import path from "path";

export function createKeywordStorage({
  wordsPath,
  defaultGlobalWordsPath,
  legacyArchiveWordsPath,
  normalizeKeywordsObject,
  readKeywordsState,
  writeKeywordsState,
} = {}) {
  const WORDS_PATH = path.resolve(String(wordsPath || "").trim());
  const DEFAULT_GLOBAL_WORDS_PATH = path.resolve(String(defaultGlobalWordsPath || "").trim());
  const LEGACY_ARCHIVE_WORDS_PATH = path.resolve(String(legacyArchiveWordsPath || "").trim());

  function readWordsFromDisk() {
    const candidates = [
      WORDS_PATH,
      path.join(path.dirname(WORDS_PATH), "WORDS.json"),
      path.join(path.dirname(WORDS_PATH), "words.json"),
      DEFAULT_GLOBAL_WORDS_PATH,
      LEGACY_ARCHIVE_WORDS_PATH,
    ];

    const seen = new Set();

    for (const candidate of candidates) {
      const candidatePath = path.resolve(String(candidate || "").trim());
      if (!candidatePath || seen.has(candidatePath)) continue;
      seen.add(candidatePath);
      if (!fs.existsSync(candidatePath)) continue;
      try {
        const parsed = JSON.parse(fs.readFileSync(candidatePath, "utf8"));
        const words =
          parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
        if (Object.keys(words).length > 0) {
          return { words, sourcePath: candidatePath };
        }
      } catch {}
    }

    return { words: {}, sourcePath: WORDS_PATH };
  }

  async function loadKeywordsWithPostgresFallback() {
    const wordsLoad = readWordsFromDisk();
    const fallbackWords = normalizeKeywordsObject(wordsLoad.words || {});

    try {
      const loaded = await readKeywordsState({
        fallbackWords,
        migrateFallback: true,
      });
      return {
        words: normalizeKeywordsObject(loaded.keywords || {}),
        source: String(loaded.source || "postgres"),
        sourcePath: wordsLoad.sourcePath,
      };
    } catch (e) {
      console.warn("[KEYWORDS] postgres read failed, using file fallback:", String(e?.message || e));
      return {
        words: fallbackWords,
        source: "file_fallback",
        sourcePath: wordsLoad.sourcePath,
      };
    }
  }

  async function persistKeywords(nextWords = {}, { writeFileFallback = true } = {}) {
    const normalized = normalizeKeywordsObject(nextWords || {});

    try {
      await writeKeywordsState({ keywords: normalized });
    } catch (e) {
      console.warn("[KEYWORDS] postgres write failed:", String(e?.message || e));
    }

    if (writeFileFallback) {
      try {
        fs.mkdirSync(path.dirname(WORDS_PATH), { recursive: true });
        fs.writeFileSync(WORDS_PATH, JSON.stringify(normalized, null, 2), "utf8");
      } catch {}
    }

    return normalized;
  }

  return {
    readWordsFromDisk,
    loadKeywordsWithPostgresFallback,
    persistKeywords,
    wordsPath: WORDS_PATH,
  };
}
