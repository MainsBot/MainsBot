export function createSharedCommandCooldown({
  globalMs = 10_000,
  userMs = 30_000,
  isPrivilegedFn = null,
} = {}) {
  let globalCooldownUntil = 0;
  const userCooldownByLogin = new Map();

  const isPrivileged = (userstate = {}) => {
    if (typeof isPrivilegedFn !== "function") return false;
    try {
      return Boolean(isPrivilegedFn(userstate));
    } catch {
      return false;
    }
  };

  function isActive(userstate = {}) {
    if (isPrivileged(userstate)) return false;

    const now = Date.now();
    if (now < globalCooldownUntil) return true;

    const userKey = String(userstate?.username || "").toLowerCase();
    if (userKey) {
      const userCooldownUntil = Number(userCooldownByLogin.get(userKey) || 0);
      if (now < userCooldownUntil) return true;
    }

    globalCooldownUntil = now + Math.max(0, Number(globalMs) || 0);
    if (userKey) {
      userCooldownByLogin.set(userKey, now + Math.max(0, Number(userMs) || 0));
    }

    return false;
  }

  function getGlobalRemainingMs(now = Date.now()) {
    return Math.max(0, Number(globalCooldownUntil || 0) - Number(now || Date.now()));
  }

  return {
    isActive,
    getGlobalRemainingMs,
  };
}
