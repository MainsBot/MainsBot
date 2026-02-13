function normalizeChannelLogin(value) {
  return String(value || "")
    .trim()
    .replace(/^#/, "")
    .toLowerCase();
}

export function buildNightbotLinkCommandText({ joinLink, mobileHowToUrl } = {}) {
  const link = String(joinLink || "").trim();
  if (!link) return "";

  const howTo = String(mobileHowToUrl || "").trim();
  const mobile = howTo ? ` [MOBILE] How to join -> ${howTo}` : "";

  return `@$(touser), [PC] Click this link to join -> ${link}${mobile}`.trim();
}

export function setNightbotCommand({
  client,
  channelName,
  commandName,
  text,
  createIfMissing = false,
} = {}) {
  if (!client) return false;
  const channel = normalizeChannelLogin(channelName);
  const cmd = String(commandName || "").trim();
  const body = String(text || "").trim();
  if (!channel || !cmd || !body) return false;

  const verb = createIfMissing ? "add" : "edit";
  client.say(channel, `!commands ${verb} ${cmd} ${body}`);
  return true;
}

