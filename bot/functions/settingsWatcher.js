import fs from "fs";

export function startSettingsWatcher({ filePath, readSnapshot, onChange, intervalMs = 2000 } = {}) {
  if (!filePath || typeof readSnapshot !== "function") {
    return { stop() {} };
  }

  let lastSnapshot = null;

  try {
    lastSnapshot = readSnapshot();
  } catch {
    lastSnapshot = null;
  }

  const onTick = () => {
    let next = null;
    try {
      next = readSnapshot();
    } catch {
      return;
    }
    if (!next) return;

    if (!lastSnapshot) {
      lastSnapshot = next;
      return;
    }

    try {
      onChange?.(lastSnapshot, next);
    } catch {}

    lastSnapshot = next;
  };

  fs.watchFile(filePath, { interval: Math.max(250, Number(intervalMs) || 2000) }, onTick);

  return {
    stop() {
      try {
        fs.unwatchFile(filePath, onTick);
      } catch {}
    },
  };
}
