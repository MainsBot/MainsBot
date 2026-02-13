function normalizeChannelLogin(value) {
  return String(value || "")
    .trim()
    .replace(/^#/, "")
    .toLowerCase();
}

export function buildLinkCommandText({ joinLink, mobileHowToUrl } = {}) {
  const link = String(joinLink || "").trim();
  if (!link) return "";

  const howTo = String(mobileHowToUrl || "").trim();
  const mobile = howTo ? ` [📱 MOBILE] Click to learn how to join -> ${howTo}` : "";

  return `@$(user.login), [💻 PC USERS] Click this link to join -> ${link}${mobile}`.trim();
}

export function setFossabotCommand({
  client,
  channelName,
  commandName,
  text,
} = {}) {
  if (!client) return false;
  const channel = normalizeChannelLogin(channelName);
  const cmd = String(commandName || "").trim();
  const body = String(text || "").trim();
  if (!channel || !cmd || !body) return false;
  client.say(channel, `!setcommand ${cmd} ${body}`);
  return true;
}

