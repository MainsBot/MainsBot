import fs from "fs";

function stripInlineComment(value) {
  const s = String(value ?? "");
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    if (ch === '"' && !inSingle) inDouble = !inDouble;
    if (!inSingle && !inDouble && (ch === ";" || ch === "#")) {
      return s.slice(0, i).trim();
    }
  }
  return s.trim();
}

function unquote(value) {
  const s = String(value ?? "").trim();
  if (s.length >= 2) {
    if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
      return s.slice(1, -1);
    }
  }
  return s;
}

export function parseIni(text) {
  const lines = String(text ?? "").replace(/\r\n/g, "\n").split("\n");
  const result = Object.create(null);
  let section = "";

  for (const rawLine of lines) {
    const line = stripInlineComment(rawLine).trim();
    if (!line) continue;

    const sectionMatch = line.match(/^\[([^\]]+)\]$/);
    if (sectionMatch) {
      section = String(sectionMatch[1] ?? "").trim();
      if (!result[section]) result[section] = Object.create(null);
      continue;
    }

    const idx = line.indexOf("=");
    if (idx === -1) continue;

    const key = line.slice(0, idx).trim();
    const value = unquote(line.slice(idx + 1).trim());
    if (!key) continue;

    if (!result[section]) result[section] = Object.create(null);
    result[section][key] = value;
  }

  return result;
}

export function readIniFile(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  return parseIni(text);
}

