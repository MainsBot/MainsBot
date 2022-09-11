let filters = ["niggas", "nigga", "nigger", "faggot", "slut", "bitch"];

let chatByUser = {};


import "dotenv/config";

import { WebhookClient } from "discord.js";
const webhookClient = new WebhookClient({
  id: "977892593016901653",
  token: "OXZF43FQm6SAhRCFXjIJKKiQcVTdUIy38yx0fJuy_ptB5rGky_wXst4Xg9igFzWFz5is",
});

import fs, { lchown, link, readSync } from "fs";
import tmi from "tmi.js";
import fetch from "node-fetch";
import WebSocket from "ws";
import { setTimeout } from "timers/promises";
import stringSimilarity from "string-similarity";

//functions
import * as ROBLOX_FUNCTIONS from "./Functions/roblox.js";
import * as TWITCH_FUNCTIONS from "./Functions/twitch.js";
import * as FILTERS from "./FILTERS.js";
import * as RESPONSES from "./Functions/responses.js";
import * as FILTER_FUNCTIONS from "./FILTERS.js";

const tibb12Id = 1576231486; // roblox id for getting game and playtime

import buddyList, { wrapWebApi } from "spotify-buddylist";
import { join } from "path";
import { setEngine, setFips, verify } from "crypto";
import { get } from "http";
import { uptime } from "process";
import { match } from "assert";
import { platform } from "os";
import { time } from "console";
import { channel } from "diagnostics_channel";
import { resourceLimits } from "worker_threads";
import { clearScreenDown } from "readline";

const BOT_OAUTH = process.env.BOT_OAUTH; // bot oauth token for performing actions
const COOKIE = process.env.COOKIE; // <--- change this to your cookie

const BOT_NAME = process.env.BOT_NAME; // bot username
const CHANNEL_NAME = process.env.CHANNEL_NAME; // name of the channel for the bot to be in
const CHANNEL_ID = process.env.CHANNEL_ID; // id of channel for the bot to be in
const BOT_ID = process.env.BOT_ID;
const SPOTIFY_BOT_OAUTH = process.env.SPOTIFY_BOT_OAUTH;
const SPOTIFY_BOT_NAME = process.env.SPOTIFY_BOT_NAME;
const TIBB_TOKEN = process.env.TIBB_TOKEN;

// const MAINSMONITOR_COOKIE = process.env.MAINSMONITOR_COOKIE
const WAIT_REGISTER = 5 * 60 * 1000; // number of milliseconds, to wait before starting to get stream information

const COOLDOWN = process.env.COOLDOWN; // number of milliseconds, cool down for replying to people

// timers
const WAIT_UNTIL_FOC_OFF = process.env.WAIT_UNTIL_FOC_OFF; // 2 minutes
const WAIT_UNTIL_FOC_OFF_RAID = process.env.WAIT_UNTIL_FOC_OFF_RAID; // every 5 minutes
const SPAM_LINK = process.env.SPAM_LINK; // every 5 minutes
const JOIN_TIMER = process.env.JOIN_TIMER; // every 2 minutes
let MUTATED_JOIN_TIMER = 240000; // timer that uses the JOIN_TIMER to change the interval based on viewer count

const SONG_TIMER = process.env.SONG_TIMER;
const WEB_ACCESS_TOKEN = process.env.WEB_ACCESS_TOKEN;

const BLAKE_BOT_NAME = process.env.BLAKE_BOT_NAME;
const BLAKE_BOT_OAUTH = process.env.BLAKE_BOT_OAUTH;

const MAIN_BOT_NAME = process.env.MAIN_BOT_NAME;
const MAIN_BOT_OAUTH = process.env.MAIN_BOT_OAUTH;

const SISTER_BOT_NAME = process.env.SISTER_BOT_NAME;
const SISTER_BOT_OAUTH = process.env.SISTER_BOT_OAUTH;

const BADGER_OAUTH = 'sjyopvthkf6v2lpcykaox06ohq2xfs';
const BADGER_NAME = 'badger_mecool';

let SETTINGS = JSON.parse(fs.readFileSync("./SETTINGS.json"));
let STREAMS = JSON.parse(fs.readFileSync("./STREAMS.json"));
let WORDS = JSON.parse(fs.readFileSync("./WORDS.json"));
let TOUNFRIEND = JSON.parse(fs.readFileSync("./TOUNFRIEND.json"));

var commandsList = ["!join", "!link", "!ticket", "!1v1", "!wild"];

var streamNumber = Object.keys(STREAMS).length;
const client = new tmi.Client({
  options: { debug: true },
  identity: {
    username: BOT_NAME,
    password: `OAuth:${BOT_OAUTH}`,
  },
  channels: [CHANNEL_NAME, 'mr_cheeezzbot']
});

client.connect();

const songClient = new tmi.Client({
  options: { debug: true },
  identity: {
    username: SPOTIFY_BOT_NAME,
    password: `OAuth:${SPOTIFY_BOT_OAUTH}`,
  },
  channels: [CHANNEL_NAME]
});

songClient.connect();

const blakeClient = new tmi.Client({
  options: { debug: true },
  identity: {
    username: BLAKE_BOT_NAME,
    password: `OAuth:${BLAKE_BOT_OAUTH}`,
  },
  channels: [CHANNEL_NAME]
});

const mainClient = new tmi.Client({
  options: { debug: true },
  identity: {
    username: MAIN_BOT_NAME,
    password: `OAuth:${MAIN_BOT_OAUTH}`,
  },
  channels: [CHANNEL_NAME]
});

mainClient.connect();

const sisterClient = new tmi.Client({
  options: { debug: true },
  identity: {
    username: SISTER_BOT_NAME,
    password: `OAuth:${SISTER_BOT_OAUTH}`,
  },
  channels: [CHANNEL_NAME]
});

const badgerClient = new tmi.Client({
  options: { debug: true },
  identity: {
    username: BADGER_NAME,
    password: `OAuth:${BADGER_OAUTH}`,
  },
  channels: [CHANNEL_NAME]
});

// badgerClient.connect();

if (SETTINGS.ks == false) {
  blakeClient.connect();
  sisterClient.connect();
};

if (SETTINGS.ks == true) {
  blakeClient.disconnect();
  sisterClient.disconnect();
};


// interval timer for !join/!link/!1v1/!ticket
setInterval(async () => {
  STREAMS = JSON.parse(fs.readFileSync("./STREAMS.json"));
  SETTINGS = JSON.parse(fs.readFileSync("./SETTINGS.json"));

  if (SETTINGS.timers == true && SETTINGS.ks == false && (await TWITCH_FUNCTIONS.isLive()) == true) {
    var averageViewers = STREAMS.averageviewers;

    if (averageViewers == null) {
    } else if (averageViewers < 40) {
      MUTATED_JOIN_TIMER = JOIN_TIMER * 0.8;
    } else if (averageViewers > 60) {
      MUTATED_JOIN_TIMER = JOIN_TIMER * 1.5;
    }

    var currentMode = SETTINGS.currentMode.replace(".on", "");
    currentMode = currentMode.replace("!", "");

    var timerCommands = SETTINGS.timer;

    for (const key in timerCommands) {
      if (key == currentMode) {
        client.say(CHANNEL_NAME, `${timerCommands[key]}`);
      }
    }
  }
}, MUTATED_JOIN_TIMER);

setInterval(async () => {
  SETTINGS = JSON.parse(fs.readFileSync("./SETTINGS.json"));
 
  if (SETTINGS.currentMode == "!gamble.on" || SETTINGS.timers == true && SETTINGS.ks == false && (await TWITCH_FUNCTIONS.isLive()) == true) {

    var promo = [
      `!discord`,
      `!youtube`
    ];

    var discordTimer =
      promo[Math.floor(Math.random() * promo.length)];
    client.say(CHANNEL_NAME, ``);
  }
}, 60 * 7.4 * 1000);

setInterval(async () => {
  
  if ((await TWITCH_FUNCTIONS.isLive()) == false) {
    mainClient.say(CHANNEL_NAME, `!cookie`);
    mainClient.say(CHANNEL_NAME, `|poro`)
  }
}, 2 * 60 * 61 * 1000);


//interval timer for spamming link
setInterval(() => {
  SETTINGS = JSON.parse(fs.readFileSync("./SETTINGS.json"));
  if (SETTINGS.ks == false) {
    if (SETTINGS.currentLink != null) {
      if (SETTINGS.currentMode == "!link.on") {
        client.say(CHANNEL_NAME, `${SETTINGS.currentLink}`);
      }
    }
  }
}, SPAM_LINK);

//interval timer for checking song changes

let { accessToken } = await buddyList.getWebAccessToken(WEB_ACCESS_TOKEN);
let friends = await buddyList.getFriendActivity(accessToken).then((r) => {
  return r.friends;
});
let track;

if (friends.length != 0) {
  track = friends[0].track;
} else if (friends.length == 0) {
  track = "none";
}

let currentSong = track.name;

setInterval(async () => {
  SETTINGS = JSON.parse(fs.readFileSync("./SETTINGS.json"));

  if (SETTINGS.ks == false && (await TWITCH_FUNCTIONS.isLive()) == true) {
    // let { accessToken } = await buddyList.getWebAccessToken(WEB_ACCESS_TOKEN)
    friends = await buddyList.getFriendActivity(accessToken).then((r) => {
      return r.friends;
    });

    if (friends == undefined) {
      return;
    }
    if (friends.length != 0) {
      track = friends[0].track;
    } else if (friends.length == 0) {
      track = "none";
    }

    let newSong = friends[0].track.name;

    if (newSong != currentSong) {
      currentSong = track.name;

      const name = ([] = track.name.split(" "));
      const artist = ([] = track.artist.name.split(" "));

      var finalNameString = "";
      var finalArtistString = "";

      for (let a = 0; a <= name.length; a++) {
        if (a == name.length) {
        } else {
          const word = name[a];
          let isFilteredWord = name.some((word) =>
            filters.includes(word.toLowerCase())
          );

          if (isFilteredWord) {
            if (finalNameString.length != 0) {
              if (finalNameString[finalNameString.length - 1] == " ") {
                finalNameString +=
                  word[0] + word[1] + "*".repeat(word.length - 2);
              } else {
                finalNameString +=
                  " " + word[0] + word[1] + "*".repeat(word.length - 2);
              }
            } else {
              finalNameString +=
                word[0] + word[1] + "*".repeat(word.length - 2) + " ";
            }
          } else {
            if (finalNameString.length != 0) {
              if (finalNameString[finalNameString.length - 1] == " ") {
                finalNameString += word;
              } else {
                finalNameString += " " + word;
              }
            } else {
              finalNameString += word;
            }
          }
        }
      }

      for (let a = 0; a <= artist.length; a++) {
        if (a == artist.length) {
          songClient.say(
            CHANNEL_NAME,
            `tibb12 just finished listening to ${
              finalNameString.trimEnd() +
              "" +
              " by " +
              "" +
              finalArtistString.trim() +
              ""
            }`
          );
        } else {
          const word = artist[a];
          let isFilteredWord = artist.some((word) =>
            filters.includes(word.toLowerCase())
          );
          if (isFilteredWord) {
            if (finalArtistString.length != 0) {
              if (finalArtistString[finalArtistString.length - 1] == " ") {
                finalArtistString +=
                  word[0] + word[1] + "*".repeat(word.length - 2);
              } else {
                finalArtistString +=
                  " " + word[0] + word[1] + "*".repeat(word.length - 2);
              }
            } else {
              finalArtistString +=
                word[0] + word[1] + "*".repeat(word.length - 2) + " ";
            }
          } else {
            if (finalArtistString.length != 0) {
              if (finalArtistString[finalArtistString.length - 1] == " ") {
                finalArtistString += word + " ";
              } else {
                finalArtistString += " " + word;
              }
            } else {
              finalArtistString += word + " ";
            }
          }
        }
      }
    }
  }
}, SONG_TIMER);

async function ksHandler(client, lowerMessage, twitchUsername, userstate) {
  if (lowerMessage == "!ks.on") {
    if (SETTINGS.ks == true) {
      return client.raw(
        `@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Killswitch is already on.`
      );
    } else if (SETTINGS.ks == false) {
      SETTINGS.ks = true;
      fs.writeFileSync("./SETTINGS.json", JSON.stringify(SETTINGS));
      return client.raw(
        `@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :@${CHANNEL_NAME}, Killswitch is on, the bot will not be actively moderating.`
      );
    }
  } else if (lowerMessage == "!ks.off") {
    if (SETTINGS.ks == false) {
      return client.raw(
        `@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Killswitch is already off.`
      );
    } else if (SETTINGS.ks == true) {
      SETTINGS.ks = false;
      fs.writeFileSync("./SETTINGS.json", JSON.stringify(SETTINGS));
      return client.raw(
        `@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :@${CHANNEL_NAME}, Killswitch is off, the bot will be actively moderating.`
      );
    }
  }
}

async function keywordHandler(client, lowerMessage, twitchUsername, userstate) {
  if (lowerMessage == "!keywords.on") {
    if (SETTINGS.keywords == true) {
      return client.raw(
        `@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Keywords are already enabled.`
      );
    } else if (SETTINGS.timers == false) {
      SETTINGS.keywords = true;
      fs.writeFileSync("./SETTINGS.json", JSON.stringify(SETTINGS));
      return client.raw(
        `@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :@${CHANNEL_NAME}, Keywords are now enabled.`
      );
    }
  } else if (lowerMessage == "!keywords.off") {
    if (SETTINGS.keywords == false) {
      return client.raw(
        `@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Keywords are already disabled.`
      );
    } else if (SETTINGS.keywords == true) {
      SETTINGS.keywords = false;
      fs.writeFileSync("./SETTINGS.json", JSON.stringify(SETTINGS));
      return client.raw (
        `@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :@${CHANNEL_NAME}, Keywords are now disabled.`
      );
    }
  }
}

async function timerHandler(client, lowerMessage, twitchUsername, userstate) {
  if (lowerMessage == "!timer.on") {
    if (SETTINGS.timers == true) {
      return client.raw(
        `@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Timers are already on.`
      );
    } else if (SETTINGS.timers == false) {
      SETTINGS.timers = true;
      fs.writeFileSync("./SETTINGS.json", JSON.stringify(SETTINGS));
      return client.raw(
        `@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :@${CHANNEL_NAME}, Timers are now on.`
      );
    }
  } else if (lowerMessage == "!timer.off") {
    if (SETTINGS.timers == false) {
      return client.raw(
        `@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Timers are already off.`
      );
    } else if (SETTINGS.timers == true) {
      SETTINGS.timers = false;
      fs.writeFileSync("./SETTINGS.json", JSON.stringify(SETTINGS));
      return client.raw(
        `@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :@${CHANNEL_NAME}, Timers are now off.`
      );
    }
  }
}

async function logHandler(
  message,
  twitchUsername,
  twitchDisplayName,
  twitchUserId,
  isMod,
  isBroadcaster,
  isFirstMessage,
  isSubscriber,
  messageId
) {
  if (await TWITCH_FUNCTIONS.isLive()) {
    const timeDifference =
      (new Date().getTime() - STREAMS[streamNumber]["streamStart"]) / 1000;

    const hourMark = Math.floor(timeDifference / (60 * 60));
    const minuteMark = Math.floor((timeDifference - hourMark * 60 * 60) / 60);
    const secondMark = Math.floor(
      timeDifference - hourMark * 60 * 60 - minuteMark * 60
    );

    const zeroFilledHour = ("00" + hourMark).slice(-2);
    const zeroFilledMinute = ("00" + minuteMark).slice(-2);
    const zeroFilledSecond = ("00" + secondMark).slice(-2);

    const timestamp =
      zeroFilledHour + ":" + zeroFilledMinute + ":" + zeroFilledSecond;

    if (Object.keys(chatByUser).length == 0) {
      chatByUser[twitchUsername] = [];
      chatByUser[twitchUsername][0] = {
        displayName: twitchDisplayName,
        messageTime: new Date().getTime(),
        message: message,
        twitchUserId: twitchUserId,
        isMod: isMod,
        isBroadcaster: isBroadcaster,
        isFirstMessage: isFirstMessage,
        isSubscriber: isSubscriber,
        messageId: messageId,
      };
    } else {
      if (chatByUser[twitchUsername] == null) {
        chatByUser[twitchUsername] = [];
        chatByUser[twitchUsername][0] = {
          displayName: twitchDisplayName,
          messageTime: new Date().getTime(),
          message: message,
          twitchUserId: twitchUserId,
          isMod: isMod,
          isBroadcaster: isBroadcaster,
          isFirstMessage: isFirstMessage,
          isSubscriber: isSubscriber,
          messageId: messageId,
        };
      } else {
        chatByUser[twitchUsername][chatByUser[twitchUsername].length] = {
          displayName: twitchDisplayName,
          messageTime: new Date().getTime(),
          message: message,
          twitchUserId: twitchUserId,
          isMod: isMod,
          isBroadcaster: isBroadcaster,
          isFirstMessage: isFirstMessage,
          isSubscriber,
          messageId: messageId,
        };
      }
    }
  }
}

