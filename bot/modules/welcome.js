import { setTimeout as delay } from "timers/promises";

export async function handleFirstMessageWelcome({
  client,
  channelName,
  streamerDisplayName,
  twitchUsername,
  isFirstMessage,
  userstate,
} = {}) {
  if (!isFirstMessage) return false;

  const chan = String(channelName || "").replace(/^#/, "").trim();
  if (!chan) return false;

  const uname = String(twitchUsername || "").trim();
  if (!uname) return false;

  const display = String(streamerDisplayName || "").trim() || "Streamer";

  const responses = [
    `@${uname} welcome to ${display}'s stream!`,
    `Welcome @${uname}!`,
    `Hey @${uname}, welcome to the chat!`,
    `Hello @${uname}, welcome!`,
    `Glad you're here, @${uname}!`,
  ];

  const randomGreeting = responses[Math.floor(Math.random() * responses.length)];
  await delay(Math.floor(Math.random() * 45) * 1000);

  client.raw(
    `@client-nonce=${userstate?.["client-nonce"]};reply-parent-msg-id=${userstate?.["id"]} ` +
      `PRIVMSG #${chan} :${randomGreeting}`
  );
  return true;
}

