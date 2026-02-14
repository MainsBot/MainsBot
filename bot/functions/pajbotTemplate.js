function safeTz(value) {
  return String(value || "").trim();
}

function partsInTimeZone(date, timeZone) {
  try {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    const parts = fmt.formatToParts(date);
    const get = (type) => parts.find((p) => p.type === type)?.value;
    const year = Number(get("year"));
    const month = Number(get("month"));
    const day = Number(get("day"));
    const hour = Number(get("hour"));
    const minute = Number(get("minute"));
    const second = Number(get("second"));
    return {
      year,
      month,
      day,
      hour24: hour,
      minute,
      second,
      hour12: ((hour % 12) || 12),
      dayPeriod: hour >= 12 ? "PM" : "AM",
    };
  } catch {
    // fallback to local time
    const d = date;
    const hour = d.getHours();
    return {
      year: d.getFullYear(),
      month: d.getMonth() + 1,
      day: d.getDate(),
      hour24: hour,
      minute: d.getMinutes(),
      second: d.getSeconds(),
      hour12: ((hour % 12) || 12),
      dayPeriod: hour >= 12 ? "PM" : "AM",
    };
  }
}

function pad2(n) {
  return String(Math.max(0, Number(n) || 0)).padStart(2, "0");
}

function renderStrftime(fmt, parts) {
  // Minimal strftime subset used by your Pajbot commands.
  // Supports: %Y %m %d %H %-H %I %-I %M %-M %S %-S %p %%
  let out = "";
  for (let i = 0; i < fmt.length; i++) {
    const ch = fmt[i];
    if (ch !== "%") {
      out += ch;
      continue;
    }

    const next = fmt[i + 1] || "";
    if (next === "%") {
      out += "%";
      i++;
      continue;
    }

    let noPad = false;
    let code = next;
    if (next === "-") {
      noPad = true;
      code = fmt[i + 2] || "";
      i += 2;
    } else {
      i += 1;
    }

    const year = parts.year;
    const month = parts.month;
    const day = parts.day;
    const hour24 = parts.hour24;
    const hour12 = parts.hour12;
    const minute = parts.minute;
    const second = parts.second;
    const dayPeriod = parts.dayPeriod;

    const num = (n) => (noPad ? String(Number(n) || 0) : pad2(n));

    if (code === "Y") out += String(year);
    else if (code === "m") out += num(month);
    else if (code === "d") out += num(day);
    else if (code === "H") out += num(hour24);
    else if (code === "I") out += num(hour12);
    else if (code === "M") out += num(minute);
    else if (code === "S") out += num(second);
    else if (code === "p") out += String(dayPeriod || "");
    else out += `%${noPad ? "-" : ""}${code}`;
  }
  return out;
}

function getArg(args, index1Based) {
  const idx = Math.max(1, Number(index1Based) || 1) - 1;
  return String(args?.[idx] ?? "").trim();
}

function normalizeLogin(value) {
  return String(value || "")
    .trim()
    .replace(/^@/, "")
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "");
}

function formatCountdownMs(ms) {
  const total = Math.max(0, Math.floor(Number(ms) || 0));
  const s = Math.floor(total / 1000);
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;

  const parts = [];
  if (days) parts.push(`${days}d`);
  if (hours || days) parts.push(`${hours}h`);
  if (minutes || hours || days) parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);
  return parts.join(" ");
}

function parseMonth(value) {
  const s = String(value || "").trim().toLowerCase();
  const map = {
    jan: 1, january: 1,
    feb: 2, february: 2,
    mar: 3, march: 3,
    apr: 4, april: 4,
    may: 5,
    jun: 6, june: 6,
    jul: 7, july: 7,
    aug: 8, august: 8,
    sep: 9, sept: 9, september: 9,
    oct: 10, october: 10,
    nov: 11, november: 11,
    dec: 12, december: 12,
  };
  return map[s] || 0;
}

function normalizeTimeZone(token) {
  const raw = String(token || "").trim();
  if (!raw) return "";
  if (raw.includes("/")) return raw;
  const up = raw.toUpperCase();
  if (up === "MST" || up === "MDT" || up === "MT") return "America/Denver";
  if (up === "EST" || up === "EDT" || up === "ET") return "America/New_York";
  if (up === "PST" || up === "PDT" || up === "PT") return "America/Los_Angeles";
  if (up === "CST" || up === "CDT" || up === "CT") return "America/Chicago";
  return raw;
}

