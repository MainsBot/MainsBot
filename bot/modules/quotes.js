import { loadQuotes, saveQuotes } from "../storage/quotes.js";

export function tryHandleQuotesModCommand({ message, twitchUsername, reply } = {}) {
  const trimmedMessage = String(message || "").trim();
  if (!trimmedMessage) return false;
  if (typeof reply !== "function") return false;

  const addQuoteMatch = trimmedMessage.match(/^!add(?:\s+)?quote(?:\s+(.*))?$/i);
  if (addQuoteMatch) {
    const quoteText = String(addQuoteMatch[1] || "")
      .replace(/[\r\n]+/g, " ")
      .trim();

    if (!quoteText) {
      reply("Usage: !addquote <quote text>");
      return true;
    }

    const data = loadQuotes();
    const id = data.nextId;
    data.quotes.push({
      id,
      text: quoteText,
      addedBy: String(twitchUsername || "").trim() || "unknown",
      addedAt: new Date().toISOString(),
    });
    data.nextId = id + 1;
    saveQuotes(data);

    reply(`Added quote #${id}.`);
    return true;
  }

  const deleteQuoteMatch = trimmedMessage.match(
    /^!(?:delete|del|remove)(?:\s+)?quote(?:\s+(.*))?$/i
  );
  if (deleteQuoteMatch) {
    const rawId = String(deleteQuoteMatch[1] || "").trim();
    if (!rawId) {
      reply("Usage: !delquote <quote #>");
      return true;
    }

    const idText = rawId.replace(/^#/, "");
    if (!/^\d+$/.test(idText)) {
      reply("Quote id must be a number.");
      return true;
    }

    const id = Number(idText);
    const data = loadQuotes();
    const idx = data.quotes.findIndex((entry) => entry.id === id);
    if (idx === -1) {
      reply(`Quote #${id} not found.`);
      return true;
    }

    data.quotes.splice(idx, 1);
    saveQuotes(data);
    reply(`Deleted quote #${id}.`);
    return true;
  }

  return false;
}

export function tryHandleQuotesUserCommand({
  client,
  message,
  twitchUsername,
  channelName,
  botPrefix = "",
  userstate,
  isSharedCommandCooldownActive,
} = {}) {
  if (!client || typeof client.say !== "function") return false;
  if (typeof isSharedCommandCooldownActive !== "function") return false;

  const trimmedMessage = String(message || "").trim();
  const quoteMatch = trimmedMessage.match(/^!quote(?:\s+(.*))?$/i);
  if (!quoteMatch) return false;

  if (isSharedCommandCooldownActive(userstate)) return true;

  const chan = String(channelName || "").trim();
  const uname = String(twitchUsername || "").trim() || "unknown";

  const arg = String(quoteMatch[1] || "").trim();
  const data = loadQuotes();

  if (!data.quotes.length) {
    client.say(chan, `${botPrefix}@${uname}, there are no quotes saved yet.`);
    return true;
  }

  let quote = null;
  if (!arg) {
    quote = data.quotes[Math.floor(Math.random() * data.quotes.length)];
  } else {
    const idText = arg.replace(/^#/, "");
    if (!/^\d+$/.test(idText)) {
      client.say(chan, `${botPrefix}@${uname}, usage: !quote [id]`);
      return true;
    }

    const id = Number(idText);
    quote = data.quotes.find((entry) => entry.id === id) || null;
    if (!quote) {
      client.say(chan, `${botPrefix}@${uname}, quote #${id} not found.`);
      return true;
    }
  }

  client.say(chan, `${botPrefix}Quote #${quote.id}: ${quote.text}`);
  return true;
}