let shouldChangeLink = true;

async function newLinkHandler(client, message, twitchUsername, userstate) {
  message = message.trimStart();
  message = [] = message.split(" ");
  message = message[0];

  const isValidLink =
    message.includes("privateServerLinkCode") &&
    message.includes("https://www.roblox.com/games");
  const currentMode = SETTINGS.currentMode;

  if (isValidLink && shouldChangeLink == true) {
    SETTINGS.currentLink = message;
    if (currentMode == "!link.on") {
    } else {
      SETTINGS.currentMode = "!link.on";
    }

    const doesLinkExist = await TWITCH_FUNCTIONS.doesLinkExist();

    if (doesLinkExist) {
      client.say(
        CHANNEL_NAME,
        `!editcom !link /me : $(touser), [💻 PC USERS] Click this link to join -> ${message} [📱 MOBILE] Click to learn how to join -> youtu.be/MJJ89F_DzEE`
      );
    } else {
      client.say(
        CHANNEL_NAME,
        `!addcom !link /me : $(touser), [💻 PC USERS] Click this link to join -> ${message} [📱 MOBILE] Click to learn how to join -> youtu.be/MJJ89F_DzEE`
      );
    }
    fs.writeFileSync("./SETTINGS.json", JSON.stringify(SETTINGS));
    shouldChangeLink = false;
    await setTimeout(1 * 60 * 1000);
    shouldChangeLink = true;
  }
}
async function customModFunctions(client, message, twitchUsername, userstate) {
  var messageArray = ([] = message.toLowerCase().split(" "));

  if (messageArray[0] == "!ping") {
    if (messageArray[1] == null) {
      return client.raw(
        `@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Please specify a valid ping, Valid Pings: outlaster, arsenal, criminality, hoopz, sacrifice sanctuary, counter blox, phantom forces, expeditions, football, combat warriors, the trials, obby, horror games`
      );
    } else {
      messageArray.shift();

      const validPings = [
        "outlaster",
        "arsenal",
        "criminality",
        "hoopz",
        "sacrifice sanctuary",
        "counter blox",
        "phantom forces",
        "expeditions",
        "football",
        "combat warriors",
        "the trials",
        "obby",
        "horror games",
      ];

      const ping = messageArray.join(" ");

      if (validPings.includes(ping.toLowerCase())) {
//         const newJoin = new MessageEmbed()
//           .setColor("#00FF00")
//           .setTitle("PLAYER JOIN")
//           .setDescription("")
//           .setThumbnail(`${base}`)
//           .addFields(
//             { name: "Name", value: `\`\`\`${username}\`\`\``, inline: true },
//             {
//               name: "Display Name",
//               value: `\`\`\`${displayName}\`\`\``,
//               inline: true,
//             },
//             {
//               name: "Lowercase Name",
//               value: `\`\`\`${username.toLowerCase()}\`\`\``,
//               inline: true,
//             },
//             { name: "User Id", value: `\`\`\`${userId}\`\`\``, inline: true },
//             // { name: 'In Discord', value: 'FALSE' },
//             { name: "Account Age", value: `\`\`\`${age}\`\`\``, inline: true },
//             {
//               name: "Profile Link",
//               value: `https://web.roblox.com/users/${userId}/profile`,
//               inline: false,
//             },
//             // { name: 'Player Token', value: `${playerToken}` },
//             // { name: 'Associated With Exploiters', value: 'FALSE' },
//             // { name: 'Friends', value: '0' },
//             // { name: '\u200B', value: '\u200B' },
//             // { name: 'Age', value: '5 days 6 hours ', inline: true },
//             { name: "Join Code", value: `${joinCode}`, inline: true },
//             { name: "Server Name", value: `${serverName}`, inline: true },
//             { name: "Private Server Id", value: `${serverId}`, inline: true },
//             { name: "Game Name ", value: `${gameName}`, inline: true },
//             { name: "Place Id ", value: `${placeId}`, inline: true }
//           )
//           // .addField('Inline field title', 'Some value here', true)
//           .setImage(baseAvatar)
//           .setTimestamp();
//         // .setFooter({ text: 'sent by mains monitor', iconURL: 'https://i.imgur.com/NVO6Tbh.png' });

//         webhookClient.send({
//           content: `----------------------------------------------------------------------------------------------------------------------------------------------------------------`,
//           username: "Mains Monitor",
//           avatarURL: "https://i.imgur.com/NVO6Tbh.png",
//           embeds: [newJoin],
//         });
        
      }
    }
  }
  if (
    message.toLowerCase() == "!foc" ||
    message.toLowerCase() == "!foc on" ||
    message.toLowerCase() == "!focon"
  ) {
    client.say(CHANNEL_NAME, `/followers`);
  } else if (
    message.toLowerCase() == "!foc off" ||
    message.toLowerCase() == "!focoff"
  ) {
    client.say(CHANNEL_NAME, `/followersoff`);
  }

  if (
    message.toLowerCase() == "!follower.on" ||
    message.toLowerCase() == "!followers.on"
  ) {
    SETTINGS["followerOnlyMode"] == true;
    fs.writeFileSync("./SETTINGS.json", JSON.stringify(SETTINGS));
    SETTINGS = JSON.parse(fs.readFileSync("./SETTINGS.json"));
  } else if (
    message.toLowerCase() == "!follower.off" ||
    message.toLowerCase() == "!followers.off"
  ) {
    SETTINGS["followerOnlyMode"] == false;
    fs.writeFileSync("./SETTINGS.json", JSON.stringify(SETTINGS));
    SETTINGS = JSON.parse(fs.readFileSync("./SETTINGS.json"));
  }

  if (messageArray[0] == "!announce") {
    if (messageArray.length < 2)
      return client.say(
        CHANNEL_NAME,
        `@${twitchUsername}, please include a message to announce, e.g. !announce test`
      );

    messageArray.splice(0, 1);

    TWITCH_FUNCTIONS.makeAnnouncement(messageArray.join(" "));
  }

  if (messageArray[0] == "!delpoll") {
    TWITCH_FUNCTIONS.deleteCurrentPoll();
  }
  if (messageArray[0] == "!endpoll") {
    TWITCH_FUNCTIONS.deleteCurrentPoll();
  }
  if (messageArray[0] == "!emoteonlyon" || messageArray[0] == "!emoteonly") {
    client.say(CHANNEL_NAME, `/emoteonly`);
  }
  if (messageArray[0] == "!emoteonlyoff") {
    client.say(CHANNEL_NAME, `/emoteonlyoff`);
  }

  if (
    message.toLowerCase() == "!soc" ||
    message.toLowerCase() == "!soc on" ||
    message.toLowerCase() == "!socon"
  ) {
    client.say(CHANNEL_NAME, `/subscribers`);
  }

  if (
    message.toLowerCase() == "!soc off" ||
    message.toLowerCase() == "!socoff"
  ) {
    client.say(CHANNEL_NAME, `/subscribersoff`);
  }

  if (messageArray[0] == "!add") {
    if (messageArray[1] == null) {
      return client.raw(
        `@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Please specify a user to add.`
      );
    }

    const isValidUser = await ROBLOX_FUNCTIONS.isValidRobloxUser(
      messageArray[1]
    );

    if (!isValidUser.isValidUser)
      return client.raw(
        `@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Not a valid username.`
      );

    const friend = await ROBLOX_FUNCTIONS.sendFriendRequest(isValidUser.userId);

    if (friend == "already") {
      const friends = await ROBLOX_FUNCTIONS.getCurrentUserFriends(3511204536);

      let alreadyFriend = false;

      friends.forEach(function (friend) {
        if (friend.id == isValidUser.userId) {
          alreadyFriend = true;
        }
      });

      if (alreadyFriend)
        return client.raw(
          `@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :${messageArray[1]} is already added.`
        );

      return client.raw(
        `@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Already sent ${messageArray[1]} a friend request.`
      );
    } else if (friend != "success") {
      return client.raw(
        `@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :[Error: Unknown Error Ocurred]`
      );
    }

    TOUNFRIEND = JSON.parse(fs.readFileSync('./TOUNFRIEND.json'))

    TOUNFRIEND[isValidUser.userId] = messageArray[1]
    fs.writeFileSync('./TOUNFRIEND.json', JSON.stringify(TOUNFRIEND, null, 1))
    TOUNFRIEND = JSON.parse(fs.readFileSync('./TOUNFRIEND.json'))

    client.raw(
      `@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Sent a friend request to ${messageArray[1]}.`
    );
  }
}

async function customUserFunctions(client, message, twitchUsername, userid) {
  var messageArray = ([] = message.toLowerCase().split(" "));

  if (messageArray[0] == "!cptotime") {
    if (messageArray[1] == undefined) {
      return client.say(
        CHANNEL_NAME,
        `@${twitchUsername}, please specify an amount of channel points to convert to farming time. If you want you can also specify what tier you want to check, for example !cptotime 1000 tier1`
      );
    } else if (isNaN(messageArray[1]) == true) {
      return client.say(
        CHANNEL_NAME,
        `@${twitchUsername}, number of channel points must be a number.`
      );
    } else {
      const cp = messageArray[1];

      if (
        messageArray[2] == "tier1" ||
        messageArray[2] == "tier2" ||
        messageArray[2] == "tier3" ||
        messageArray[2] == "nosub"
      ) {
        let tierToCheck = messageArray[2];

        const standardRate = 5.33333333;

        const t1Rate = 5.3333333 * 1.2;
        const t2Rate = 5.3333333 * 1.4;
        const t3Rate = 5.3333333 * 2;

        let rate;
        let sub;

        if (tierToCheck == "tier1") {
          rate = t1Rate;
          sub = "you had a Tier 1 sub";
        } else if (tierToCheck == "tier2") {
          rate = t2Rate;
          sub = "you had a Tier 2 sub";
        } else if (tierToCheck == "tier3") {
          rate = t3Rate;
          sub = "you had a Tier 3 sub";
        } else if (tierToCheck == "nosub") {
          rate = standardRate;
          sub = "you had no sub";
        }

        const test = cp / rate / (60 * 24 * 365);

        const cpToHours = ROBLOX_FUNCTIONS.timeToAgo(test);

        client.say(
          CHANNEL_NAME,
          `@${twitchUsername}, IF ${sub}, it would take ${
            cpToHours.timeString
          } to farm ${ROBLOX_FUNCTIONS.formatNumber(cp)} channel points.`
        );
      } else {
        const getSubStatus = await TWITCH_FUNCTIONS.getSubStatus(userid);

        const tier = getSubStatus.data;

        const standardRate = 5.33333333;

        const t1Rate = 5.3333333 * 1.2;
        const t2Rate = 5.3333333 * 1.4;
        const t3Rate = 5.3333333 * 2;

        let rate;
        let sub;

        if (tier.tier != null) {
          if (tier == 1000) {
            rate = t1Rate;
            sub = "you're a tier 1 sub";
          } else if (tier == 2000) {
            rate = t2Rate;
            sub = "you're a tier 2 sub";
          } else if (tier == 3000) {
            rate = t3Rate;
            sub = "you're a tier 3 sub";
          }
        } else {
          rate = standardRate;
          sub = "you dont have a sub";
        }

        const test = cp / rate / (60 * 24 * 365);

        const cpToHours = ROBLOX_FUNCTIONS.timeToAgo(test);

        client.say(
          CHANNEL_NAME,
          `@${twitchUsername}, since ${sub}, it would take ${
            cpToHours.timeString
          } to farm ${ROBLOX_FUNCTIONS.formatNumber(cp)} channel points.`
        );

        return;
      }
    }
  } else if (messageArray[0] == "!whogiftedme") {
    const getSubStatus = await TWITCH_FUNCTIONS.getSubStatus(userid);

    const data = getSubStatus.data;

    if (data.length != 0) {
      if (data[0].is_gift == false) {
        return client.say(
          CHANNEL_NAME,
          `@${twitchUsername}, you were not gifted a sub, you subscribed yourself.`
        );
      }
    }
    const channelEmotes = await TWITCH_FUNCTIONS.getChannelEmotes(userid);
    const emoteData = channelEmotes.data;

    let emoteTable = {
      "Tier 1": [20],
      "Tier 2": [40],
      "Tier 3": [100],
    };

    for (let i = 0; i < emoteData.length; i++) {
      const emote = emoteData[i];

      const emoteTier = emote.tier;

      if (emoteTier == 1000) {
        emoteTable["Tier 1"].push(emote);
      } else if (emoteTier == 2000) {
        emoteTable["Tier 2"].push(emote);
      } else if (emoteTier == 3000) {
        emoteTable["Tier 3"].push(emote);
      }
    }

    if (data.length != 0) {
      const gifter = data[0].gifter_name;

      let tier;

      if (data[0].tier == 1000) {
        tier = "Tier 1";
      } else if (data[0].tier == 2000) {
        tier = "Tier 2";
      } else if (data[0].tier == 3000) {
        tier = "Tier 3";
      }

      function findItem(arr, randomEmote) {
        for (var i = 0; i < arr.length; ++i) {
          var obj = arr[i];
          if (obj.name == randomEmote) {
            return i;
          }
        }
        return -1;
      }
      var exemption1 = findItem(emoteData, "tibb12Howdy");
      emoteData.splice(exemption1, 1);

      const randomEmote1 =
        emoteData[Math.floor(Math.random() * emoteData.length)].name;
      var i = findItem(emoteData, randomEmote1);
      emoteData.splice(i, 1);
      const randomEmote2 =
        emoteData[Math.floor(Math.random() * emoteData.length)].name;
      var e = findItem(emoteData, randomEmote2);
      emoteData.splice(i, 1);
      const randomEmote3 =
        emoteData[Math.floor(Math.random() * emoteData.length)].name;

      return client.say(
        CHANNEL_NAME,
        `@${twitchUsername}, ${gifter} , gifted you a ${tier} sub. As a ${tier} sub you have access to ${emoteTable[tier].length} channel emotes and earn ${emoteTable[tier][0]}% more channel points. Here are three channel emotes you have with a ${tier} sub, ${randomEmote1} ${randomEmote2} ${randomEmote3}`
      );
    } else {
      return client.say(
        CHANNEL_NAME,
        `@${twitchUsername}, you don't currently have a sub.`
      );
    }
  }
}

