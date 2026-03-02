function normalizeInstanceToken(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^#/, "")
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function resolveInstanceName({
  instanceName = process.env.INSTANCE_NAME,
  channelName = process.env.CHANNEL_NAME,
  channelId = process.env.CHANNEL_ID,
  fallback = "default",
} = {}) {
  const explicit = normalizeInstanceToken(instanceName);
  if (explicit) return explicit;

  const channel = normalizeInstanceToken(channelName);
  if (channel) return channel;

  const id = normalizeInstanceToken(channelId);
  if (id) return `ch_${id}`;

  return normalizeInstanceToken(fallback) || "default";
}

