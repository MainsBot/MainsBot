import * as ROBLOX_FUNCTIONS from "../api/roblox/index.js";
import * as TWITCH_FUNCTIONS from "../api/twitch/helix.js";
import * as SPOTIFY_FUNCTIONS from "../api/spotify/index.js";
import { getPublicRobloxTokenSnapshot } from "../api/roblox/auth.js";
import fs, { link } from 'fs'

const BOT_OAUTH = process.env.BOT_OAUTH// bot oauth token for performing actions
const COOKIE = process.env.COOKIE // <--- change this to your cookie

const BOT_NAME = process.env.BOT_NAME// bot username
const CHANNEL_NAME = process.env.CHANNEL_NAME// name of the channel for the bot to be in
const CHANNEL_ID = process.env.CHANNEL_ID // id of channel for the bot to be in
const BOT_ID = process.env.BOT_ID
const SPOTIFY_BOT_OAUTH = process.env.SPOTIFY_BOT_OAUTH
const SPOTIFY_BOT_NAME = process.env.SPOTIFY_BOT_NAME

const WAIT_REGISTER = 5 * 60 * 1000// number of milliseconds, to wait before starting to get stream information

const COOLDOWN = process.env.COOLDOWN // number of milliseconds, cool down for replying to people
const MESSAGE_MEMORY = process.env.MESSAGE_MEMORY // number of milliseconds, until bot forgots message for spam filter

const MAX_MESSAGE_LENGTH = process.env.MAX_MESSAGE_LENGTH// max number of characters until timeout
const BASE_LENGTH_TIMEOUT = process.env.BASE_LENGTH_TIMEOUT // base timeout for using too many characters
const MAX_LENGTH_TIMEOUT = process.env.MAX_LENGTH_TIMEOUT// max timeout for using too many characters

const BASE_SPAM_TIMEOUT = process.env.BASE_SPAM_TIMEOUT // base timeout for spam, this would be for first time offenders
const MAX_SPAM_TIMEOUT = process.env.MAX_SPAM_TIMEOUT // max timeout for spam, this stops the timeout length doubling infinitely for repeat offenders

const MINIMUM_CHARACTERS = process.env.MINIMUM_CHARACTERS // [NOT IMPLEMENTED RN] minimum message length for bot to log message
const MAXIMUM_SIMILARITY = process.env.MAXIMUM_SIMILARITY // percentage similarity of spam for timeout to happen
const MINIMUM_MESSAGE_COUNT = process.env.MINIMUM_MESSAGE_COUNT // minimum number of messages for spam filter to start punishing

const MAINS_BOT_CLIENT_ID = process.env.MAINS_BOT_CLIENT_ID
const CHEEEZZ_BOT_CLIENT_ID = process.env.CHEEEZZ_BOT_CLIENT_ID
const APP_ACCESS_TOKEN = process.env.APP_ACCESS_TOKEN
// timers
const WAIT_UNTIL_FOC_OFF = process.env.WAIT_UNTIL_FOC_OFF // 2 minutes
const WAIT_UNTIL_FOC_OFF_RAID = process.env.WAIT_UNTIL_FOC_OFF_RAID // every 5 minutes
const SPAM_LINK = process.env.SPAM_LINK // every 5 minutes
const JOIN_TIMER = process.env.JOIN_TIMER // every 2 minutes
let MUTATED_JOIN_TIMER = 120000 // timer that uses the JOIN_TIMER to change the interval based on viewer count
const WEB_ACCESS_TOKEN = process.env.WEB_ACCESS_TOKEN

const SONG_TIMER = process.env.SONG_TIMER
const CHANNEL_NAME_DISPLAY = process.env.CHANNEL_NAME_DISPLAY
const STREAMER_DISPLAY_NAME =
  String(CHANNEL_NAME_DISPLAY || CHANNEL_NAME || "").trim() || "Streamer";

const ROBLOX_UNLINKED_CHAT_MESSAGE = "Streamer hasn't linked Roblox yet.";

function readLinkMode() {
  const raw = String(process.env.LINK_MODE ?? "").trim();
  const n = raw ? Number(raw) : 1;
  if (n === 0) return 0;
  if (n === 2) return 2;
  return 1;
}