async function updateMode(client, message, twitchUsername, userstate) {
  var messageArray = ([] = message.toLowerCase().split(" "));

  if (!messageArray[0].includes("!")) return;
  if (!messageArray[0].includes(".on")) return;

  var isValidMode = SETTINGS.validModes.includes(messageArray[0]);
  var isIgnoreMode = SETTINGS.ignoreModes.includes(messageArray[0]);
  var isSpecialMode = SETTINGS.specialModes.includes(messageArray[0]);
  var isCustomMode = SETTINGS.customModes.includes(messageArray[0]);

  if (isIgnoreMode || isSpecialMode || isCustomMode) return;

  if (!isValidMode)
    return client.raw(
      `@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :${message} is not a valid mode. Valid Modes: !join.on, !link.on !1v1.on, !ticket.on, !gamble.on`
    );
  if (SETTINGS.currentMode == messageArray[0])
    return client.raw(
      `@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :${messageArray[0]} mode is already on.`
    );
  //     fetch("https://gql.twitch.tv/gql", {
  //     "headers": {
  //       "authorization": "OAuth bt29j37avjsigokzr3jq6bt0gscxu7",
  //       "client-id": "kimne78kx3ncx6brgo4mv6wki5h1ko",
  //     },
  //     "body": `[{"operationName":"EditBroadcastContext_ChannelTagsMutation","variables":{"input":{"contentID":"197407231","contentType":"USER","tagIDs":["6ea6bca4-4712-4ab9-a906-e3336a9d8039","ac763b17-7bea-4632-9eb4-d106689ff409","e90b5f6e-4c6e-4003-885b-4d0d5adeb580","8bbdb07d-df18-4f82-a928-04a9003e9a7e","64d9afa6-139a-48d5-ab4e-51d0a92b22de","52d7e4cc-633d-46f5-818c-bb59102d9549"],"authorID":"197407231"}},"extensions":{"persistedQuery":{"version":1,"sha256Hash":"4dd3764af06e728e1b4082b4dc17947dd51ab1aabbd8371ff49c01e440dfdfb1"}}},{"operationName":"EditBroadcastContext_BroadcastSettingsMutation","variables":{"input":{"broadcasterLanguage":"en","game":"Roblox","status":"dasas","userID":"197407231"}},"extensions":{"persistedQuery":{"version":1,"sha256Hash":"856e69184d9d3aa37529d1cec489a164807eff0c6264b20832d06b669ee80ea5"}}}]`,
  //     "method": "POST"
  //     })

  if (SETTINGS.currentMode == "!link.on") {
    SETTINGS.currentLink = null;
    client.say(CHANNEL_NAME, "!delcom !link");
  }
  // if(SETTINGS.currentMode == '!ticket.on'){
  //   const result = await TWITCH_FUNCTIONS.pauseTicketRedemption(true)
  //   if(result){
  //     client.say(CHANNEL_NAME, `@${CHANNEL_NAME}, successfully paused ticket redemption.`)
  //   }else{
  //     client.say(CHANNEL_NAME, `@${CHANNEL_NAME}, error ocurred when trying to pause ticket redemption`)
  //   }
  // }
  // if(messageArray[0] == '!ticket.on'){
  //   const result = await TWITCH_FUNCTIONS.pauseTicketRedemption(false)
  //     client.say(CHANNEL_NAME, `@${twitchUsername}, ${result}`)
  //   if(result){
  //     client.say(CHANNEL_NAME, `@${CHANNEL_NAME}, successfully unpaused ticket redemption.`)
  //   }else{
  //     client.say(CHANNEL_NAME, `@${CHANNEL_NAME}, error ocurred when trying to unpause ticket redemption`)
  //   }
  // }

  client.raw(
    `@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :@${CHANNEL_NAME}, ${messageArray[0]} mode is now on.`
  );
  SETTINGS.currentMode = messageArray[0];

  fs.writeFileSync("./SETTINGS.json", JSON.stringify(SETTINGS));

  SETTINGS = JSON.parse(fs.readFileSync("./SETTINGS.json"));
}

async function newUserHandler(client, message, twitchUsername, isFirstMessage, userstate) {
  if (isFirstMessage) {
    var responses = [
      `${twitchUsername} Hello, welcome to the stream tibb12Waving!`,
      `${twitchUsername}, Welcome to the chat tibb12Waving!`,
      `Welcome, ${twitchUsername} to the stream tibb12Waving!`,
      `Hello, ${twitchUsername} tibb12Waving welcome to the stream!`,
      `Hey, ${twitchUsername}, Welcome to the stream tibb12Waving!`,
      `Everyone welcome ${twitchUsername} to the stream. Welcome @${twitchUsername} tibb12Waving!`,
      `Welcome tibb12Waving ${twitchUsername}, how are you doing!`
    ];
    var mainResponses = [
      `Hello, welcome to the stream tibb12Waving !`,
      `Welcome to the chat tibb12Waving!`,
      `Hello welcome to the stream tibb12Waving`,
      `Hey welcome tibb12Waving`
    ];
    var blakeResponses = [
      `tibb12Waving!!`,
      `tibb12Waving hi!!`,
      `Hey welcome tibb12Waving`,
      `tibb12Wave`,
      `tibb12Waving hello`,
      `Welcome! tibb12Waving tibb12Waving`,
      `tibb12Waving tibb12Waving`,
      `tibb12Waving`,
      `Welcome tibb12Love`,
      `Hi welcome`,
      `welcome to the stream tibb12Waving`,
      `hey bro welcome`
    ];
    var sisterResponses = [
      `tibb12Waving!!`,
      `tibb12Waving hi!!`,
      `Hey welcome tibb12Waving`,
      `tibb12Wave`,
      `tibb12Waving hello`,
      `Welcome! tibb12Waving tibb12Waving`,
      `tibb12Waving tibb12Waving`,
      `tibb12Waving`,
      `Welcome tibb12Love`,
      `Hi welcome`,
      `welcome to the stream tibb12Waving`,
      `hey bro welcome`
    ];

      var randomGreetingMain =
      mainResponses[Math.floor(Math.random() * mainResponses.length)];
      await setTimeout(Math.floor(Math.random() * 20) * 1000)
      mainClient.raw(`@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :${randomGreetingMain}`);
      var randomGreeting =
      responses[Math.floor(Math.random() * responses.length)];
      await setTimeout(Math.floor(Math.random() * 45) * 1000)
      client.raw(`@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :${randomGreeting}`);
      var randomGreetingBlake =
      blakeResponses[Math.floor(Math.random() * blakeResponses.length)];
      await setTimeout(Math.floor(Math.random() * 150) * 1000)
      blakeClient.raw(`@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :${randomGreetingBlake}`);
      var randomGreetingSister =
      sisterResponses[Math.floor(Math.random() * sisterResponses.length)];
      await setTimeout(Math.floor(Math.random() * 150) * 1000)
      sisterClient.raw(`@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :${randomGreetingSister}`);
  }
}

async function filterHandler(client, message, twitchUsername, userstate) {
  const messageArray = ([] = message.toLowerCase().split(" "));
  message = messageArray[0];

  if (
    !(
      message == "!spamfilter.on" ||
      message == "!lengthfilter.on" ||
      message == "!spamfilter.off" ||
      message == "!lengthfilter.off"
    )
  )
    return;

  if (message == "!spamfilter.on") {
    if (SETTINGS["spamFilter"] == true) {
      client.raw(
        `@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Spam filter is already on.`
      );
    } else {
      SETTINGS["spamFilter"] = true;
      client.raw(`@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Spam filter is now on.`);
      fs.writeFileSync("./SETTINGS.json", JSON.stringify(SETTINGS));
    }
  } else if (message == "!spamfilter.off") {
    if (SETTINGS["spamFilter"] == false) {
      client.raw(
        `@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Spam filter is already off.`
      );
    } else {
      SETTINGS["spamFilter"] = false;
      client.raw(`@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Spam filter is now off.`);
      fs.writeFileSync("./SETTINGS.json", JSON.stringify(SETTINGS));
    }
  } else if (message == "!lengthfilter.on") {
    const mode = SETTINGS["lengthFilter"];
    if (mode == true) {
      client.raw(
        `@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Length filter is already on.`
      );
    } else {
      SETTINGS["lengthFilter"] = true;
      client.raw(`@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Length filter is now on.`);
      fs.writeFileSync("./SETTINGS.json", JSON.stringify(SETTINGS));
    }
  } else if (message == "!lengthfilter.off") {
    const mode = SETTINGS["lengthFilter"];
    if (mode == false) {
      client.raw(
        `@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Length filter is already off.`
      );
    } else {
      SETTINGS["lengthFilter"] = false;
      client.raw (`@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Length filter is now off.`);
      fs.writeFileSync("./SETTINGS.json", JSON.stringify(SETTINGS));
    }
  }
}

async function joinHandler(
  message,
  twitchUsername,
  isModOrBroadcaster,
  twitchUserId
) {
  const currentMode = SETTINGS.currentMode;
  let responseLimit = 1;
  let responseCount = 0;

  if (SETTINGS.ks == true) return;
  if (SETTINGS.ks == false) {
    for (const wordSet in WORDS) {
      if (responseLimit == 0) {
        break;
      }
      if (WORDS[wordSet].some((word) => message.toLowerCase().includes(word))) {
        if (wordSet == "music") {
          RESPONSES.responses[wordSet](
            songClient,
            twitchUsername,
            message,
            filters
          );
        } else if (wordSet == "corrections") {
          RESPONSES.responses[wordSet](
            client,
            twitchUsername,
            message,
            isModOrBroadcaster
          );
        } else if (wordSet == "whogiftedme") {
          RESPONSES.responses[wordSet](
            client,
            twitchUsername,
            message,
            isModOrBroadcaster,
            twitchUserId
          );
        } else if (wordSet == "game") {
          RESPONSES.responses[wordSet](client, twitchUsername)
        } else {
          RESPONSES.responses[wordSet](client, twitchUsername, message);
        }
        responseLimit -= 1;
      }
    }
  }

  if (responseCount > 4) {
    client.say(
      CHANNEL_NAME,
      `@${twitchUsername} stop trying to abuse keywords. [Keywords Detected: ${responseCount}]`
      );
    TWITCH_FUNCTIONS.timeoutUser(
      twitchUsername,
      "[AUTOMATIC] attempt to abuse keywords. - MainsBot",
      30
    );
  }
}

// TO DO: make it so that after !xqcchat.off it goes back to what modes it was orignally

async function customModeHandler(client, message, twitchUsername, userstate) {
  var messageArray = ([] = message.toLowerCase().split(" "));
  var duration = null;

  var customModes = SETTINGS.customModes;

  if (customModes.includes(messageArray[0]) == false) return;

  if (!Number.isNaN(messageArray[1])) {
    duration = messageArray[1];
  }

  if (messageArray[0] == "!xqcchat.on") {
    SETTINGS["spamFilter"] = false;
    SETTINGS["lengthFilter"] = false;

    if (duration != null) {
      client.raw(
        `@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Enabled xqcchat, all filters disabled for ${duration} seconds.`
      );
      fs.writeFileSync("./SETTINGS.json", JSON.stringify(SETTINGS));
      await setTimeout(duration * 1000);
      SETTINGS["spamFilter"] = true;
      SETTINGS["lengthFilter"] = true;
      client.raw(
        `@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :@${CHANNEL_NAME}, xqcchat is now disabled as ${duration} seconds has passed, all filters enabled`
      );
      fs.writeFileSync("./SETTINGS.json", JSON.stringify(SETTINGS));
    } else {
      client.raw(
        `@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :@${CHANNEL_NAME}, xqcchat is now enabled until a mod or broadcaster disables it, all filters disabled`
      );
      fs.writeFileSync("./SETTINGS.json", JSON.stringify(SETTINGS));
    }
  } else if (messageArray[0] == "!xqcchat.off") {
    SETTINGS["spamFilter"] = true;
    SETTINGS["lengthFilter"] = true;
    client.raw(
      `@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Disabled xqcchat, all filters enabled`
    );
    fs.writeFileSync("./SETTINGS.json", JSON.stringify(SETTINGS));
  }
}
let user = {};

