function normalizeStreamerName(value) {
  return String(value || "").trim().toLowerCase();
}

function hashString(input) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function hslToRgb(h, s, l) {
  const sat = Math.max(0, Math.min(100, s)) / 100;
  const light = Math.max(0, Math.min(100, l)) / 100;
  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const hp = ((h % 360) + 360) % 360 / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;

  if (hp >= 0 && hp < 1) {
    r = c;
    g = x;
  } else if (hp < 2) {
    r = x;
    g = c;
  } else if (hp < 3) {
    g = c;
    b = x;
  } else if (hp < 4) {
    g = x;
    b = c;
  } else if (hp < 5) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }

  const m = light - c / 2;
  const rr = Math.round((r + m) * 255);
  const gg = Math.round((g + m) * 255);
  const bb = Math.round((b + m) * 255);
  return [rr, gg, bb];
}

function rgbToHex(r, g, b) {
  const toHex = (value) => {
    const n = Math.max(0, Math.min(255, value));
    return n.toString(16).padStart(2, "0");
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function deriveTheme(streamerName) {
  const login = normalizeStreamerName(streamerName);
  if (!login) return null;

  const hash = hashString(login);
  const hue = hash % 360;
  const accentRgb = hslToRgb(hue, 78, 55);
  const accent2Rgb = hslToRgb(hue, 88, 78);
  const accent3Rgb = hslToRgb((hue + 22) % 360, 82, 50);

  return {
    accent: rgbToHex(...accentRgb),
    accent2: rgbToHex(...accent2Rgb),
    accent3: rgbToHex(...accent3Rgb),
    accentRgb: accentRgb.join(" "),
    accent2Rgb: accent2Rgb.join(" "),
    accent3Rgb: accent3Rgb.join(" "),
    border: `rgba(${accentRgb.join(", ")}, 0.28)`,
  };
}

export function applyStreamerTheme(streamerName) {
  const theme = deriveTheme(streamerName);
  if (!theme) return;

  const root = document.documentElement;
  root.style.setProperty("--accent", theme.accent);
  root.style.setProperty("--accent2", theme.accent2);
  root.style.setProperty("--accent3", theme.accent3);
  root.style.setProperty("--accent-rgb", theme.accentRgb);
  root.style.setProperty("--accent2-rgb", theme.accent2Rgb);
  root.style.setProperty("--accent3-rgb", theme.accent3Rgb);
  root.style.setProperty("--border", theme.border);

  const themeColor = document.querySelector('meta[name="theme-color"]');
  if (themeColor) {
    themeColor.setAttribute("content", theme.accent);
  }
}

export function applyStreamerThemeFromStatus(status) {
  const source = status && typeof status === "object" ? status : {};
  const streamerName =
    source.channelName ||
    source.channelDisplayName ||
    source.channel ||
    source.channelNameDisplay ||
    "";
  applyStreamerTheme(streamerName);
}