function wantDirectLinkResponses() {
  if (readLinkMode() === 2) return true;
  const style = String(process.env.LINK_REPLY_STYLE || "").trim().toLowerCase();
  return style === "direct" || style === "link";
}

function getSavedJoinLink(settings) {
  return String(settings?.currentLink || "").trim();
}

function buildDirectJoinLinkText({ target, joinLink, suffix } = {}) {
  const uname = String(target || "").trim();
  const link = String(joinLink || "").trim();
  const tail = String(suffix || "").trim();
  if (!link) {
    return uname ? `@${uname}, no join link is set yet.` : "No join link is set yet.";
  }
  const extra = tail ? ` ${tail}` : "";
  return uname ? `@${uname}, join link -> ${link}.${extra}`.trim() : `Join link -> ${link}.${extra}`.trim();
}

function getTrackedRobloxUserId() {
  const snapshot = getPublicRobloxTokenSnapshot();
  const userId = Number(snapshot?.bot?.userId || 0);
  return Number.isInteger(userId) && userId > 0 ? userId : null;
}

async function replySongNowPlaying(client, target) {
  try {
    const nowPlaying = await SPOTIFY_FUNCTIONS.getNowPlaying()

    if (!nowPlaying || !nowPlaying.playing) {
      return client.say(
        CHANNEL_NAME,
        `@${target}, ${STREAMER_DISPLAY_NAME} is not listening to anything right now.`
      )
    }

    const songName = String(nowPlaying.name || "").trim() || "Unknown Song"
    const songArtists = String(nowPlaying.artists || "").trim() || "Unknown Artist"

    return client.say(
      CHANNEL_NAME,
      `@${target}, ${STREAMER_DISPLAY_NAME} is currently listening to ${songName} - ${songArtists}.`
    )
  } catch (error) {
    console.error("[KEYWORD SONG] failed to read Spotify now playing:", error)
    return client.say(
      CHANNEL_NAME,
      `@${target}, I couldn't read Spotify right now.`
    )
  }
}