async function updatePredictionLeaderboard() {
  var followers = JSON.parse(fs.readFileSync("./USERDATA.json"));

  var data = JSON.parse(fs.readFileSync("./PREDICTIONDATA.json"));
  var predictions = data[1].length;

  var totalPredictionWindow = 0;
  var titles = [];
  var titleLeaderboard = {};
  var totalChannelPoints = 0;
  var totalBits = 0;
  var totalChannelPointsWon = 0;
  var totalChannelPointsLost = 0;

  var predictionWinnerLeaderboard = {};
  var predictionLoserLeaderboard = {};

  var channelPointWinnerLeaderboard = {};
  var channelPointLoserLeaderboard = {};

  var uniqueVoters = [];
  var totalVoters = 0;

  var averageVoteAmount = 0;

  data[1].forEach(function (prediction) {
    var predictionId = prediction.id;
    var title = prediction.title;
    var choices = prediction.outcomes;

    var totalBits = 0;

    totalPredictionWindow += prediction.prediction_window;

    titles.push(title);

    if (prediction.winning_outcome_id != null) {
      var winnerId = prediction.winning_outcome_id;

      choices.forEach(function (choice) {
        var choiceId = choice.id;

        if (choiceId == winnerId && choice.top_predictors != null) {
          choice.top_predictors.forEach(function (predictor) {
            var user_id = predictor.user_id;

            var channel_points_used = predictor.channel_points_used;
            var channel_points_won = predictor.channel_points_won;
            var difference = channel_points_won - channel_points_used;

            if (predictionWinnerLeaderboard[user_id] == null) {
              predictionWinnerLeaderboard[user_id] = difference;
            } else {
              predictionWinnerLeaderboard[user_id] += difference;
            }
            totalVoters += 1;

            if (uniqueVoters.includes(user_id) == false) {
              uniqueVoters.push(user_id);
            }
          });
        }
        totalBits += choice.bits;

        totalChannelPoints += choice.channel_points;
      });
    }
  });

  var averagePredictionLength = Math.floor(totalPredictionWindow / predictions);

  titles.forEach(function (title, index) {
    if (titleLeaderboard[title] == null) {
      titleLeaderboard[title] = 1;
    } else if (titleLeaderboard[title] != null) {
      titleLeaderboard[title] += 1;
    }
  });

  var predictionWinnerLeaderboardUsernames = {};

  for (const userid in predictionWinnerLeaderboard) {
    if (followers[userid] != null) {
      predictionWinnerLeaderboardUsernames[followers[userid].from_login] =
        predictionWinnerLeaderboard[userid];
    } else {
      const username = await TWITCH_FUNCTIONS.getTwitchUsernameFromUserId(
        userid
      );
      if (username != false) {
        followers[userid] = { from_login: username.login };
        fs.writeFileSync("./USERDATA.json", JSON.stringify(followers, null, 2));
        predictionWinnerLeaderboardUsernames[username.login] =
          predictionWinnerLeaderboard[userid];
      }
    }
  }

  function sortObjectbyValue(obj = {}, asc = false) {
    const ret = {};
    Object.keys(obj)
      .sort((a, b) => obj[asc ? a : b] - obj[asc ? b : a])
      .forEach((s) => (ret[s] = obj[s]));
    return ret;
  }
  (titleLeaderboard = sortObjectbyValue(titleLeaderboard)), null, 2;
  delete titleLeaderboard[Object.keys(titleLeaderboard)[0]];

  (predictionWinnerLeaderboardUsernames = sortObjectbyValue(
    predictionWinnerLeaderboardUsernames
  )),
    null,
    2;

  data[0].total.predictions = data[1].length;
  data[0].leaderboard.predictionTitles = titleLeaderboard;
  data[0].total.channelPointsSpent = totalChannelPoints;
  data[0].total.channelPointsChange = totalChannelPoints;

  console.log("test");
  console.log(JSON.stringify(predictionWinnerLeaderboardUsernames, null, 2));
  console.log(totalChannelPoints);
  console.log(averagePredictionLength);
  console.log(titleLeaderboard);
}
client.on("message", async (channel, userstate, message, self, viewers, target) => {
  if (self) return;
  SETTINGS = JSON.parse(fs.readFileSync("./SETTINGS.json"));
  STREAMS = JSON.parse(fs.readFileSync("./STREAMS.json"));

  const lowerMessage = message.toLowerCase();

  const isVip = (() => {
    if (userstate["badges"] && userstate["badges"].vip == 1) {
      return true;
    } else {
      return false;
    }
  })();

  const isSubscriber = userstate["subscriber"];
  const isFirstMessage = userstate["first-msg"];
  const subscriberMonths = (() => {
    if (isSubscriber) {
      return userstate["badge-info"].subscriber;
    } else {
      return null;
    }
  })();
  const hexNameColor = userstate.color;
  const badgeInfo = userstate["badge-info"];
  const messageId = userstate["id"];
  const twitchUserId = userstate["user-id"];
  const twitchUsername = userstate["username"];
  const twitchDisplayName = userstate["display-name"];
  const isTurbo = userstate["turbo"];

  const isMod = userstate["mod"];
  const isBroadcaster =
    twitchUsername.toLowerCase() == CHANNEL_NAME.toLowerCase();
  const ModOrBroadcaster = isMod || isBroadcaster;
  const isBot = SETTINGS.bots.includes(twitchUsername.toLowerCase());

  const userData = {
    isSubscriber: isSubscriber,
    isFirstMessage: isFirstMessage,
    subscriberMonths: subscriberMonths,
    hexNameColor: hexNameColor,
    badgeInfo: badgeInfo,
    messageId: messageId,
    twitchUserId: twitchUserId,
    twitchUsername: twitchUsername,
    twitchDisplayName: twitchDisplayName,
    isTurbo: isTurbo,
  };

  if (SETTINGS.ks == true && !ModOrBroadcaster) {
    return;
  }

  streamNumber = Object.keys(STREAMS).length;

  if (ModOrBroadcaster && !isBot) {
    ksHandler(client, lowerMessage, twitchUsername, userstate);
    keywordHandler(client, lowerMessage, twitchUsername, userstate);
    timerHandler(client, lowerMessage, twitchUsername, userstate);
    updateMode(client, message, twitchUsername, userstate);
    filterHandler(client, message, twitchUsername, userstate);
    customModeHandler(client, message, twitchUsername, userstate);
    newLinkHandler(client, message, twitchUsername, userstate);
    customUserFunctions(client, message, twitchUsername, twitchUserId);
    customModFunctions(client, message, twitchUsername, userstate);
    customModCommands(client, message, twitchUsername, userstate);

    // CHANGE TITLE THING
    if (await TWITCH_FUNCTIONS.isLive() == true) {

      const joinTitle = "🤑GIVING AWAY ROBUX ⱼₖ🤑🥺100000 ROBUX ⱼₖ🥺🍑PLAYING W/FOLLOWERS🍑!JOIN to play🍁!schedule !socials !discord !yt🍁"
      const linkTitle = "🤑GIVING AWAY ROBUX ⱼₖ🤑🥺100000 ROBUX ⱼₖ🥺🍑PLAYING W/FOLLOWERS🍑!LINK to play🍁!schedule !socials !discord !yt🍁"
      const arsenalTitle = "🤑ARSENAL 1V1'S FOR ⁿᵒ ROBUX🤑🥺100000 ROBUX ⱼₖ🥺🍑ARSENAL 1V1'S W/FOLLOWERS🍑!1V1 to play🍁!schedule !socials !discord !yt🍁"
      const ticketTItle = "🤑GIVING AWAY ROBUX ⱼₖ🤑🥺100000 ROBUX ⱼₖ🥺🍑PLAYING W/FOLLOWERS🍑!TICKET to join🍁!schedule !socials !discord !yt🍁"
      const gambaTitle = "🤑GAMBLING 1 MIL ROBUX🤑💰ROBUX GIVEAWAY💰🍑!WILD🍑🍁!schedule !socials !discord !yt🍁 #ad"

      // Sponsor Title & Game [UPDATE]
      const sponsorTitle = "🍑PLAYING W/FOLLOWERS🍑!FORTNITE to play🍁!schedule !socials !discord !yt🍁 #ad"
      const sponsorGame = "Fortnite"
 
    if (message.toLowerCase() == "!join.on") {
      fetch("https://gql.twitch.tv/gql", {
      "headers": {
        "authorization": `OAuth ${BOT_OAUTH}`,
        "client-id": "kimne78kx3ncx6brgo4mv6wki5h1ko",
      },
      "body": `[{"operationName":"EditBroadcastContext_ChannelTagsMutation","variables":{"input":{"contentID":"197407231","contentType":"USER","tagIDs":["6ea6bca4-4712-4ab9-a906-e3336a9d8039","ac763b17-7bea-4632-9eb4-d106689ff409","e90b5f6e-4c6e-4003-885b-4d0d5adeb580","8bbdb07d-df18-4f82-a928-04a9003e9a7e","64d9afa6-139a-48d5-ab4e-51d0a92b22de","52d7e4cc-633d-46f5-818c-bb59102d9549"],"authorID":"197407231"}},"extensions":{"persistedQuery":{"version":1,"sha256Hash":"4dd3764af06e728e1b4082b4dc17947dd51ab1aabbd8371ff49c01e440dfdfb1"}}},{"operationName":"EditBroadcastContext_BroadcastSettingsMutation","variables":{"input":{"broadcasterLanguage":"en","game":"Roblox","status":"${joinTitle}","userID":"197407231"}},"extensions":{"persistedQuery":{"version":1,"sha256Hash":"856e69184d9d3aa37529d1cec489a164807eff0c6264b20832d06b669ee80ea5"}}}]`,
      "method": "POST"
      })

      fetch("https://gql.twitch.tv/gql", {
        "headers": {
          "authorization": `OAuth ${BOT_OAUTH}`,
          "client-id": "kimne78kx3ncx6brgo4mv6wki5h1ko",
        },
        "body": `[{"operationName":"EditBroadcastContext_FreeformTagsMutation","variables":{"input":{"contentID":"197407231","contentType":"CHANNEL","freeformTagNames":["PlayingwithViewers","FamilyFriendly","LGBTQIAPlus","Vtuber","AuditoryASMR","Giveaway","Robux","Roblox","Anime","ADHD"]}},"extensions":{"persistedQuery":{"version":1,"sha256Hash":"8aaac5a848941ff6a26bacb44b6b251909c77b84f39ce6eced8f4c694036fc08"}}}]`,
        "method": "POST"
      })
    }
    
    if (message.toLowerCase() == "!link.on") {
      fetch("https://gql.twitch.tv/gql", {
      "headers": {
        "authorization": `OAuth ${BOT_OAUTH}`,
        "client-id": "kimne78kx3ncx6brgo4mv6wki5h1ko",
      },
      "body": `[{"operationName":"EditBroadcastContext_ChannelTagsMutation","variables":{"input":{"contentID":"197407231","contentType":"USER","tagIDs":["6ea6bca4-4712-4ab9-a906-e3336a9d8039","ac763b17-7bea-4632-9eb4-d106689ff409","e90b5f6e-4c6e-4003-885b-4d0d5adeb580","8bbdb07d-df18-4f82-a928-04a9003e9a7e","64d9afa6-139a-48d5-ab4e-51d0a92b22de","52d7e4cc-633d-46f5-818c-bb59102d9549"],"authorID":"197407231"}},"extensions":{"persistedQuery":{"version":1,"sha256Hash":"4dd3764af06e728e1b4082b4dc17947dd51ab1aabbd8371ff49c01e440dfdfb1"}}},{"operationName":"EditBroadcastContext_BroadcastSettingsMutation","variables":{"input":{"broadcasterLanguage":"en","game":"Roblox","status":"${linkTitle}","userID":"197407231"}},"extensions":{"persistedQuery":{"version":1,"sha256Hash":"856e69184d9d3aa37529d1cec489a164807eff0c6264b20832d06b669ee80ea5"}}}]`,
      "method": "POST"
      })

      fetch("https://gql.twitch.tv/gql", {
        "headers": {
          "authorization": `OAuth ${BOT_OAUTH}`,
          "client-id": "kimne78kx3ncx6brgo4mv6wki5h1ko",
        },
        "body": `[{"operationName":"EditBroadcastContext_FreeformTagsMutation","variables":{"input":{"contentID":"197407231","contentType":"CHANNEL","freeformTagNames":["PlayingwithViewers","FamilyFriendly","LGBTQIAPlus","Vtuber","AuditoryASMR","Giveaway","Robux","Roblox","Anime","ADHD"]}},"extensions":{"persistedQuery":{"version":1,"sha256Hash":"8aaac5a848941ff6a26bacb44b6b251909c77b84f39ce6eced8f4c694036fc08"}}}]`,
        "method": "POST"
      })
    }

    if (message.toLowerCase() == "!1v1.on") {
      fetch("https://gql.twitch.tv/gql", {
      "headers": {
        "authorization": `OAuth ${BOT_OAUTH}`,
        "client-id": "kimne78kx3ncx6brgo4mv6wki5h1ko",
      },
      "body": `[{"operationName":"EditBroadcastContext_ChannelTagsMutation","variables":{"input":{"contentID":"197407231","contentType":"USER","tagIDs":["6ea6bca4-4712-4ab9-a906-e3336a9d8039","ac763b17-7bea-4632-9eb4-d106689ff409","e90b5f6e-4c6e-4003-885b-4d0d5adeb580","8bbdb07d-df18-4f82-a928-04a9003e9a7e","64d9afa6-139a-48d5-ab4e-51d0a92b22de","52d7e4cc-633d-46f5-818c-bb59102d9549"],"authorID":"197407231"}},"extensions":{"persistedQuery":{"version":1,"sha256Hash":"4dd3764af06e728e1b4082b4dc17947dd51ab1aabbd8371ff49c01e440dfdfb1"}}},{"operationName":"EditBroadcastContext_BroadcastSettingsMutation","variables":{"input":{"broadcasterLanguage":"en","game":"Roblox","status":"${arsenalTitle}","userID":"197407231"}},"extensions":{"persistedQuery":{"version":1,"sha256Hash":"856e69184d9d3aa37529d1cec489a164807eff0c6264b20832d06b669ee80ea5"}}}]`,
      "method": "POST"
      })

      fetch("https://gql.twitch.tv/gql", {
        "headers": {
          "authorization": `OAuth ${BOT_OAUTH}`,
          "client-id": "kimne78kx3ncx6brgo4mv6wki5h1ko",
        },
        "body": `[{"operationName":"EditBroadcastContext_FreeformTagsMutation","variables":{"input":{"contentID":"197407231","contentType":"CHANNEL","freeformTagNames":["PlayingwithViewers","FamilyFriendly","LGBTQIAPlus","Vtuber","AuditoryASMR","Giveaway","Robux","Roblox","Anime","ADHD"]}},"extensions":{"persistedQuery":{"version":1,"sha256Hash":"8aaac5a848941ff6a26bacb44b6b251909c77b84f39ce6eced8f4c694036fc08"}}}]`,
        "method": "POST"
      })
    }

    if (message.toLowerCase() == "!ticket.on") {
      fetch("https://gql.twitch.tv/gql", {
      "headers": {
        "authorization": `OAuth ${BOT_OAUTH}`,
        "client-id": "kimne78kx3ncx6brgo4mv6wki5h1ko",
      },
      "body": `[{"operationName":"EditBroadcastContext_ChannelTagsMutation","variables":{"input":{"contentID":"197407231","contentType":"USER","tagIDs":["6ea6bca4-4712-4ab9-a906-e3336a9d8039","ac763b17-7bea-4632-9eb4-d106689ff409","e90b5f6e-4c6e-4003-885b-4d0d5adeb580","8bbdb07d-df18-4f82-a928-04a9003e9a7e","64d9afa6-139a-48d5-ab4e-51d0a92b22de","52d7e4cc-633d-46f5-818c-bb59102d9549"],"authorID":"197407231"}},"extensions":{"persistedQuery":{"version":1,"sha256Hash":"4dd3764af06e728e1b4082b4dc17947dd51ab1aabbd8371ff49c01e440dfdfb1"}}},{"operationName":"EditBroadcastContext_BroadcastSettingsMutation","variables":{"input":{"broadcasterLanguage":"en","game":"Roblox","status":"${ticketTItle}","userID":"197407231"}},"extensions":{"persistedQuery":{"version":1,"sha256Hash":"856e69184d9d3aa37529d1cec489a164807eff0c6264b20832d06b669ee80ea5"}}}]`,
      "method": "POST"
      })

      fetch("https://gql.twitch.tv/gql", {
        "headers": {
          "authorization": `OAuth ${BOT_OAUTH}`,
          "client-id": "kimne78kx3ncx6brgo4mv6wki5h1ko",
        },
        "body": `[{"operationName":"EditBroadcastContext_FreeformTagsMutation","variables":{"input":{"contentID":"197407231","contentType":"CHANNEL","freeformTagNames":["PlayingwithViewers","FamilyFriendly","LGBTQIAPlus","Vtuber","AuditoryASMR","Giveaway","Robux","Roblox","Anime","ADHD"]}},"extensions":{"persistedQuery":{"version":1,"sha256Hash":"8aaac5a848941ff6a26bacb44b6b251909c77b84f39ce6eced8f4c694036fc08"}}}]`,
        "method": "POST"
      })
    }

    if (message.toLowerCase() == "!gamble.on") {
      fetch("https://gql.twitch.tv/gql", {
      "headers": {
        "authorization": `OAuth ${BOT_OAUTH}`,
        "client-id": "kimne78kx3ncx6brgo4mv6wki5h1ko",
      },
      "body": `[{"operationName":"EditBroadcastContext_ChannelTagsMutation","variables":{"input":{"contentID":"197407231","contentType":"USER","tagIDs":["6ea6bca4-4712-4ab9-a906-e3336a9d8039","ac763b17-7bea-4632-9eb4-d106689ff409","e90b5f6e-4c6e-4003-885b-4d0d5adeb580","8bbdb07d-df18-4f82-a928-04a9003e9a7e","64d9afa6-139a-48d5-ab4e-51d0a92b22de","52d7e4cc-633d-46f5-818c-bb59102d9549"],"authorID":"197407231"}},"extensions":{"persistedQuery":{"version":1,"sha256Hash":"4dd3764af06e728e1b4082b4dc17947dd51ab1aabbd8371ff49c01e440dfdfb1"}}},{"operationName":"EditBroadcastContext_BroadcastSettingsMutation","variables":{"input":{"broadcasterLanguage":"en","game":"Roblox","status":"${gambaTitle}","userID":"197407231"}},"extensions":{"persistedQuery":{"version":1,"sha256Hash":"856e69184d9d3aa37529d1cec489a164807eff0c6264b20832d06b669ee80ea5"}}}]`,
      "method": "POST"
      })

      fetch("https://gql.twitch.tv/gql", {
        "headers": {
          "authorization": `OAuth ${BOT_OAUTH}`,
          "client-id": "kimne78kx3ncx6brgo4mv6wki5h1ko",
        },
        "body": `[{"operationName":"EditBroadcastContext_FreeformTagsMutation","variables":{"input":{"contentID":"197407231","contentType":"CHANNEL","freeformTagNames":["PlayingwithViewers","FamilyFriendly","LGBTQIAPlus","Vtuber","AuditoryASMR","Giveaway","Robux","Roblox","Anime","ADHD"]}},"extensions":{"persistedQuery":{"version":1,"sha256Hash":"8aaac5a848941ff6a26bacb44b6b251909c77b84f39ce6eced8f4c694036fc08"}}}]`,
        "method": "POST"
      })
    }

    if (message.toLowerCase() == "!sponsor.on") {
      // fetch("https://gql.twitch.tv/gql", {
      // "headers": {
      //   "authorization": `OAuth ${BOT_OAUTH}`,
      //   "client-id": "kimne78kx3ncx6brgo4mv6wki5h1ko",
      // },
      // "body": `[{"operationName":"EditBroadcastContext_ChannelTagsMutation","variables":{"input":{"contentID":"197407231","contentType":"USER","tagIDs":["6ea6bca4-4712-4ab9-a906-e3336a9d8039","ac763b17-7bea-4632-9eb4-d106689ff409","e90b5f6e-4c6e-4003-885b-4d0d5adeb580","8bbdb07d-df18-4f82-a928-04a9003e9a7e","64d9afa6-139a-48d5-ab4e-51d0a92b22de","52d7e4cc-633d-46f5-818c-bb59102d9549"],"authorID":"197407231"}},"extensions":{"persistedQuery":{"version":1,"sha256Hash":"4dd3764af06e728e1b4082b4dc17947dd51ab1aabbd8371ff49c01e440dfdfb1"}}},{"operationName":"EditBroadcastContext_BroadcastSettingsMutation","variables":{"input":{"broadcasterLanguage":"en","game":"${sponsorGame}","status":"${sponsorTitle}","userID":"197407231"}},"extensions":{"persistedQuery":{"version":1,"sha256Hash":"856e69184d9d3aa37529d1cec489a164807eff0c6264b20832d06b669ee80ea5"}}}]`,
      // "method": "POST"
      // })

      fetch("https://gql.twitch.tv/gql", {
        "headers": {
          "authorization": `OAuth ${BOT_OAUTH}`,
          "client-id": "kimne78kx3ncx6brgo4mv6wki5h1ko",
        },
        "body": `[{"operationName":"EditBroadcastContext_FreeformTagsMutation","variables":{"input":{"contentID":"197407231","contentType":"CHANNEL","freeformTagNames":["PlayingwithViewers","FamilyFriendly","LGBTQIAPlus","Vtuber","AuditoryASMR","Giveaway","Robux","Roblox","Anime","ADHD"]}},"extensions":{"persistedQuery":{"version":1,"sha256Hash":"8aaac5a848941ff6a26bacb44b6b251909c77b84f39ce6eced8f4c694036fc08"}}}]`,
        "method": "POST"
      })
      client.say(
      CHANNEL_NAME, 
      `@${twitchUsername}, There is not currently a sponsor.`
      );
    }
  }

  if (message.toLowerCase() == "!fixtags") {
    fetch("https://gql.twitch.tv/gql", {
      "headers": {
        "authorization": `OAuth ${BOT_OAUTH}`,
        "client-id": "kimne78kx3ncx6brgo4mv6wki5h1ko",
      },
      "body": `[{"operationName":"EditBroadcastContext_FreeformTagsMutation","variables":{"input":{"contentID":"197407231","contentType":"CHANNEL","freeformTagNames":["PlayingwithViewers","FamilyFriendly","LGBTQIAPlus","Vtuber","AuditoryASMR","Giveaway","Robux","Roblox","Anime","ADHD"]}},"extensions":{"persistedQuery":{"version":1,"sha256Hash":"8aaac5a848941ff6a26bacb44b6b251909c77b84f39ce6eced8f4c694036fc08"}}}]`,
      "method": "POST"
    })

    client.say(CHANNEL_NAME, `@${CHANNEL_NAME} Tags have been fixed.`)
  }
  if (message.toLowerCase().startsWith("!lockdown")) {
    client.say(CHANNEL_NAME, `/subscribers`);
    client.say(CHANNEL_NAME, `/followers 15`);
    client.say(CHANNEL_NAME, `/uniquechat`);
    client.say(CHANNEL_NAME, `/clear`);
    client.say(`@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :@${CHANNEL_NAME}, lockdown mode has been enabled.`)
  }

  if (message.toLowerCase().startsWith("!endlockdown")) {
    client.say(CHANNEL_NAME, `/subscribersoff`);
    client.say(CHANNEL_NAME, `/followersoff`);
    client.say(CHANNEL_NAME, `/uniquechatoff`);
    client.say(`@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :@${CHANNEL_NAME}, the chat is no longer in lockdown.`)
  }

    if (message.toLowerCase() == "!currentmode") {
      SETTINGS = JSON.parse(fs.readFileSync("./SETTINGS.json"));
      var currentMode = SETTINGS.currentMode.replace(".on", "");
      currentMode = currentMode.replace("!", "");

      if (SETTINGS.currentMode == "!join.on") { return client.raw(`@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :The bot is currently in join mode.`)};
      if (SETTINGS.currentMode == "!link.on") { return client.raw(`@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :The bot is currently in link mode.`)};
      if (SETTINGS.currentMode == "!ticket.on") { return client.raw(`@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :The bot is currently in ticket mode.`)};
      if (SETTINGS.currentMode == "!1v1.on") { return client.raw(`@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :The bot is currently in 1v1 mode.`)};
      if (SETTINGS.currentMode == "!gamble.on") { return client.raw(`@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :The bot is currently in GAMBA mode.`)};

      client.say(CHANNEL_NAME, `@${twitchUsername}, The bot is in ${SETTINGS.currentMode}`);
      return
    }

    if (message.toLowerCase() == "!validmodes") {

      client.raw(`@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Valid Modes: !join.on, !link.on, !1v1.on, !ticket.on, !gamble.on`)
      return
    }
  } else if (SETTINGS.ks == false) {
    newUserHandler(client, message, twitchUsername, isFirstMessage, userstate);
    customUserFunctions(client, message, twitchUsername, twitchUserId);
    if (SETTINGS["spamFilter"] == true) {
      FILTERS.spamFilter(client, message, twitchUsername);
    }
    if (SETTINGS["lengthFilter"] == true) {
      FILTERS.lengthFilter(client, message, twitchUsername);
    }
  }

  logHandler(
    message,
    twitchUsername,
    twitchDisplayName,
    twitchUserId,
    isMod,
    isBroadcaster,
    isFirstMessage,
    isSubscriber,
    messageId
  );

  // if user on cooldown, return
  var keywords;

  var messageArray = ([] = message.split(" "));
  var isCommand = commandsList.includes(messageArray[0]);

  for (const wordSet in WORDS) {
    if (WORDS[wordSet].some((word) => message.toLowerCase().includes(word))) {
      keywords = true;
      continue;
    }
  }

  if (!user[twitchUsername] && !ModOrBroadcaster && (keywords || isCommand)) {
    user[twitchUsername] = new Date().getTime();
  } else if (user[twitchUsername]) {
    if (
      new Date().getTime() - user[twitchUsername] < COOLDOWN &&
      !ModOrBroadcaster
    ) {
      return;
    }
  }

  if (!ModOrBroadcaster && SETTINGS.keywords == true && SETTINGS.ks == false) {
    joinHandler(message, twitchUsername, ModOrBroadcaster, twitchUserId);
  }

  user[twitchUsername] = new Date().getTime();

  if (SETTINGS.ks && !ModOrBroadcaster) {
    return;
  }
});