function zonedWallClockToUtcMs({ year, month, day, hour24, minute, second, timeZone }) {
  // Iterative correction: guess UTC then adjust by wall-clock difference in zone.
  let guess = Date.UTC(year, month - 1, day, hour24, minute, second);
  for (let i = 0; i < 3; i++) {
    const got = partsInTimeZone(new Date(guess), timeZone);
    const desired = { year, month, day, hour24, minute, second };

    const gotMs = Date.UTC(got.year, got.month - 1, got.day, got.hour24, got.minute, got.second);
    const desiredMs = Date.UTC(
      desired.year,
      desired.month - 1,
      desired.day,
      desired.hour24,
      desired.minute,
      desired.second
    );
    const diff = desiredMs - gotMs;
    if (!diff) break;
    guess += diff;
  }
  return guess;
}

function parseCountdownExpr(expr) {
  // Supports:
  // - countdown Jun 4 2026 12:00:00 AM MST
  // - countdown Jun 4 12:00:00 AM Canada/Mountain (year optional)
  const tokens = String(expr || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (tokens.length < 5) return null;

  // tokens[0] is countdown[:mode]
  const month = parseMonth(tokens[1]);
  const day = Number(tokens[2]);
  if (!month || !Number.isFinite(day) || day < 1 || day > 31) return null;

  let idx = 3;
  let year = null;
  const maybeYear = Number(tokens[idx]);
  if (Number.isFinite(maybeYear) && String(tokens[idx]).length === 4) {
    year = maybeYear;
    idx++;
  }

  const timeToken = tokens[idx++];
  const ampm = String(tokens[idx++] || "").toUpperCase();
  const tzToken = tokens[idx++] || "";

  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(String(timeToken || ""));
  if (!m) return null;
  let hour = Number(m[1]);
  const minute = Number(m[2]);
  const second = Number(m[3] || 0);
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || !Number.isFinite(second)) return null;

  if (ampm === "AM") {
    if (hour === 12) hour = 0;
  } else if (ampm === "PM") {
    if (hour !== 12) hour += 12;
  } else {
    // allow 24h if AM/PM missing
    idx -= 1; // tz was actually AM/PM, revert
  }

  const timeZone = normalizeTimeZone(tzToken) || "UTC";
  return { month, day, year, hour24: hour, minute, second, timeZone };
}