export const responses = {
  join(client, target, message = null){
    const SETTINGS = JSON.parse(fs.readFileSync("./SETTINGS.json"))
    var currentMode = SETTINGS.currentMode
    if (currentMode == "!link.on") {
      const linkMode = readLinkMode();
      if (linkMode === 0) {
        client.say(CHANNEL_NAME, `@${target}, join link mode is disabled right now.`);
      } else if (wantDirectLinkResponses()) {
        const link = getSavedJoinLink(SETTINGS);
        client.say(
          CHANNEL_NAME,
          buildDirectJoinLinkText({
            target,
            joinLink: link,
            suffix: "It helps if you put your Roblox username in chat before joining",
          })
        );
      } else {
        client.say(CHANNEL_NAME, `!link @${target}, it would help if you put your roblox username in the chat before joining.`);
      }
    } else if (currentMode == "!1v1.on") {
      client.say(CHANNEL_NAME, `@${target}, ${STREAMER_DISPLAY_NAME} is randomly picking viewers to 1v1. Type 1v1 in chat once to have a chance of being picked.`);
    } else if (currentMode == "!ticket.on") {
      client.say(CHANNEL_NAME, `!ticket @${target}`);
    } else if (currentMode == "!join.on") {
      client.say(CHANNEL_NAME, `!join @${target}`);
    } else if (currentMode == "!val.on") {
      client.say(CHANNEL_NAME, `!val @${target}`);
    }
  }
  ,
  link(client, target, message = null) {
    const SETTINGS = JSON.parse(fs.readFileSync("./SETTINGS.json"))
    const linkMode = readLinkMode();
    if (linkMode === 0) {
      client.say(CHANNEL_NAME, `@${target}, join link mode is disabled right now.`);
      return;
    }

    if (wantDirectLinkResponses()) {
      const link = getSavedJoinLink(SETTINGS);
      client.say(
        CHANNEL_NAME,
        buildDirectJoinLinkText({
          target,
          joinLink: link,
          suffix: "It helps if you put your Roblox username in chat before joining",
        })
      );
      return;
    }

    client.say(CHANNEL_NAME, `!link @${target}, it would help if you put your roblox username in the chat before joining.`);
  },
  "1v1"(client, target, message = null) {
    client.say(
      CHANNEL_NAME,
      `@${target}, ${STREAMER_DISPLAY_NAME} is randomly picking viewers to 1v1. Type 1v1 in chat once to have a chance of being picked.`
    );
  },
  add(client, target, message = null) {
    client.say(CHANNEL_NAME, `!addme @${target}`);
  },
  music: async (client, target, message = null, filters = null) => {
    return replySongNowPlaying(client, target)
  },
  game: async(client, target, message = null) => {
    const SETTINGS = JSON.parse(fs.readFileSync("./SETTINGS.json"))

    try {
      const trackedRobloxUserId = getTrackedRobloxUserId();
      if (!trackedRobloxUserId) {
        return client.say(CHANNEL_NAME, `@${target}, ${ROBLOX_UNLINKED_CHAT_MESSAGE}`);
      }

      const presence = await ROBLOX_FUNCTIONS.getPresence(trackedRobloxUserId)
      const location = String(
        await ROBLOX_FUNCTIONS.resolvePresenceLocation(presence)
      )
      const locationId = String(presence?.placeId || "")
      const userPresenceType = Number(presence?.userPresenceType ?? 0)

      const knownGames = {
        '4588604953': 'Criminality',
        '8343259840': 'Criminality',
        '292439477': 'Phantom Forces',
        '2317712696': 'The Wild West',
        '286090429': 'Arsenal',
        '8260276694': 'Ability Wars',
        '606849621': 'Jailbreak',
        '1962086868': 'Tower of Hell',
        '6808416928': 'Aimblox',
        '3527629287': 'Biga Paintball',
        '2414851778': 'Dungeon Quest',
        '6403373529': 'Slap Battles',
        '3260590327': 'Tower Defense Simulator',
        '740581508': 'Entry Point',
        '5993942214': 'Rush Point',
        '4282985734': 'Combat Warriors',
        '734159876': 'SharkBite',
        '863266079': 'Apocalypse Rising 2',
        '8054462345': "Michael's Zombies",
        '738339342': 'Flood Escape 2',
        '9049840490': 'Sonic Speed Simulator',
        '6284583030': 'Pet Simulator X',
        '142823291': 'Murder Mystery 2',
        '4572253581': 'Murder',
        '185655149': 'Welcome to Bloxburg',
        '2534724415': 'Emergency Response: Liberty County',
        '4468711919': 'Super Golf',
        '998374377': 'Super Nostalgia Zone',
        '4872321990': 'Islands',
        '4913331862': 'Recoil Zombies',
        '3233893879': 'Bad Business',
        '1224212277': 'Mad City',
      }

      if (knownGames[locationId]) {
        return client.say(CHANNEL_NAME, `@${target}, ${STREAMER_DISPLAY_NAME} is currently playing ${knownGames[locationId]}.`)
      }

      if (userPresenceType === 0) {
        return client.say(CHANNEL_NAME, `@${target}, ${STREAMER_DISPLAY_NAME} is not playing anything right now.`)
      }

      if (location && location !== 'Website') {
        return client.say(CHANNEL_NAME, `@${target}, ${STREAMER_DISPLAY_NAME} is currently playing ${location}.`)
      }

      if (SETTINGS.currentMode == "!gamble.on") {
        return client.say(CHANNEL_NAME, `@${target}, ${STREAMER_DISPLAY_NAME} is currently playing Rblx Wild. Type !wild to join.`)
      }

      return client.say(CHANNEL_NAME, `@${target}, ${STREAMER_DISPLAY_NAME} is currently switching games.`)
    } catch (error) {
      console.error("[KEYWORD GAME] failed to fetch Roblox presence:", error)
      return client.say(CHANNEL_NAME, `@${target}, I couldn't read game status right now.`)
    }
  }
  ,
  selfpromotion(client, target, message = null) {
    client.say(CHANNEL_NAME, `.timeout ${target} 3s Self Promotion`)
    client.say(CHANNEL_NAME, `@${target}, do not self-promote.`)
  },
  camera(client, target, message = null) {
    client.say(CHANNEL_NAME, `!camera @${target}`);
  },
  cantjoin: async (client, target, message = null) => {
    const SETTINGS = JSON.parse(fs.readFileSync("./SETTINGS.json"))

    const trackedRobloxUserId = getTrackedRobloxUserId();
    if (!trackedRobloxUserId) {
      return client.say(CHANNEL_NAME, `@${target}, ${ROBLOX_UNLINKED_CHAT_MESSAGE}`);
    }

    const locationId = await ROBLOX_FUNCTIONS.getPresence(trackedRobloxUserId).then((r)=>{return r.placeId})

    var currentMode = SETTINGS.currentMode.replace('.on', '')
    currentMode = currentMode.replace('!', '')

    const responsesd = SETTINGS.main

    for (const key in responsesd) {
      console.log(key)
      console.log(currentMode)
      if (key == currentMode) {
        if (locationId == '8343259840') {
          return client.say(CHANNEL_NAME, `@${target}, you can't join ${STREAMER_DISPLAY_NAME} because you don't have prime or you're on mobile.`);
        } else {
          return client.say(CHANNEL_NAME, `${responsesd[key]} @${target}`);
        }
      }
    }
  },
  group(client, target, message = null) {
    client.say(CHANNEL_NAME, `!group @${target}`);
  },
  joinsoff(client, target, message = null) {
    const SETTINGS = JSON.parse(fs.readFileSync("./SETTINGS.json"))
    var currentMode = SETTINGS.currentMode
    if (currentMode == "!link.on") {
      const linkMode = readLinkMode();
      if (linkMode === 0) {
        client.say(CHANNEL_NAME, `@${target}, join link mode is disabled right now.`);
      } else if (wantDirectLinkResponses()) {
        const link = getSavedJoinLink(SETTINGS);
        client.say(CHANNEL_NAME, buildDirectJoinLinkText({ target, joinLink: link, suffix: "Join using this link" }));
      } else {
        client.say(CHANNEL_NAME, `!link join using this link @${target}`);
      }
    } else {
      client.say(CHANNEL_NAME, `Joins are on - try refreshing the page or following the streamer account @${target}`);
    }
  },
  keyboard(client, target, message = null) {
    client.say(CHANNEL_NAME, `!keyboard @${target}`);
  },
  merch(client, target, message = null) {
    client.say(CHANNEL_NAME, `!merch @${target}`);
  },
  mic(client, target, message = null) {
    client.say(CHANNEL_NAME, `!mic @${target}`);
  },
  // mobile(client, target, message = null) {
  //   client.say(CHANNEL_NAME, `!mobile @${target}`);
  // },
  mod(client, target, message = null) {
    // client.say(CHANNEL_NAME, `!mod @${target}`);
  },
  order69(client, target, message = null) {
    client.say(CHANNEL_NAME, `!order69 @${target}`);
  },
  pc(client, target, message = null) {
    client.say(CHANNEL_NAME, `!pc @${target}`);
  },
  permission(client, target, message = null) {
    const SETTINGS = JSON.parse(fs.readFileSync("./SETTINGS.json"))
    var currentMode = SETTINGS.currentMode
    if (currentMode == "!link.on") {
      const linkMode = readLinkMode();
      if (linkMode === 0) {
        client.say(CHANNEL_NAME, `@${target}, join link mode is disabled right now.`);
      } else if (wantDirectLinkResponses()) {
        const link = getSavedJoinLink(SETTINGS);
        client.say(CHANNEL_NAME, buildDirectJoinLinkText({ target, joinLink: link, suffix: "Join using this link" }));
      } else {
        client.say(CHANNEL_NAME, `!link join using this link @${target}`);
      }
    } else if (currentMode == "1v1.on") {
      client.say(CHANNEL_NAME, `${STREAMER_DISPLAY_NAME} is currently 1v1ing viewers in a private server; type 1v1 in chat to have a chance of being picked @${target}`);
    }
  },
  raid(client, target, message = null) {
    client.say(CHANNEL_NAME, `@${target}, no.`)
  },
  // picked(client, target, message=null) {
  //   client.say(CHANNEL_NAME, `!add @${target}`);
  // },
  recordingsoftware(client, target, message = null) {
    client.say(CHANNEL_NAME, `${STREAMER_DISPLAY_NAME} uses OBS Studio @${target}.`);
  },
  reddit(client, target, message = null) {
    client.say(CHANNEL_NAME, `!reddit @${target}`);
  },
  robux(client, target, message = null) {
    client.say(CHANNEL_NAME, `!robux @${target}`);
  },
  schedule(client, target, message = null) {
    client.say(CHANNEL_NAME, `!schedule @${target}`);
  },
  servertype(client, target, message = null) {
    const SETTINGS = JSON.parse(fs.readFileSync("./SETTINGS.json"))
    var currentMode = SETTINGS.currentMode
    if (currentMode == "!link.on") {
      const linkMode = readLinkMode();
      if (linkMode === 0) {
        client.say(CHANNEL_NAME, `@${target}, join link mode is disabled right now.`);
      } else if (wantDirectLinkResponses()) {
        const link = getSavedJoinLink(SETTINGS);
        client.say(
          CHANNEL_NAME,
          buildDirectJoinLinkText({ target, joinLink: link, suffix: "This is a private server" })
        );
      } else {
        client.say(CHANNEL_NAME, `This is a private server type !link to get the link to join @${target}`);
      }
    } else if (currentMode == "!1v1.on") {
      client.say(CHANNEL_NAME, `${STREAMER_DISPLAY_NAME} is currently 1v1ing viewers in a private server; type 1v1 in chat to have a chance of being picked @${target}`);
    } else if (currentMode == "!ticket.on") {
      client.say(CHANNEL_NAME, `this is a private server type !ticket to learn how to join @${target}`);
    } else if (currentMode == "!join.on") {
      client.say(CHANNEL_NAME, `This is a public server. Type !join to join ${STREAMER_DISPLAY_NAME} @${target}`);
    }
  },
  songrequest(client, target, message = null) {
    client.say(CHANNEL_NAME, `you can request a song by redeeming the song request redemption with channel points @${target}`);
  },
  time(client, target, message = null) {
    client.say(CHANNEL_NAME, `!time @${target}`);
  },
  user(client, target, message = null) {
    client.say(CHANNEL_NAME, `!user @${target}`);
  },
  "1v1": async(client, target, message = null) => {
    const SETTINGS = JSON.parse(fs.readFileSync("./SETTINGS.json"))
    var currentMode = SETTINGS.currentMode
    if (currentMode == "!1v1.on") {
      client.say(CHANNEL_NAME, `Hey, @${target} type 1v1 in chat ONCE to have a chance to 1v1 ${STREAMER_DISPLAY_NAME}.`);
    } else {
      client.say(CHANNEL_NAME, `${STREAMER_DISPLAY_NAME} is not currently doing 1v1s @${target}`);
    }
  },
  vipinfo(client, target, message = null) {
    client.say(CHANNEL_NAME, `!vipinfo @${target}`);
  },
  watchtime(client, target, message = null) {
    client.say(CHANNEL_NAME, `type !watchtime to check your watchtime @${target}`);
  },
  corrections(client, target, message = null, isModOrBroadcaster) {
    const SETTINGS = JSON.parse(fs.readFileSync("./SETTINGS.json"))
    var corrections = SETTINGS.corrections

    var currentMode = SETTINGS.currentMode.replace('.on', '')
    currentMode = currentMode.replace('!', '')

    var choice = message.replace('!', '')
    if(target.toLowerCase() == "fossabot")
    if (currentMode != choice && isModOrBroadcaster == false ) {
      var response = `Hey @${target}, `
      for (const correction in corrections) {
        if (correction == currentMode) {
          response = response + corrections[correction]
        }
      }
      client.say(CHANNEL_NAME, `!${currentMode} ${response}`)
    }

  },
  whogiftedme: async(client, target, message = null, isModOrBroadcaster,twitchUserId)=> {
    const SETTINGS = JSON.parse(fs.readFileSync("./SETTINGS.json"))

    //if(SETTINGS.ks == true)return

    const getSubStatus = await TWITCH_FUNCTIONS.getSubStatus(twitchUserId)
    

    const data = getSubStatus.data

    // console.log(data[0].gifter)

    if(data.length != 0){
      if (data[0].is_gift == false){
        return client.say(CHANNEL_NAME,`@${twitchUsername}, you were not gifted a sub, you subscribed yourself.`)
      }
    }
    const channelEmotes = await TWITCH_FUNCTIONS.getChannelEmotes(twitchUserId)
    const emoteData = channelEmotes.data

    let emoteTable = {
      'Tier 1':[20],
      'Tier 2':[40],
      'Tier 3':[100]
    }

    for (let i = 0; i < emoteData.length; i++){
      const emote = emoteData[i]

      const emoteTier = emote.tier

      if(emoteTier == 1000){
        emoteTable['Tier 1'].push(emote)
      }else if (emoteTier == 2000){
        emoteTable['Tier 2'].push(emote)
      }else if (emoteTier == 3000){
        emoteTable['Tier 3'].push(emote)
      }
    }

    if(data.length != 0){
      const gifter = data[0].gifter_name
      
      let tier;

      if(data[0].tier == 1000){
        tier = 'Tier 1'
      }else if(data[0].tier == 2000){
        tier = 'Tier 2'
      }else if(data[0].tier == 3000){
        tier = 'Tier 3'
      }


      function findItem(arr,randomEmote) {
        for(var i = 0; i < arr.length; ++i) {
          var obj = arr[i];
          if(obj.name == randomEmote) {
            return i;
          }
        }
        return -1;
      }

      const randomEmote1 = emoteData[Math.floor(Math.random() * emoteData.length)].name
      var i = findItem(emoteData,randomEmote1)
      emoteData.splice(i, 1);
      const randomEmote2 = emoteData[Math.floor(Math.random() * emoteData.length)].name
      var e = findItem(emoteData,randomEmote2)
      emoteData.splice(i, 1);
      const randomEmote3 = emoteData[Math.floor(Math.random() * emoteData.length)].name

      return client.say(CHANNEL_NAME,`@${target}, ${gifter} , gifted you a ${tier} sub. As a ${tier} sub you have access to ${emoteTable[tier].length} channel emotes and earn ${emoteTable[tier][0]}% more channel points. Here are three channel emotes you have with a ${tier} sub, ${randomEmote1} ${randomEmote2} ${randomEmote3}`)
    }else{
      return client.say(CHANNEL_NAME,`@${target}, you don't currently have a sub.`)
    }
  },
  donate(client, target, message = null) {
    client.say(CHANNEL_NAME, `!donate @${target} Donations are required and gladly appreciated.`)
  },
  discord(client, target, message = null) {
    client.say(CHANNEL_NAME, `!discord @${target} Click this link to join the discord.`)
  },
  // soon(client, target, message = null) {
  //   client.say(CHANNEL_NAME, `!soon @${target} :tf:`)
  // },
  treatstream(client, target, message = null) {
    client.say(CHANNEL_NAME, `!treat @${target}`)
  },
  dms(client, target, message = null) {
    client.say(CHANNEL_NAME, `@${target} 500 bits`)
  },
  "7tv"(client, target, message = null) {
    client.say(CHANNEL_NAME, `!7tv @${target}`)
  },
  bttv(client, target, message = null) {
    client.say(CHANNEL_NAME, `!bttv @${target}`)
  },
  ffz(client, target, message = null) {
    client.say(CHANNEL_NAME, `!ffz @${target}`)
  },
  sub(client, target, message = null) {
    client.say(CHANNEL_NAME, `@${target}, you can get rid of ads by subscribing to ${STREAMER_DISPLAY_NAME} by clicking the subscribe button or typing !prime`)
  },
  crimid: async(client, target, message = null) => {
    const trackedRobloxUserId = getTrackedRobloxUserId();
    if (!trackedRobloxUserId) {
      return client.say(CHANNEL_NAME, `@${target}, ${ROBLOX_UNLINKED_CHAT_MESSAGE}`);
    }

    const locationId = await ROBLOX_FUNCTIONS.getPresence(trackedRobloxUserId).then((r)=>{return r.placeId})

    if (locationId == '4588604953') {
      return client.say(
        CHANNEL_NAME,
        `@${target} ${STREAMER_DISPLAY_NAME} is not currently in a Criminality server.`
        );
    }
    if (locationId == '8343259840') {
      return client.say(
        CHANNEL_NAME,
        `!crimid @${target}`
        );
    }
  }
  ,
  full(client, target, message = null) {
    client.say(CHANNEL_NAME, `@${target}, wait in the queue.`)
  },
  song: async (client, target, message = null) => {
    return replySongNowPlaying(client, target)
  }
};