async function liveUpHandler() {
  // TO DO = first person to go to stream gets free channel points
  client.say(
    `${CHANNEL_NAME}`,
    `${CHANNEL_NAME}, is now live. Logging will start ${
      WAIT_REGISTER / (60 * 1000)
    } minutes after this point to avoid false logging.`
  );
  await setTimeout(WAIT_REGISTER);
  if (await TWITCH_FUNCTIONS.isLive()) {
    client.say(
      `${CHANNEL_NAME}`,
      `Logging now starts. There has been ${streamNumber} number of streams since logging started and this stream will be ${
        streamNumber + 1
      }`
    );
    const time = new Date();
    const startTime = time.getTime() - WAIT_REGISTER;
    streamNumber++;
    STREAMS[streamNumber] = STREAMS[1];
    STREAMS[streamNumber]["date"] = time;
    STREAMS[streamNumber]["day"] = time.getDay();
    STREAMS[streamNumber]["ISODate"] = time.toISOString();
    STREAMS[streamNumber]["streamStart"] = time.getTime();
    fs.writeFileSync("./STREAMS.json", JSON.stringify(STREAMS));
  } else {
    client.say(`${CHANNEL_NAME}`, "false log.");
  }
}

async function liveDownHandler() {
  if (await TWITCH_FUNCTIONS.isLive()) {
    await setTimeout(WAIT_REGISTER / 100);
    client.say(
      `${CHANNEL_NAME}`,
      `${CHANNEL_NAME}, is now offline. Logging has stopped.`
    );    
    const endTime = new Date().getTime();
    STREAMS[streamNumber]["streamEnd"] = endTime;
    STREAMS[streamNumber]["repeatLengthOffenders"] = {};
    STREAMS[streamNumber]["repeatSpamOffenders"] = {};
    fs.writeFileSync("./STREAMS.json", JSON.stringify(STREAMS));
  } else {
    client.say("false log.");
  }
}

var pubsub;
const myname = CHANNEL_NAME;

var ping = {};
ping.pinger = false;
ping.start = function () {
  if (ping.pinger) {
    clearInterval(ping.pinger);
  }
  ping.sendPing();

  ping.pinger = setInterval(function () {
    setTimeout(function () {
      ping.sendPing();
    }, Math.floor(Math.random() * 1000 + 1));
  }, 4 * 60 * 1000);
};
ping.sendPing = function () {
  try {
    pubsub.send(
      JSON.stringify({
        type: "PING",
      })
    );
    ping.awaitPong();
  } catch (e) {
    console.log(e);

    pubsub.close();
    StartListener();
  }
};
ping.awaitPong = function () {
  ping.pingtimeout = setTimeout(function () {
    console.log("WS Pong Timeout");
    pubsub.close();
    StartListener();
  }, 10000);
};

ping.gotPong = function () {
  clearTimeout(ping.pingtimeout);
};

var requestListen = function (topics, token) {
  let pck = {};
  pck.type = "LISTEN";
  pck.nonce = myname + "-" + new Date().getTime();

  pck.data = {};
  pck.data.topics = topics;
  if (token) {
    pck.data.auth_token = token;
  }

  pubsub.send(JSON.stringify(pck));
};

