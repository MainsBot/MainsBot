import net from "net";
import tls from "tls";
import { resolveInstanceName } from "../../functions/instance.js";

function asInt(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : fallback;
}

function buildRedisConfig() {
  const enabledRaw = String(process.env.REDIS_ENABLED || "").trim();
  if (enabledRaw && /^(0|false|no|off)$/i.test(enabledRaw)) {
    return { enabled: false };
  }

  const rawUrl = String(process.env.REDIS_URL || "").trim();
  const host = String(process.env.REDIS_HOST || "").trim();

  if (rawUrl) {
    let parsed;
    try {
      parsed = new URL(rawUrl);
    } catch {
      throw new Error("Invalid REDIS_URL");
    }

    const isTls = parsed.protocol === "rediss:";
    if (parsed.protocol !== "redis:" && parsed.protocol !== "rediss:") {
      throw new Error("REDIS_URL must use redis:// or rediss://");
    }

    const dbFromPath = String(parsed.pathname || "").replace(/^\//, "").trim();
    return {
      enabled: true,
      host: String(parsed.hostname || "127.0.0.1").trim() || "127.0.0.1",
      port: asInt(parsed.port, 6379),
      username: decodeURIComponent(String(parsed.username || "").trim()),
      password: decodeURIComponent(String(parsed.password || "").trim()),
      db: asInt(dbFromPath || process.env.REDIS_DB, 0),
      isTls,
    };
  }

  if (!host) {
    return {
      enabled: true,
      host: "127.0.0.1",
      port: asInt(process.env.REDIS_PORT, 6379),
      username: String(process.env.REDIS_USERNAME || "").trim(),
      password: String(process.env.REDIS_PASSWORD || "").trim(),
      db: asInt(process.env.REDIS_DB, 0),
      isTls: /^(1|true|yes|on)$/i.test(String(process.env.REDIS_TLS || "").trim()),
    };
  }

  return {
    enabled: true,
    host,
    port: asInt(process.env.REDIS_PORT, 6379),
    username: String(process.env.REDIS_USERNAME || "").trim(),
    password: String(process.env.REDIS_PASSWORD || "").trim(),
    db: asInt(process.env.REDIS_DB, 0),
    isTls: /^(1|true|yes|on)$/i.test(String(process.env.REDIS_TLS || "").trim()),
  };
}

function encodeBulk(value) {
  const text = String(value ?? "");
  const bytes = Buffer.byteLength(text, "utf8");
  return `$${bytes}\r\n${text}\r\n`;
}

function encodeCommand(args = []) {
  const arr = Array.isArray(args) ? args : [];
  const head = `*${arr.length}\r\n`;
  return head + arr.map((arg) => encodeBulk(arg)).join("");
}

function parseResp(buffer) {
  if (!buffer || buffer.length < 1) return null;

  const type = String.fromCharCode(buffer[0]);
  if (type === "+" || type === "-" || type === ":") {
    const end = buffer.indexOf("\r\n");
    if (end < 0) return null;
    const raw = buffer.slice(1, end).toString("utf8");
    if (type === "+") return { value: raw, bytes: end + 2 };
    if (type === "-") return { value: new Error(raw), bytes: end + 2 };
    return { value: Number(raw), bytes: end + 2 };
  }

  if (type === "$") {
    const end = buffer.indexOf("\r\n");
    if (end < 0) return null;
    const len = Number(buffer.slice(1, end).toString("utf8"));
    if (len === -1) return { value: null, bytes: end + 2 };
    if (!Number.isFinite(len) || len < 0) {
      return { value: new Error("Invalid bulk response length"), bytes: end + 2 };
    }

    const start = end + 2;
    const finish = start + len;
    if (buffer.length < finish + 2) return null;

    const value = buffer.slice(start, finish).toString("utf8");
    return { value, bytes: finish + 2 };
  }

  if (type === "*") {
    const end = buffer.indexOf("\r\n");
    if (end < 0) return null;
    const count = Number(buffer.slice(1, end).toString("utf8"));
    if (count === -1) return { value: null, bytes: end + 2 };
    if (!Number.isFinite(count) || count < 0) {
      return { value: new Error("Invalid array response length"), bytes: end + 2 };
    }

    let offset = end + 2;
    const values = [];
    for (let i = 0; i < count; i++) {
      const part = parseResp(buffer.slice(offset));
      if (!part) return null;
      values.push(part.value);
      offset += part.bytes;
    }

    return { value: values, bytes: offset };
  }

  return { value: new Error(`Unsupported RESP type: ${type}`), bytes: buffer.length };
}

class RedisClient {
  constructor(config) {
    this.config = config;
    this.socket = null;
    this.connecting = null;
    this.buffer = Buffer.alloc(0);
    this.pending = [];
    this.ready = false;
  }

  isEnabled() {
    return Boolean(this.config?.enabled);
  }

  async ensureConnected() {
    if (!this.isEnabled()) throw new Error("Redis is not configured.");
    if (this.socket && this.ready) return;
    if (this.connecting) {
      await this.connecting;
      return;
    }

    this.connecting = new Promise((resolve, reject) => {
      const cfg = this.config;
      const onErrorOnce = (err) => {
        cleanup();
        reject(err instanceof Error ? err : new Error(String(err || "Redis connection failed")));
      };

      const onConnect = async () => {
        cleanup();
        try {
          await this.bootstrapAuthAndDb();
          this.ready = true;
          resolve();
        } catch (err) {
          this.destroySocket();
          reject(err);
        }
      };

      const cleanup = () => {
        sock.removeListener("error", onErrorOnce);
        sock.removeListener("connect", onConnect);
      };

      const socketFactory = cfg.isTls ? tls.connect : net.createConnection;
      const options = { host: cfg.host, port: cfg.port };
      const sock = socketFactory(options);
      this.socket = sock;
      this.ready = false;

      sock.setNoDelay(true);
      sock.setKeepAlive(true, 30_000);

      sock.on("data", (chunk) => this.onData(chunk));
      sock.on("error", (err) => this.failPending(err));
      sock.on("close", () => {
        this.ready = false;
        this.socket = null;
        this.failPending(new Error("Redis connection closed"));
      });

      sock.once("error", onErrorOnce);
      sock.once("connect", onConnect);
    });

    try {
      await this.connecting;
    } finally {
      this.connecting = null;
    }
  }

  onData(chunk) {
    if (!chunk || !chunk.length) return;
    this.buffer = Buffer.concat([this.buffer, chunk]);

    while (this.pending.length > 0) {
      const parsed = parseResp(this.buffer);
      if (!parsed) break;

      this.buffer = this.buffer.slice(parsed.bytes);
      const next = this.pending.shift();
      if (!next) continue;

      if (parsed.value instanceof Error) next.reject(parsed.value);
      else next.resolve(parsed.value);
    }
  }

  failPending(error) {
    const err = error instanceof Error ? error : new Error(String(error || "Redis request failed"));
    while (this.pending.length > 0) {
      const next = this.pending.shift();
      try {
        next?.reject?.(err);
      } catch {}
    }
  }

  destroySocket() {
    try {
      this.socket?.destroy?.();
    } catch {}
    this.socket = null;
    this.ready = false;
  }

  async bootstrapAuthAndDb() {
    const username = String(this.config?.username || "").trim();
    const password = String(this.config?.password || "").trim();
    const db = asInt(this.config?.db, 0);

    if (password) {
      if (username) {
        await this.sendCommand(["AUTH", username, password]);
      } else {
        await this.sendCommand(["AUTH", password]);
      }
    }

    if (db > 0) {
      await this.sendCommand(["SELECT", String(db)]);
    }
  }

  sendCommand(args = []) {
    if (!this.socket) {
      return Promise.reject(new Error("Redis socket is not connected."));
    }

    return new Promise((resolve, reject) => {
      this.pending.push({ resolve, reject });
      try {
        this.socket.write(encodeCommand(args));
      } catch (err) {
        this.pending.pop();
        reject(err);
      }
    });
  }

  async command(args = []) {
    await this.ensureConnected();
    return this.sendCommand(args);
  }

  async get(key) {
    return this.command(["GET", String(key || "")]);
  }

  async set(key, value) {
    return this.command(["SET", String(key || ""), String(value ?? "")]);
  }

  async del(key) {
    return this.command(["DEL", String(key || "")]);
  }
}

let sharedClient = null;

export function isRedisConfigured() {
  try {
    const cfg = buildRedisConfig();
    return Boolean(cfg.enabled);
  } catch {
    return false;
  }
}

export function getRedisClient() {
  if (sharedClient) return sharedClient;
  sharedClient = new RedisClient(buildRedisConfig());
  return sharedClient;
}

export function getRedisNamespace(prefix = "") {
  const base = String(prefix || "").trim();
  return {
    async get(key) {
      const client = getRedisClient();
      if (!client.isEnabled()) return null;
      return client.get(`${base}${String(key || "")}`);
    },
    async set(key, value) {
      const client = getRedisClient();
      if (!client.isEnabled()) return null;
      return client.set(`${base}${String(key || "")}`, value);
    },
    async del(key) {
      const client = getRedisClient();
      if (!client.isEnabled()) return null;
      return client.del(`${base}${String(key || "")}`);
    },
  };
}

export function getRedisInstanceNamespace(prefix = "", instanceName = "") {
  const base = String(prefix || "").trim();
  const instance = resolveInstanceName({ instanceName });
  const scoped = base ? `${base}${instance}:` : `${instance}:`;
  return getRedisNamespace(scoped);
}