export function renderPajbotTemplate(template, ctx) {
  const text = String(template ?? "");
  if (!text.includes("$(")) return text;

  const command = String(ctx?.command || "").trim().toLowerCase();
  const args = Array.isArray(ctx?.args) ? ctx.args : [];

  const userLogin = String(ctx?.user?.login || "").trim();
  const userDisplayName = String(ctx?.user?.displayName || userLogin || "someone");

  const numUses =
    Number(ctx?.commandNumUses ?? 0) ||
    Number(ctx?.counts?.[command] ?? 0);

  const senderLogin = userLogin;
  const senderName = userDisplayName;
  const arg1 = getArg(args, 1);
  const targetLogin = normalizeLogin(arg1) || senderLogin;
  const targetName = arg1 ? String(arg1).replace(/^@/, "").trim() : senderName;

  return text.replace(/\$\(([^)]+)\)/g, (_, exprRaw) => {
    const expr = String(exprRaw || "").trim();
    if (!expr) return "";

    // $(sender.login) / $(sender.name)
    if (/^sender\.(login|name)$/i.test(expr)) {
      const field = expr.split(".")[1].toLowerCase();
      return field === "login" ? (senderLogin || "") : (senderName || "");
    }

    // $(user.login) / $(user.name)  (arg1 if provided, else sender)
    if (/^user\.(login|name)$/i.test(expr)) {
      const field = expr.split(".")[1].toLowerCase();
      return field === "login" ? (targetLogin || "") : (targetName || "");
    }

    // $(command:num_uses)
    if (/^command\s*:\s*num_uses$/i.test(expr)) {
      return String(Math.max(0, Math.floor(Number(numUses) || 0)));
    }

    // $(usersource;1:name)
    if (/^usersource\s*;/i.test(expr)) {
      const afterSemi = expr.split(";").slice(1).join(";").trim();
      const field = String(afterSemi.split(":")[1] || "name").trim().toLowerCase();
      if (field === "username" || field === "login" || field === "username_raw") return userLogin || "";
      return userDisplayName || "";
    }

    // $(user;1:username_raw)
    if (/^user\s*;/i.test(expr)) {
      const afterSemi = expr.split(";").slice(1).join(";").trim();
      const [pos, fieldRaw] = afterSemi.split(":");
      const field = String(fieldRaw || "username_raw").trim().toLowerCase();
      const value = getArg(args, pos);
      if (!value) return userLogin || "";
      if (field === "name") return value;
      return value;
    }

    // $(datetime:Canada/Mountain|strftime(%-I:%-M %p))
    if (/^datetime\s*:/i.test(expr)) {
      const [head, ...filters] = expr.split("|").map((s) => s.trim()).filter(Boolean);
      const tz = safeTz(head.split(":").slice(1).join(":"));
      const now = ctx?.now instanceof Date ? ctx.now : new Date();
      const parts = partsInTimeZone(now, tz || undefined);

      let out = ""; // default: empty unless strftime filter exists
      for (const f of filters) {
        const m = /^strftime\s*\((.*)\)\s*$/i.exec(f);
        if (m) {
          out = renderStrftime(String(m[1] || ""), parts);
        }
      }
      return out;
    }

    // $(count.update key delta)
    if (/^count\.update\s+/i.test(expr)) {
      const rest = expr.replace(/^count\.update\s+/i, "").trim();
      const [keyRaw, deltaRaw] = rest.split(/\s+/);
      const delta = Number(deltaRaw ?? 1);
      const next = ctx?.countStore?.update
        ? ctx.countStore.update(String(keyRaw || ""), Number.isFinite(delta) ? delta : 1)
        : 0;
      return String(next);
    }

    // $(count key)
    if (/^count\s+/i.test(expr)) {
      const keyRaw = expr.replace(/^count\s+/i, "").trim().split(/\s+/)[0] || "";
      const v = ctx?.countStore?.get ? ctx.countStore.get(String(keyRaw)) : 0;
      return String(v);
    }

    // $(countdown ...) / $(countdown:year ...) / $(countdown:age <birthYear> ...)
    if (/^countdown(?::(year|age))?\s+/i.test(expr)) {
      const m = /^countdown(?::(year|age))?\s+/i.exec(expr);
      const mode = String(m?.[1] || "").toLowerCase();
      const rest = expr.replace(/^countdown(?::(year|age))?\s+/i, "").trim();

      let birthYear = null;
      let payload = rest;
      if (mode === "age") {
        const first = rest.split(/\s+/)[0];
        const y = Number(first);
        if (Number.isFinite(y) && String(first).length === 4) {
          birthYear = y;
          payload = rest.split(/\s+/).slice(1).join(" ");
        }
      }

      const parsed = parseCountdownExpr(`countdown ${payload}`);
      if (!parsed) return "";

      const now = ctx?.now instanceof Date ? ctx.now : new Date();
      const nowParts = partsInTimeZone(now, parsed.timeZone);
      let y = parsed.year ?? nowParts.year;

      // ensure "next occurrence" in the chosen zone
      let targetMs = zonedWallClockToUtcMs({
        year: y,
        month: parsed.month,
        day: parsed.day,
        hour24: parsed.hour24,
        minute: parsed.minute,
        second: parsed.second,
        timeZone: parsed.timeZone,
      });
      while (targetMs <= now.getTime()) {
        y += 1;
        targetMs = zonedWallClockToUtcMs({
          year: y,
          month: parsed.month,
          day: parsed.day,
          hour24: parsed.hour24,
          minute: parsed.minute,
          second: parsed.second,
          timeZone: parsed.timeZone,
        });
      }

      if (mode === "year") return String(y);
      if (mode === "age") {
        const by = Number(birthYear ?? ctx?.birthYear ?? 0);
        if (!by || !Number.isFinite(by)) return "";
        return String(Math.max(0, y - by));
      }

      return formatCountdownMs(targetMs - now.getTime());
    }

    return `$(${expr})`;
  });
}