var StartListener = function () {
  pubsub = new WebSocket("wss://pubsub-edge.twitch.tv");
  pubsub
    .on("close", function () {
      console.log("Disconnected");
      StartListener();
    })
    .on("open", function () {
      ping.start();
      runAuth();
    });
  pubsub.on("message", async function (raw_data, flags) {
    SETTINGS = JSON.parse(fs.readFileSync("./SETTINGS.json"));
    var PData = JSON.parse(raw_data);
    if (PData.type == "RECONNECT") {
      console.log("Reconnect");
      pubsub.close();
    } else if (PData.type == "PONG") {
      ping.gotPong();
    } else if (PData.type == "RESPONSE") {
      console.log(PData);
      console.log("RESPONSE: " + (PData.error ? PData.error : "OK"));
    } else if (PData.type == "MESSAGE") {
      PData = PData.data;
      const pubTopic = PData.topic;
      const pubMessage = PData.message;
      const serverTime = pubMessage.server_time;
      const type = JSON.parse(pubMessage).type;
      if (type == "stream-up") {
        // TO DO = first person to go to stream gets free channel points
        client.say(CHANNEL_NAME, `/followersoff`);
        liveUpHandler();
      } else if (type == "stream-down") {
        client.say(CHANNEL_NAME, `/followers`);
        liveDownHandler();
      } else if (type == "viewcount") {
        STREAMS[streamNumber]["averageViewersPer30Seconds"] =
          pubMessage.viewers;
        const sum = 0;
        for (const key in STREAMS[streamNumber]["averageViewersPer30Seconds"]) {
          sum += STREAMS[key];
        }
        STREAMS[streamNumber]["averageviewers"] =
          sum / Object.keys(STREAMS).length;
        fs.writeFileSync("./STREAMS.json", JSON.stringify(STREAMS));
      } else if (type == "AD_POLL_CREATE") {
        TWITCH_FUNCTIONS.onMultiplayerAdStart();
      } else if (type == "AD_POLL_COMPLETE") {
        var adData = pubMessage.data.poll;
        TWITCH_FUNCTIONS.onMultiplayerAdEnd(adData);
      } else if (type == "moderation_action") {
        const followData = JSON.parse(pubMessage).data;
        const followChange = followData.moderation_action;

        if (followChange == "followers") {
          // follow only mode gets enabled
          if (
            SETTINGS.ks == false &&
            (await TWITCH_FUNCTIONS.isLive()) == true
          ) {
            await setTimeout(WAIT_UNTIL_FOC_OFF);
            client.say(CHANNEL_NAME, `/followersoff`);
          }
        } else if (followChange == "followersoff") {
          if (!SETTINGS.ks) {
          }
          // follow only mode gets disabled
        }
        if (JSON.parse(pubMessage).data.moderation_action == "untimeout") {
          const untimedoutUser = JSON.parse(pubMessage).data.target_user_login;
          FILTER_FUNCTIONS.onUntimedOut(untimedoutUser);
        }
      } else if (pubTopic == `stream-chat-room-v1.${CHANNEL_ID}`) {
        // // if(pubMessage.data.room.modes.followers_)
        // var modeData = JSON.parse(pubMessage).data.room.modes
        // if (modeData.emote_only_mode_enabled == true) {
        //   console.log('emote only enabled')
        // } else if (modeData.subscribers_only_mode_enabled == true) {
        //   console.log('sub only mode enabled')
        // }
      } else if (pubTopic == `ads.${CHANNEL_ID}`) {
        if (SETTINGS.ks == false) {
          client.say(
            CHANNEL_NAME,
            `An ad has been ran, subscribe with prime for free and enjoy watching with 0 ads all month for free, !prime for more info EZY PogU .`
          );
        }
      } else if (pubTopic == `hype-train-events-v1.${CHANNEL_ID}`) {
        if (SETTINGS.ks == false) {
          client.say(
            CHANNEL_NAME,
            `.announce A HYPE TRAIN PagMan [test message]`
          )
        }
      } else if (pubTopic == `community-moments-channel-v1.${CHANNEL_ID}`) {
        if (SETTINGS.ks == false) {
          client.say(
            CHANNEL_NAME,
            `.announce A new moment tibb12Tabbman everyone claim it while you can tibb12Pog .`
          )
        }
      } else if (
        type == "POLL_COMPLETE" ||
        type == "POLL_TERMINATE" ||
        type == "POLL_ARCHIVE"
      ) {
        // if (SETTINGS.ks == true) return
        const r = await TWITCH_FUNCTIONS.getLatestPollData();

        if (r == "error") return;

        if (type == "POLL_ARCHIVE") {
          const nodes = r.userNodes;

          for (let i = 0; i < nodes.length; i++) {
            const node = nodes[i];
            const username = node.user.login;
            const cp = node.tokens.communityPoints;

            const getSubStatus = await TWITCH_FUNCTIONS.getSubStatus(
              node.user.id
            );

            if (getSubStatus.data[0] == null) return;
            const tier = getSubStatus.data[0].tier;

            const standardRate = 5.33333333;

            const t1Rate = 5.3333333 * 1.2;
            const t2Rate = 5.3333333 * 1.4;
            const t3Rate = 5.3333333 * 2;

            let rate;
            let sub;

            if (tier == 1000) {
              rate = t1Rate;
              sub = "you're a tier 1 sub";
            } else if (tier == 2000) {
              rate = t2Rate;
              sub = "you're a tier 2 sub";
            } else if (tier == 3000) {
              rate = t3Rate;
              sub = "you're a tier 3 sub";
            } else {
              rate = standardRate;
              sub = "you dont have a sub";
            }

            const test = cp / rate / (60 * 24 * 365);

            const cpToHours = ROBLOX_FUNCTIONS.timeToAgo(test);

            //             if (cp > 1000) {
            //               client.say(
            //                 CHANNEL_NAME,
            //                 `@${username}, lost ${cp} channel points, since ${sub} thats ${cpToHours.timeString} of farming RIPBOZO`
            //               );
            //             }
          }
        } else if (type == "POLL_TERMINATE" || type == "POLL_COMPLETE") {
          //           const nodes = r.userNodes;

          //           for (let i = 0; i < nodes.length; i++) {
          //             const node = nodes[i];
          //             const username = node.user.login;
          //             const cp = node.tokens.communityPoints;

          //             console.log(JSON.stringify(r, null, 1));

          //             let winning_choice_id;
          //             let winning_choice_votes = 0;

          //             r.choices.forEach(function (choice) {
          //               if (choice.votes.total > winning_choice_votes) {
          //                 winning_choice_votes = choice.votes.total;
          //                 winning_choice_id = choice.id;
          //               }
          //             });

          //             //

          //             nodes.forEach(function (node) {
          //               var packs = [];
          //               node.choices.forEach(function (choice) {
          //                 if (choice.id != winning_choice_id) {
          //                   r.choices.forEach(function (mainChoice) {
          //                     if (mainChoice.id == choice.id) {
          //                       packs.push(mainChoice.title);
          //                     }
          //                   });
          //                 }
          //               });
          //             });

          //             nodes.forEach(function (node) {
          //               var choiceArray = {};

          //               const user = node.user.login;

          //               node.choices.forEach(function (choice) {
          //                 if (!choiceArray[choice.pollChoice.id]) {
          //                   choiceArray[choice.pollChoice.id] =
          //                     choice.tokens.communityPoints;
          //                 } else {
          //                   choiceArray[choice.pollChoice.id] =
          //                     choiceArray[choice.pollChoice.id] +
          //                     choice.tokens.communityPoints;
          //                 }
          //               });

          //               let mostVotedFor;
          //               let mostedVoted = 0;
          //               let mostVotedForName;
          //               let total = 0;

          //               for (const key in choiceArray) {
          //                 const amount = choiceArray[key];
          //                 total += amount;
          //                 if (amount > mostedVoted) {
          //                   mostVotedFor = key;
          //                 }
          //               }

          //               r.choices.forEach(function (mainChoice) {
          //                 console.log(mostVotedFor);
          //                 if (mainChoice.id == mostVotedFor) {
          //                   mostVotedForName = mainChoice.title;
          //                 }
          //               });

          //               console.log(
          //                 `${user} spent in total ${total} channel points, spending the most on ${mostVotedForName} which they spent ${choiceArray[mostVotedFor]} channel points on.`
          //               );
          //             });
          //           }

          var polldata = r;
          var choices = polldata.choices;
          var userNodes = polldata.userNodes;

          const determineWinner = async () => {
            let winner_id = "";
            let winner_title = "";
            let winner_votes = 0;

            choices.forEach(function (choice, index) {
              const totalVotes = choice.votes.total;
              if (totalVotes > winner_votes) {
                winner_id = choice.id;
                winner_title = choice.title;
                winner_votes = totalVotes;
              }
            });

            return {
              winner_id: winner_id,
              winner_title: winner_title,
              winner_votes: winner_votes,
            };
          };

          const collateUserData = async () => {
            const userData = {};

            userNodes.forEach(function (node) {
              const userChoices = node.choices;

              const userId = node.user.id;
              const username = node.user.login;
              const displayName = node.user.displayName;

              userData[userId] = {
                username: username,
                displayName: displayName,
              };

              userChoices.forEach(function (userChoice) {
                userData[userId][userChoice.pollChoice.id] =
                  userChoice.tokens.communityPoints;
              });
            });

            return userData;
          };

          const collateUserLosses = async () => {
            const userData = await collateUserData();
            const winnerData = await determineWinner();

            const userLosses = {};

            for (const userId in userData) {
              userLosses[userId] = {
                biggestLoss: 0,
                biggestLossId: "",
                allLosses: {},
                votedForWinner: false,
                winnerLoss: 0,
                winnerId: winnerData.winner_id,
                username: userData[userId].username,
                displayName: userData[userId].displayName,
              };

              for (const choice in userData[userId]) {
                // console.log(choice)
                if (
                  userData[userId][choice] != userData[userId].username &&
                  userData[userId][choice] != userData[userId].displayName
                ) {
                  if (choice != winnerData.winner_id) {
                    // console.log(userData[userId][choice])
                    userLosses[userId]["allLosses"][choice] =
                      userData[userId][choice];
                  } else {
                    userLosses[userId]["votedForWinner"] = true;
                    userLosses[userId]["winnerLoss"] =
                      userData[userId][winnerData.winner_id];
                    // console.log(userData[userId][winnerData.winner_id])
                  }
                }
              }

              for (const user in userLosses) {
                for (const loss in userLosses[user]["allLosses"]) {
                  const biggestLoss = userLosses[user]["biggestLoss"];

                  if (userLosses[user]["allLosses"][loss] > biggestLoss) {
                    userLosses[user]["biggestLoss"] =
                      userLosses[user]["allLosses"][loss];
                    userLosses[user]["biggestLossId"] = loss;
                  }
                }
              }
            }
            return userLosses;
          };

          const choiceIdAndTitle = async () => {
            const choiceArray = {};
            const winnerData = await determineWinner();

            choices.forEach(function (choice) {
              if (choice.id != winnerData.winner_id) {
                choiceArray[choice.id] = choice.title;
              }
            });
            return choiceArray;
          };

          const processUserLosses = async () => {
            const userLosses = await collateUserLosses();
            const choiceArray = await choiceIdAndTitle();
            const userData2 = await collateUserData();

            const getSubStatus = await TWITCH_FUNCTIONS.getSubStatus(
              node.user.id
            );

            if (getSubStatus.data[0] == null) return;
            const tier = getSubStatus.data[0].tier;

            const standardRate = 5.33333333;

            const t1Rate = 5.3333333 * 1.2;
            const t2Rate = 5.3333333 * 1.4;
            const t3Rate = 5.3333333 * 2;

            let rate;
            let sub;

            if (tier == 1000) {
              rate = t1Rate;
              sub = "you're a tier 1 sub";
            } else if (tier == 2000) {
              rate = t2Rate;
              sub = "you're a tier 2 sub";
            } else if (tier == 3000) {
              rate = t3Rate;
              sub = "you're a tier 3 sub";
            } else {
              rate = standardRate;
              sub = "you dont have a sub";
            }

            const packs = {};

            const packLeaders = {};

            const messages = {};

            for (const choiceId in choiceArray) {
              packs[choiceId] = {};
              packLeaders[choiceId] = {};
            }

            for (const userId in userLosses) {
              const user = userLosses[userId];

              let overallLoss = 0;

              for (const loss in user.allLosses) {
                packs[loss][userId] = user.biggestLoss;
              }
            }

            for (const pack in packs) {
              let highestLoss = 0;
              let packLeader;
              let totalPackLoss = 0;

              for (const packMember in packs[pack]) {
                totalPackLoss += packs[pack][packMember];

                if (packs[pack][packMember] > highestLoss) {
                  highestLoss = packs[pack][packMember];
                  packLeader = packMember;
                }
              }

              packLeaders[pack] = {
                packLeader: packLeader,
                loss: highestLoss,
                totalPackLoss: totalPackLoss,
              };
            }
            // console.log(userLosses)
            // console.log(packs)
            // console.log(packLeaders)

            for (const pack in packLeaders) {
              if (packLeaders[pack].packLeader != undefined) {
                const leader = packLeaders[pack].packLeader;
                const loss = packLeaders[pack].loss;
                const totalLoss = packLeaders[pack].totalPackLoss;

                const username = userData2[leader].username;
                let totalLoss2 = 0;
                let tempLoss2 = 0;

                for (const userLoss in userLosses) {
                  for (const loss2 in userLosses[userLoss].allLosses) {
                    if (loss2 == pack) {
                      tempLoss2 += userLosses[userLoss].allLosses[loss2];
                    }
                  }
                }

                if (
                  totalLoss > 1000 &&
                  loss > 500 &&
                  tempLoss2 > userLosses[leader]["winnerLoss"] * 2
                ) {
                  for (const userLoss in userLosses) {
                    for (const loss2 in userLosses[userLoss].allLosses) {
                      if (loss2 == pack) {
                        totalLoss2 += userLosses[userLoss].allLosses[loss2];
                      }
                    }
                  }

                  messages[
                    pack
                  ] = `RIPBOZO ${choiceArray[pack]} pack -${totalLoss2} channel points, pack leader ${userLosses[leader].username} lost ${userLosses[leader]["allLosses"][pack]} channel points.`;
                }
              }
            }

            return messages;
          };

          const processedData = await processUserLosses();

          for (const message in processedData) {
            client.say(CHANNEL_NAME, `${processedData[message]}`);
          }
        }
      } else if (pubTopic == `predictions-channel-v1.${CHANNEL_ID}`) {
        if (type == "event-created") {
        } else if (type == "event-updated") {
          const event = JSON.parse(pubMessage).data.event;

          const status = event.status;

          if (status == "RESOLVED") {
            const winning_outcome_id = event.winning_outcome_id;
            const prediction_id = event.id;
            const predictionData =
              await TWITCH_FUNCTIONS.getLatestPredictionData();

            console.log(predictionData);
          }
        }
      } else if (pubTopic == `community-points-channel-v1.${CHANNEL_ID}`) {
        if (type == "reward-redeemed") {
          const vipEntry = "42693bf2-9dea-40a5-8a7c-7d088d220d21";
          const timeout = "efa070b5-6d12-4cc6-8ef8-160eded1fdec";
          const subonly = "f799d602-205b-4865-94a3-18b939d4c8ae";
          const emoteonly = "27e600a4-1b2e-4ce3-b969-55e7cf89421f";
          const remotesuboremote = "d08999ad-8338-4270-b306-f28d893a3676";
          const removeoraddhat = "77ac0ea867ac50fb6e65f3839af51a31";


          const redemptionId = JSON.parse(pubMessage).data.redemption.reward.id;


          if (redemptionId == vipEntry) {
            SETTINGS = JSON.parse(fs.readFileSync('./SETTINGS.json'))
            if (SETTINGS.currentMode == '!ticket.on') {
                const userInput = JSON.parse(pubMessage).data.redemption.user_input
                const twitchUsername = JSON.parse(pubMessage).data.redemption.user.login
                const isValidUser = await ROBLOX_FUNCTIONS.isValidRobloxUser(userInput)


                if (!isValidUser.isValidUser) return client.say(CHANNEL_NAME, `@${twitchUsername}, not a valid username.`)

                const friend = await ROBLOX_FUNCTIONS.sendFriendRequest(isValidUser.userId)

                if (friend == 'already') {
                    const friends = await ROBLOX_FUNCTIONS.getCurrentUserFriends(ROBLOX_ID)
                    let alreadyFriend = false

                    friends.forEach(function (friend) {
                        if (friend.id == isValidUser.userId) {
                            alreadyFriend = true
                        }
                    })

                    if (alreadyFriend) return client.say(CHANNEL_NAME, `@${twitchUsername}, ' ${userInput} ' is already added.`)

                    return client.say(CHANNEL_NAME, `@${twitchUsername} already sent ' ${userInput} ' a friend request.`)
                } else if (friend != 'success') {
                    return client.say(CHANNEL_NAME, `@${twitchUsername} unknown error ocurred.`)
                }

                TOUNFRIEND = JSON.parse(fs.readFileSync('./TOUNFRIEND.json'))

                TOUNFRIEND[isValidUser.userId] = userInput
                fs.writeFileSync('./TOUNFRIEND.json', JSON.stringify(TOUNFRIEND, null, 1))
                TOUNFRIEND = JSON.parse(fs.readFileSync('./TOUNFRIEND.json'))

                client.say(CHANNEL_NAME, `@${twitchUsername}, sent a friend request to ${userInput}.`)
              }
            }
          if (redemptionId == subonly) {
            client.say(
              CHANNEL_NAME,
              `/subscribers`
            );
            client.say(CHANNEL_NAME, 'EZY Clap non-subs')
            await setTimeout(5 * 60 * 1000)
            client.say(
              CHANNEL_NAME,
              `/subscribersoff`
            );
            client.say(CHANNEL_NAME, `The chat is no logner in sub only. THE NON SUBS ARE FREE PagMan`);
          }
          if (redemptionId == emoteonly) {
            client.say(
              CHANNEL_NAME,
              `/emoteonly`
            );
            await setTimeout(5 * 60 * 1000)
            client.say(
              CHANNEL_NAME,
              `/emoteonlyoff`
            );
            client.say(CHANNEL_NAME, `The chat is no longer in emote only.`);
          }
          if (redemptionId == remotesuboremote) {
            client.say(CHANNEL_NAME, `/emoteonlyoff`);
            client.say(CHANNEL_NAME, `/subscribersoff`);
          }
          if (redemptionId == timeout) {
            const userInput = JSON.parse(pubMessage).data.redemption.user_input;
            const twitchUsername =
              JSON.parse(pubMessage).data.redemption.user.login;

            const userInputSplit = ([] = userInput.split(" "));

            client.say(
              CHANNEL_NAME,
              `${userInputSplit[0]} was timed out for 60 seconds by ${twitchUsername} via timeout redemption.`
            );
            TWITCH_FUNCTIONS.timeoutUser(
              userInputSplit[0],
              60,
              `[AUTOMATIC] ${twitchUsername} redeemed a timeout on you. You can redeem the timeout redemption and others by clicking the yellow ' T ' in the bottom left of the chat box.`
            );
          }
          if (redemptionId == removeoraddhat) {
            await setTimeout(30 * 60 * 100)
            client.say(CHANNEL_NAME, `@${CHANNEL_NAME} 30 miniutes has passed since ${twitchUsername} redeemed the hat redemption.`);
          }
        }
      }
    }
  });
};

var runAuth = function () {
  requestListen(
    [
      // `activity-feed-alerts-v2.${CHANNEL_ID}`,
      `ads.${CHANNEL_ID}`,
      // `ads-manager.${CHANNEL_ID}`,
      // `channel-ad-poll-update-events.${CHANNEL_ID}`,
      // `ad-property-refresh.${CHANNEL_ID}`,
      // `automod-levels-modification.${CHANNEL_ID}`,
      // `automod-queue.${CHANNEL_ID}`,
      `leaderboard-events-v1.${CHANNEL_ID}`,
      // `bits-campaigns-v1.${CHANNEL_ID}`,
      // `campaign-events.${CHANNEL_ID}`,
      // `user-campaign-events.${CHANNEL_ID}`,
      // `celebration-events-v1.${CHANNEL_ID}`,
      // `channel-bits-events-v1.${CHANNEL_ID}`,
      // `channel-bit-events-public.${CHANNEL_ID}`,
      // `channel-event-updates.${CHANNEL_ID}`,
      // `channel-squad-invites.${CHANNEL_ID}`,
      // `channel-squad-updates.${CHANNEL_ID}`,
      // `channel-subscribe-events-v1.${CHANNEL_ID}`,
      // `channel-cheer-events-public-v1.${CHANNEL_ID}`,
      // `broadcast-settings-update.${CHANNEL_ID}`,
      // `channel-drop-events.${CHANNEL_ID}`,
      // `channel-bounty-board-events.cta.${CHANNEL_ID}`,
      // `chatrooms-user-v1.505216805`,
      // `community-boost-events-v1.${CHANNEL_ID}`,
      `community-moments-channel-v1.${CHANNEL_ID}`,
      // `community-moments-user-v1.${CHANNEL_ID}`,
      // `community-points-broadcaster-v1.${CHANNEL_ID}`,
      `community-points-channel-v1.${CHANNEL_ID}`,
      // `community-points-user-v1.${CHANNEL_ID}`,
      `predictions-channel-v1.${CHANNEL_ID}`,
      // `predictions-user-v1.${CHANNEL_ID}`,
      // `creator-goals-events-v1.${CHANNEL_ID}`,
      // `dashboard-activity-feed.${CHANNEL_ID}`,
      // `dashboard-alert-status.${CHANNEL_ID}`,
      // `dashboard-multiplayer-ads-events.${CHANNEL_ID}`,
      // `emote-uploads.${CHANNEL_ID}`,
      // `emote-animations.${CHANNEL_ID}`,
      // `extension-control.upload.${CHANNEL_ID}`,
      // `follows.${CHANNEL_ID}`,
      // `friendship.${CHANNEL_ID}`,
      `hype-train-events-v1.${CHANNEL_ID}`,
      // `user-image-update.${CHANNEL_ID}`,
      // `low-trust-users.${CHANNEL_ID}`,
      // `midnight-squid-recipient-v1.${CHANNEL_ID}`,
      // //`chat_moderator_actions.${CHANNEL_ID}`
      `chat_moderator_actions.${BOT_ID}.${CHANNEL_ID}`,
      // `moderator-actions.${CHANNEL_ID}`,
      // `multiview-chanlet-update.${CHANNEL_ID}`,
      // `channel-sub-gifts-v1.${CHANNEL_ID}`,
      // `onsite-notifications.${CHANNEL_ID}`,
      // `payout-onboarding-events.${CHANNEL_ID}`,
      `polls.${CHANNEL_ID}`,
      // `presence.${CHANNEL_ID}`,
      // `prime-gaming-offer.${CHANNEL_ID}`,
      // `channel-prime-gifting-status.${CHANNEL_ID}`,
      // `pv-watch-party-events.${CHANNEL_ID}`,
      // `private-callout.${CHANNEL_ID}`,
      // `purchase-fulfillment-events.${CHANNEL_ID}`,
      // `raid.${CHANNEL_ID}`,
      // `radio-events-v1.${CHANNEL_ID}`,
      // `rocket-boost-channel-v1.${CHANNEL_ID}`,
      // `squad-updates.${CHANNEL_ID}`,
      // `stream-change-v1.${CHANNEL_ID}`,
      // `stream-change-by-channel.${CHANNEL_ID}`,
      `stream-chat-room-v1.${CHANNEL_ID}`,
      // `subscribers-csv-v1.${CHANNEL_ID}`,
      `channel-unban-requests.${BOT_ID}.${CHANNEL_ID}`,
      // `user-unban-requests.${CHANNEL_ID}`,
      `upload.${CHANNEL_ID}`,
      // `user-bits-updates-v1.${CHANNEL_ID}`,
      // `user-commerce-events.${CHANNEL_ID}`,
      // `user-crate-events-v1.${CHANNEL_ID}`,
      // `user-drop-events.${CHANNEL_ID}`,
      // `user-moderation-notifications.${CHANNEL_ID}`,
      // `user-preferences-update-v1.${CHANNEL_ID}`,
      // `user-properties-update.${CHANNEL_ID}`,
      // `user-subscribe-events-v1.${CHANNEL_ID}`,
      `video-playback.${CHANNEL_ID}`,
      `video-playback-by-id.${CHANNEL_ID}`,
      // `video-thumbnail-processing.${CHANNEL_ID}`,
      `whispers.${BOT_ID}`,
    ],
    BOT_OAUTH
  );
};
//TIBB_TOKEN
StartListener();

client.on("hosted", (channel, username, viewers, autohost) => {}); // dead feature as of oct 3

client.on("hosting", async (channel, username, viewers, autohost) => {
  SETTINGS = JSON.parse(fs.readFileSync("./SETTINGS.json"));
  if (SETTINGS.ks == false) {
    client.say(CHANNEL_NAME, `Tibb is now hosting ${username}. tibb12Ezy`);
  }
  if (SETTINGS.ks == false) {
  client.say(username, `Tibb12 just raied with ${viewers}. tibb12Pls`);
  await setTimeout(5 * 1000)
  mainClient.say(username, `tibb12Nerd TIBB RAID tibb12Nerd TIBB RAID tibb12Nerd TIBB RAID tibb12Nerd TIBB RAID tibb12Nerd TIBB RAID tibb12Nerd TIBB RAID tibb12Nerd TIBB RAID tibb12Nerd TIBB RAID tibb12Nerd TIBB RAID tibb12Nerd TIBB RAID tibb12Nerd`);
  await setTimeout(1 * 1000)
  mainClient.say(username, `tibb12Nerd TIBB RAID tibb12Nerd TIBB RAID tibb12Nerd TIBB RAID tibb12Nerd TIBB RAID tibb12Nerd TIBB RAID tibb12Nerd TIBB RAID tibb12Nerd TIBB RAID tibb12Nerd TIBB RAID tibb12Nerd TIBB RAID tibb12Nerd`);
  await setTimeout(1 * 1000)
  mainClient.say(username, `tibb12Nerd TIBB RAID tibb12Nerd TIBB RAID tibb12Nerd TIBB RAID tibb12Nerd TIBB RAID tibb12Nerd TIBB RAID tibb12Nerd TIBB RAID tibb12Nerd TIBB RAID tibb12Nerd TIBB RAID tibb12Nerd TIBB RAID tibb12Nerd TIBB RAID tibb12Nerd`);
  await setTimeout(1 * 1000)
  mainClient.say(username, `tibb12Nerd TIBB RAID tibb12Nerd TIBB RAID tibb12Nerd TIBB RAID tibb12Nerd TIBB RAID tibb12Nerd TIBB RAID tibb12Nerd TIBB RAID tibb12Nerd TIBB RAID tibb12Nerd TIBB RAID tibb12Nerd TIBB RAID tibb12Nerd`);
  await setTimeout(1 * 1000)
  mainClient.say(username, `tibb12Nerd TIBB RAID tibb12Nerd TIBB RAID tibb12Nerd TIBB RAID tibb12Nerd TIBB RAID tibb12Nerd TIBB RAID tibb12Nerd TIBB RAID tibb12Nerd TIBB RAID tibb12Nerd TIBB RAID tibb12Nerd TIBB RAID tibb12Nerd TIBB RAID tibb12Nerd`);
  }
});
client.on("subscription", (channel, username, methods, message, userstate, method) => {
  SETTINGS = JSON.parse(fs.readFileSync("./SETTINGS.json"));
  if (SETTINGS.ks == false) {
  client.say(CHANNEL_NAME, `tibb12Subhype tibb12Subhype tibb12Subhype`);
  client.say(CHANNEL_NAME, `tibb12Subhype tibb12Subhype tibb12Subhype`);
  client.say(CHANNEL_NAME, `tibb12Subhype tibb12Subhype tibb12Subhype`);
  client.say(CHANNEL_NAME, `tibb12Subhype tibb12Subhype tibb12Subhype`);
  client.say(CHANNEL_NAME, `tibb12Subhype tibb12Subhype tibb12Subhype`);
  client.say(CHANNEL_NAME, `${method}`);
  client.say(CHANNEL_NAME, `${methods}`);
  }
});
client.on("giftpaidupgrade", (channel, username, viewers, method) => {
  SETTINGS = JSON.parse(fs.readFileSync("./SETTINGS.json"));
  if (SETTINGS.ks == false) {
  client.say(
    CHANNEL_NAME,
    `.announce ${username} just contuied their gifted sub. thankyou so much ${username} tibb12Love !`
    );
  }
});
client.on("subgift", (channel, username, viewers, method) => {
  SETTINGS = JSON.parse(fs.readFileSync("./SETTINGS.json"));
  if (SETTINGS.ks == false) {
  client.say(CHANNEL_NAME, `!thanks @${username} so much for gifting a sub to ${method}.`);
  client.say(CHANNEL_NAME, `tibb12Subhype tibb12Subhype tibb12Subhype`)
  }
});
// client.on("connected", (channel) => {
//   client.say(CHANNEL_NAME, `Joined channel ${CHANNEL_NAME}. tibb12Pls`);
// });
client.on("reconnect", (channel) => {
  client.say(CHANNEL_NAME, `Reconnected to channel ${CHANNEL_NAME}. tibb12Dance`)
});
client.on("disconnected", (channel) => {
  client.say(CHANNEL_NAME, `Left channel ${CHANNEL_NAME}. tibb12Fall`)
});
client.on("resub", (channel, username, viewers, methods, method) => {
  SETTINGS = JSON.parse(fs.readFileSync("./SETTINGS.json")); 
  if (SETTINGS.ks == false) {
    client.say(CHANNEL_NAME, `${method}`);
    client.say(CHANNEL_NAME, `${methods}`);
  }
});
client.on("raided", async (channel, username, viewers) => {
  SETTINGS = JSON.parse(fs.readFileSync("./SETTINGS.json"));
  if (SETTINGS.ks == false) {
  if (viewers > 9) {
    client.say(
      `${CHANNEL_NAME}`,
      `/announce ${username}, just raided with ${viewers}, thank you so much. tibb12Love`
    );
    client.say(CHANNEL_NAME, `/followers`);

    // TO DO : here as well need to revert after raid to old setings

    SETTINGS["spamFilter"] = false;
    SETTINGS["lengthFilter"] = false;
    fs.writeFileSync("./SETTINGS.json", JSON.stringify(SETTINGS));
    await setTimeout(60 * 1000);
    SETTINGS["spamFilter"] = true;
    SETTINGS["lengthFilter"] = true;
    fs.writeFileSync("./SETTINGS.json", JSON.stringify(SETTINGS));
    client.say(CHANNEL_NAME, `/followersoff`);
  }
}
});

client.on("clearchat", () => {
  client.say(CHANNEL_NAME, `The chat has been cleared. SadgeCry`)
});

client.on("cheer", async (channel, userstate, message) => {
  SETTINGS = JSON.parse(fs.readFileSync("./SETTINGS.json"));
  if (SETTINGS.ks == false) {
  var RandomMessages = ["tibb12Bits tibb12Bits tibb12Bits"];
  var random =
    RandomMessages[Math.floor(Math.random() * RandomMessages.length)];
  var Bits = userstate.bits;

  if (Bits > 49) {
   client.say(CHANNEL_NAME, `${random}`)
  } 
  if (Bits > 99) {
    client.say(CHANNEL_NAME, `${random}`);
    client.say(CHANNEL_NAME, `${random}`);
    client.say(CHANNEL_NAME, `${random}`);
  } 
  if (Bits > 499) {
    client.say(CHANNEL_NAME, `${random}`);
    client.say(CHANNEL_NAME, `${random}`);
    client.say(CHANNEL_NAME, `${random}`);
    client.say(CHANNEL_NAME, `${random}`);
    client.say(CHANNEL_NAME, `${random}`);
  } 
  if (Bits > 999) {
    client.say(CHANNEL_NAME, `${random}`);
    client.say(CHANNEL_NAME, `${random}`);
    client.say(CHANNEL_NAME, `${random}`);
    client.say(CHANNEL_NAME, `${random}`);
    client.say(CHANNEL_NAME, `${random}`);
    client.say(CHANNEL_NAME, `${random}`);
    client.say(CHANNEL_NAME, `${random}`);
    client.say(CHANNEL_NAME, `${random}`);
    client.say(CHANNEL_NAME, `${random}`);
    client.say(CHANNEL_NAME, `${random}`);

    SETTINGS["spamFilter"] = false;
    SETTINGS["lengthFilter"] = false;
    fs.writeFileSync("./SETTINGS.json", JSON.stringify(SETTINGS));
    
    await setTimeout(15 * 1000);
    SETTINGS["spamFilter"] = true;
    SETTINGS["lengthFilter"] = true;
    fs.writeFileSync("./SETTINGS.json", JSON.stringify(SETTINGS));

  }
  if (Bits > 4999) {
    client.say(CHANNEL_NAME, `${random}`);
    client.say(CHANNEL_NAME, `${random}`);
    client.say(CHANNEL_NAME, `${random}`);
    client.say(CHANNEL_NAME, `${random}`);
    client.say(CHANNEL_NAME, `${random}`);
    client.say(CHANNEL_NAME, `${random}`);
    client.say(CHANNEL_NAME, `${random}`);
    client.say(CHANNEL_NAME, `${random}`);
    client.say(CHANNEL_NAME, `${random}`);
    client.say(CHANNEL_NAME, `${random}`);
    client.say(CHANNEL_NAME, `${random}`);
    client.say(CHANNEL_NAME, `${random}`);
    client.say(CHANNEL_NAME, `${random}`);
    client.say(CHANNEL_NAME, `${random}`);
    client.say(CHANNEL_NAME, `${random}`);
    client.say(CHANNEL_NAME, `${random}`);
    client.say(CHANNEL_NAME, `${random}`);
    client.say(CHANNEL_NAME, `${random}`);
    client.say(CHANNEL_NAME, `${random}`);
    client.say(CHANNEL_NAME, `${random}`);
    client.say(CHANNEL_NAME, `${random}`);
    client.say(CHANNEL_NAME, `${random}`);
    client.say(CHANNEL_NAME, `${random}`);
    client.say(CHANNEL_NAME, `${random}`);
    client.say(CHANNEL_NAME, `${random}`);

    SETTINGS["spamFilter"] = false;
    SETTINGS["lengthFilter"] = false;
    fs.writeFileSync("./SETTINGS.json", JSON.stringify(SETTINGS));

    
    await setTimeout(30 * 1000);
    SETTINGS["spamFilter"] = true;
    SETTINGS["lengthFilter"] = true;
    fs.writeFileSync("./SETTINGS.json", JSON.stringify(SETTINGS));

  } 
  if (Bits > 9999) {
    client.say(CHANNEL_NAME, `${random}`);
    client.say(CHANNEL_NAME, `${random}`);
    client.say(CHANNEL_NAME, `${random}`);
    client.say(CHANNEL_NAME, `${random}`);
    client.say(CHANNEL_NAME, `${random}`);
    client.say(CHANNEL_NAME, `${random}`);
    client.say(CHANNEL_NAME, `${random}`);
    client.say(CHANNEL_NAME, `${random}`);
    client.say(CHANNEL_NAME, `${random}`);
    client.say(CHANNEL_NAME, `${random}`);
    client.say(CHANNEL_NAME, `${random}`);
    client.say(CHANNEL_NAME, `${random}`);
    client.say(CHANNEL_NAME, `${random}`);
    client.say(CHANNEL_NAME, `${random}`);
    client.say(CHANNEL_NAME, `${random}`);
    client.say(CHANNEL_NAME, `${random}`);
    client.say(CHANNEL_NAME, `${random}`);
    client.say(CHANNEL_NAME, `${random}`);
    client.say(CHANNEL_NAME, `${random}`);
    client.say(CHANNEL_NAME, `${random}`);
    client.say(CHANNEL_NAME, `${random}`);
    client.say(CHANNEL_NAME, `${random}`);
    client.say(CHANNEL_NAME, `${random}`);
    client.say(CHANNEL_NAME, `${random}`);
    client.say(CHANNEL_NAME, `${random}`);
    client.say(CHANNEL_NAME, `${random}`);
    client.say(CHANNEL_NAME, `${random}`);
    client.say(CHANNEL_NAME, `${random}`);
    client.say(CHANNEL_NAME, `${random}`);
    client.say(CHANNEL_NAME, `${random}`);
    client.say(CHANNEL_NAME, `${random}`);
    client.say(CHANNEL_NAME, `${random}`);
    client.say(CHANNEL_NAME, `${random}`);
    client.say(CHANNEL_NAME, `${random}`);
    client.say(CHANNEL_NAME, `${random}`);
    client.say(CHANNEL_NAME, `${random}`);
    client.say(CHANNEL_NAME, `${random}`);
    client.say(CHANNEL_NAME, `${random}`);
    client.say(CHANNEL_NAME, `${random}`);
    client.say(CHANNEL_NAME, `${random}`);
    client.say(CHANNEL_NAME, `${random}`);
    client.say(CHANNEL_NAME, `${random}`);
    client.say(CHANNEL_NAME, `${random}`);
    client.say(CHANNEL_NAME, `${random}`);
    client.say(CHANNEL_NAME, `${random}`);
    client.say(CHANNEL_NAME, `${random}`);
    client.say(CHANNEL_NAME, `${random}`);
    client.say(CHANNEL_NAME, `${random}`);
    client.say(CHANNEL_NAME, `${random}`);
    client.say(CHANNEL_NAME, `${random}`);

    SETTINGS["spamFilter"] = false;
    SETTINGS["lengthFilter"] = false;
    fs.writeFileSync("./SETTINGS.json", JSON.stringify(SETTINGS));

    
    await setTimeout(60 * 1000);
    SETTINGS["spamFilter"] = true;
    SETTINGS["lengthFilter"] = true;
    fs.writeFileSync("./SETTINGS.json", JSON.stringify(SETTINGS));
  }

}
});
// Game Command
client.on("message", async (channel, userstate, message, self, viewers) => {

  SETTINGS = JSON.parse(fs.readFileSync("./SETTINGS.json"));
  STREAMS = JSON.parse(fs.readFileSync("./STREAMS.json"));

  if (SETTINGS.ks == false) {
    if (
      message.toLowerCase() == "!game" || 
      message.toLowerCase() == "1game"
      ) {
        const location = await ROBLOX_FUNCTIONS.getPresence(tibb12Id).then((r)=>{return r.lastLocation})
        const locationId = await ROBLOX_FUNCTIONS.getPresence(tibb12Id).then((r)=>{return r.placeId})
        const onlineStatus = await ROBLOX_FUNCTIONS.getLastOnline(tibb12Id).then((r)=>{return r.diffTimeMinutes})
    
        if (locationId == '4588604953') {
            return client.raw(`@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Tibb is currently playing Criminality.`)};
        if (locationId == '8343259840') {
            return client.raw(`@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Tibb is currently playing Criminality.`)};
        if (locationId == '292439477') {
            return client.raw(`@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Tibb is currently playing Phantom Forces.`)};
        if (locationId == '2317712696') {
            return client.raw(`@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Tibb is currently playing The Wild West.`)};
        if (locationId == '286090429') {
            return client.raw(`@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Tibb is currently playing Arsenal.`)};
        if (locationId == '8260276694') {
            return client.raw(`@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Tibb is currently playing Ability Wars.`)};
        if (locationId == '606849621') {
            return client.raw(`@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Tibb is currently playing Jailbreak.`)};
        if (locationId == '1962086868') {
            return client.raw(`@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Tibb is currently playing Tower of Hell.`)};
        if (locationId == '6808416928') {
            return client.raw(`@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Tibb is currently playing Aimblox.`)};
        if (locationId == '3527629287') {
            return client.raw(`@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Tibb is currently playing Big Paintball.`)};
        if (locationId == '2414851778') {
            return client.raw(`@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Tibb is currently playing Dungeon Quest.`)};
        if (locationId == '6403373529') {
            return client.raw(`@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Tibb is currently playing Slap Battles.`)};
        if (locationId == '3260590327') {
            return client.raw(`@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Tibb is currently playing Tower Defense Simulator.`)};
        if (locationId == '740581508') {
            return client.raw(`@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Tibb is currently playing Entry Point.`)};
        if (locationId == '5993942214') {
            return client.raw(`@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Tibb is currently playing Rush Point.`)};
        if (locationId == '4282985734') {
            return client.raw(`@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Tibb is currently playing Combat Warriors.`)};
        if (locationId == '734159876') {
            return client.raw(`@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Tibb is currently playing SharkBite.`)};
        if (locationId == '863266079') {
            return client.raw(`@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Tibb is currently playing Apocalypse Rising 2.`)};
        if (locationId == '8054462345') {
            return client.raw(`@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Tibb is currently playing Michael's Zombies.`)};
        if (locationId == '738339342') {
            return client.raw(`@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Tibb is currently playing Flood Escape 2.`)};
        if (locationId == '9049840490') {
            return client.raw(`@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Tibb is currently playing Sonic Speed Simulator.`)};
        if (locationId == '6284583030') {
            return client.raw(`@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Tibb is currently playing Pet Simulator X.`)};
        if (locationId == '142823291') {
            return client.raw(`@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Tibb is currently playing Murder Mystery 2.`)};
        if (locationId == '4572253581') {
            return client.raw(`@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Tibb is currently playing Murder.`)};
        if (locationId == '185655149') {
            return client.raw(`@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Tibb is currently playing Welcome to Bloxburg.`)};
        if (locationId == '2534724415') {
            return client.raw(`@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Tibb is currently playing Emergency Response: Liberty County.`)};
        if (locationId == '4468711919') {
            return client.raw(`@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Tibb is currently playing Super Golf.`)};
        if (locationId == '998374377') {
            return client.raw(`@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Tibb is currently playing Super Nostalgia Zone.`)};
        if (locationId == '4872321990') {
            return client.raw(`@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Tibb is currently playing Islands.`)};
        if (locationId == '4913331862') {
            return client.raw(`@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Tibb is currently playing Recoil Zombies.`)};
        if (locationId == '3233893879') {
            return client.raw(`@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Tibb is currently playing Bad Business.`)};
        if (locationId == '1224212277') {
            return client.raw(`@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Tibb is currently playing Mad City.`)};
        if (locationId == '6839171747') {
            return client.raw(`@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Tibb is currently playing Doors.`)};
        if (locationId == '6516141723') {
            return client.raw(`@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Tibb is currently playing Doors.`)};
    
    
            if (SETTINGS.currentMode == "!gamble.on") {
                return client.raw(
                    `@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Tibb is currently playing RblxWild.`
                );
            }
            if (onlineStatus > 30) {
                return client.raw(
                    `@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Tibb is not playing anything right now.`
                );
            }
            if (location != 'Website') {
                client.raw(
                    `@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Tibb is currently playing ${location}.`
                    ); 
                  return
            }
            return client.raw(
                `@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Tibb is currently switching games.`
            );
    }
  } 
});

// Playtime Command
client.on("message", async (channel, userstate, message, self, viewers) => {

  SETTINGS = JSON.parse(fs.readFileSync("./SETTINGS.json"));
  STREAMS = JSON.parse(fs.readFileSync("./STREAMS.json"));

  if (SETTINGS.ks == false) {
    if (message.toLowerCase() == "!playtime") {

      const location = await ROBLOX_FUNCTIONS.getPresence(tibb12Id).then((r)=>{return r.lastLocation})
      const locationId = await ROBLOX_FUNCTIONS.getPresence(tibb12Id).then((r)=>{return r.placeId})
      const onlineStatus = await ROBLOX_FUNCTIONS.getLastOnline(tibb12Id).then((r)=>{return r.diffTimeMinutes})
      const playtime = await ROBLOX_FUNCTIONS.getLastOnline(tibb12Id).then((r)=>{return r.timeString})

      if (locationId == '4588604953') { return client.raw(`@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Tibb has been playing Criminality for ${playtime}.`)};
      if (locationId == '8343259840') { return client.raw(`@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Tibb has been playing Criminality for ${playtime}.`)};
      if (locationId == '292439477') { return client.raw(`@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Tibb has been playing Phantom Forces for ${playtime}.`)};
      if (locationId == '2317712696') { return client.raw(`@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Tibb has been playing The Wild West for ${playtime}.`)};
      if (locationId == '286090429') { return client.raw(`@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Tibb has been playing Arsenal for ${playtime}.`)};
      if (locationId == '8260276694') { return client.raw(`@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Tibb has been playing Ability Wars for ${playtime}.`)};
      if (locationId == '606849621') { return client.raw(`@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Tibb has been playing Jailbreak for ${playtime}.`)};
      if (locationId == '1962086868') { return client.raw(`@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Tibb has been playing Tower of Hell for ${playtime}.`)};
      if (locationId == '6808416928') { return client.raw(`@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Tibb has been playing Aimblox for ${playtime}.`)};
      if (locationId == '3527629287') { return client.raw(`@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Tibb has been playing Big Paintball for ${playtime}.`)};
      if (locationId == '2414851778') { return client.raw(`@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Tibb has been playing Dungeon Quest for ${playtime}.`)};
      if (locationId == '6403373529') { return client.raw(`@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Tibb has been playing Slap Battles for ${playtime}.`)};
      if (locationId == '3260590327') { return client.raw(`@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Tibb has been playing Tower Defense Simulator for ${playtime}.`)};
      if (locationId == '740581508') { return client.raw(`@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Tibb has been playing Entry Point for ${playtime}.`)};
      if (locationId == '5993942214') { return client.raw(`@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Tibb has been playing Rush Point for ${playtime}.`)};
      if (locationId == '4282985734') { return client.raw(`@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Tibb has been playing Combat Warriors for ${playtime}.`)};
      if (locationId == '734159876') { return client.raw(`@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Tibb has been playing SharkBite for ${playtime}.`)};
      if (locationId == '863266079') { return client.raw(`@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Tibb has been playing Apocalypse Rising 2 for ${playtime}.`)};
      if (locationId == '8054462345') { return client.raw(`@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Tibb has been playing Michael's Zombies for ${playtime}.`)};
      if (locationId == '738339342') { return client.raw(`@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Tibb has been playing Flood Escape 2 for ${playtime}.`)};
      if (locationId == '9049840490') { return client.raw(`@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Tibb has been playing Sonic Speed Simulator for ${playtime}.`)};
      if (locationId == '6284583030') { return client.raw(`@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Tibb has been playing Pet Simulator X for ${playtime}.`)};
      if (locationId == '142823291') { return client.raw(`@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Tibb has been playing Murder Mystery 2 for ${playtime}.`)};
      if (locationId == '4572253581') { return client.raw(`@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Tibb has been playing Murder for ${playtime}.`)};
      if (locationId == '185655149') { return client.raw(`@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Tibb has been playing Welcome to Bloxburg ${playtime}.`)};
      if (locationId == '2534724415') { return client.raw(`@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Tibb has been playing Emergency Response: Liberty County for ${playtime}.`)};
      if (locationId == '4468711919') { return client.raw(`@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Tibb has been playing Super Golf for ${playtime}.`)};
      if (locationId == '998374377') { return client.raw(`@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Tibb has been playing Super Nostalgia Zone for ${playtime}.`)};
      if (locationId == '4872321990') { return client.raw(`@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Tibb has been playing Islands for ${playtime}.`)};
      if (locationId == '4913331862') { return client.raw(`@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Tibb has been playing Recoil Zombies for ${playtime}.`)};
      if (locationId == '3233893879') { return client.raw(`@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Tibb has been playing Bad Business for ${playtime}.`)};
      if (locationId == '1224212277') { return client.raw(`@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Tibb has been playing Mad City for ${playtime}.`)};
      if (locationId == '6839171747') { return client.raw(`@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Tibb has been playing Doors for ${playtime}.`)};
      if (locationId == '6516141723') { return client.raw(`@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Tibb has been playing Doors for ${playtime}.`)};

      if (SETTINGS.currentMode == "!gamble.on") {
        return client.raw(`@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Tibb is playing RblxWild but sadly cant track playtime for this yet SadgeCry`)
      }

      if (onlineStatus > 30) {
        return client.raw(`@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Tibb is not playing anything right now.`);
      }

      console.log(playtime)
      if (location != 'Website') {
        client.raw(`@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Tibb has been playing ${location} for ${playtime}.`)
        return
      }
      
      return client.raw(`@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Tibb is currently switching games.`)
    }
  }
});

client.on("message", async (channel, userstate, message, self, viewers) => {
  SETTINGS = JSON.parse(fs.readFileSync("./SETTINGS.json"));
  STREAMS = JSON.parse(fs.readFileSync("./STREAMS.json"));

  const locationId = await ROBLOX_FUNCTIONS.getPresence(tibb12Id).then((r)=>{return r.placeId})
  const location = await ROBLOX_FUNCTIONS.getPresence(tibb12Id).then((r)=>{return r.lastLocation})
  const onlineStatus = await ROBLOX_FUNCTIONS.getLastOnline(tibb12Id).then((r)=>{return r.diffTimeMinutes})

  if (SETTINGS.ks == false) {
    if (message.toLowerCase() == "!gamelink") {
      if (locationId == '8343259840') { return client.raw(`@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Current game link -> roblox.com/games/4588604953`)};
      if (locationId == '6839171747') { return client.raw(`@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Current game link -> roblox.com/games/6516141723`)};

      if (SETTINGS.currentMode == "!gamble.on") {
        return client.raw(
          `@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Current game link -> rblxwild.com`
        );
      }
      if (onlineStatus > 30) {
        return client.raw(`@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Tibb is currenly offline so there is no game link.`
        );
      }
      if (location != 'Website') {
        client.raw(`@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Current game link -> roblox.com/games/${locationId}`
        );
        return
      }
      return client.raw(`@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Tibb is currently switching games.`);
    }
  }
});

client.on("message", async (channel, userstate, message, self, viewers) => {
  SETTINGS = JSON.parse(fs.readFileSync("./SETTINGS.json"));
  STREAMS = JSON.parse(fs.readFileSync("./STREAMS.json"));

  const location = await ROBLOX_FUNCTIONS.getPresence(tibb12Id).then((r)=>{return r.lastLocation})
  const onlineStatus = await ROBLOX_FUNCTIONS.getLastOnline(tibb12Id).then((r)=>{return r.diffTimeMinutes})
  const offlinetime = await ROBLOX_FUNCTIONS.getLastOnline(tibb12Id).then((r)=>{return r.timeString})

  if (SETTINGS.ks == false) {
    if (message.toLowerCase() == "!offlinetime") {
      if (onlineStatus > 30) {
        return client.raw(
          `@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Tibb has been offline for ${offlinetime}.`
        );
      }
    
      console.log(offlinetime)
      if (location != 'Website') {
        client.raw(
          `@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Tibb is currently online playing ${location}.`
        );
        return
      }
    
      if (SETTINGS.currentMode == "!gamble.on") {
        return client.raw(
          `@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Tibb is currently online playing RblxWild.`
        );
      }
    
      return client.raw(
        `@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Tibb is currenty online.`
      );
    }
  }
});

// Commands
client.on("message", async (channel, userstate, message, self, viewers) => {
  const twitchDisplayName = userstate["display-name"];
  const twitchUsername = userstate["username"];

  const isMod = userstate["mod"];

  if (SETTINGS.ks == false) {
    if (message == "!nocap") {
      client.say(CHANNEL_NAME, `🚫 🧢`);
    }
    if (message == "!version") {
      client.raw(
        `@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Current version is V2.6.8`
      );
    }
    if (message.toLowerCase().startsWith("!bot")) {
      client.raw(
        `@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #mr_cheeezzbot :To get the bot pleease contact SwitchingMains or Mr_Cheeezz in any room that the bot is in.`
      );
    }
    if (message.toLowerCase().includes("poof")) {
      TWITCH_FUNCTIONS.timeoutUser(
        twitchUsername,
        "RNG Timeout 1 - 150",
        Math.floor(Math.random() * 150)
      );
      client.say(CHANNEL_NAME, `ppPoof`);
    }
    if (message.toLowerCase() == "!vanish") {
      if (!isMod) {
        TWITCH_FUNCTIONS.timeoutUser(
          twitchUsername,
          `${twitchUsername}, you are now invisible.`,
          15
        );
        client.say(
          CHANNEL_NAME,
           `/me ${twitchUsername}, you are now invisible. tibb12Point OMEGALUL`
           );
      }
    }
    if (message.toLowerCase() == "!dice") {
      client.say(CHANNEL_NAME, `Rolling Dice...`);
      await setTimeout(1.5 * 1000)
      client.raw(
        `@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :The Dice lands on ${Math.floor(Math.random() * 7)}.`
        );
    }
    if (
      message.toLowerCase() == "1join" ||
      message.toLowerCase() == "?join" ||
      message.toLowerCase() == "`join" ||
      message.toLowerCase() == "|join" ||
      message.toLowerCase() == "[join" ||
      message.toLowerCase() == "[join" ||
      message.toLowerCase() == ";join" ||
      message.toLowerCase() == "$join"
      ) {
        client.say(
          CHANNEL_NAME,
          `/me : ${twitchUsername} -> FOLLOW MY TWITCH tibb12Gasm & Click here to play tibb12Exhausted : roblox.com/users/${tibb12Id} tibb12Tabbman (tibb12_TTV) // Join my Group tibb12Pls : roblox.com/groups/6225493`
        )
      }
  }
});

async function customModCommands(client, message, twitchUsername, userstate) {
  var messageArray = ([] = message.toLowerCase().split(" "));

  if (messageArray[0] == "!restrict") {
    if (messageArray[1] == null) {
      return client.raw(
        `@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Please specify a valid username.`
      );
    } else {
      client.say(
        CHANNEL_NAME,
        `/restrict ${messageArray[1]}`
        );
      client.raw(
        `@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Successfully restricted user.`
        );
    }
  }
  if (messageArray[0] == "!unrestrict") {
    if (messageArray[1] == null) {
      return client.raw(
        `@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Please specify a valid username.`
      );
    } else {
      client.say(
        CHANNEL_NAME,
        `/unrestrict ${messageArray[1]}`
      );
      client.raw(
        `@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Successfully unrestricted user.`
        ); 
    }
  }
}

// Corrections
client.on("message", async (channel, userstate, message, self, viewers) => {
  SETTINGS = JSON.parse(fs.readFileSync("./SETTINGS.json"));
  STREAMS = JSON.parse(fs.readFileSync("./STREAMS.json"));
  

  var currentMode = SETTINGS.currentMode.replace('.on', '')
  currentMode = currentMode.replace('!', '')

  var responsesd = SETTINGS.main

  for (const key in responsesd) {
    if (key == currentMode) {

  const twitchUsername = userstate["username"];
  const twitchDisplayName = userstate["display-name"];

  if (SETTINGS.ks == false) {
    if (SETTINGS.currentMode == "!join.on") {
      if (
        message.toLowerCase() == "!link" ||
        message.toLowerCase() == "!vip"
        ) {

        client.raw(
          `@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :There is not currently a link. Use the !join command to join tibb.`
        );
        client.say(CHANNEL_NAME, `${responsesd[key]} @${twitchUsername}`)
      }
    }
    if (SETTINGS.currentMode == "!link.on") {
      if (
        message.toLowerCase() == "!join" ||
        message.toLowerCase() == "!roblox" ||
        message.toLowerCase() == "!play" ||
        message.toLowerCase() == "!rblx" ||
        message.toLowerCase() == "!roblos" ||
        message.toLowerCase() == "!profile" 
        ) {
        
        client.raw(
          `@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :You need to join tibb from a link. Use the !link command to join tibb.`);
        client.say(CHANNEL_NAME, `${responsesd[key]} @${twitchUsername}`)
      }
    }
  }
}
  }
});

var block = false;
  client.on("message", async (channel, userstate, message, self) => {

    SETTINGS = JSON.parse(fs.readFileSync("./SETTINGS.json"));
    STREAMS = JSON.parse(fs.readFileSync("./STREAMS.json"));

    if (SETTINGS.ks == false) {

      if(self) return;

      if (message.includes("clips.twitch.tv")) {
        if (!block) {
            console.log(client.raw(`@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :You have sent a clip in chat as a reminder if you want ${CHANNEL_NAME} to watch it on stream you can donate 5 dollars or send 500 bits.`));
            block = true;
            setTimeout(() => {
                block = false;
            }, (120 * 1000));
        }
      }
    }
});