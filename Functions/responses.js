import * as ROBLOX_FUNCTIONS from "./roblox.js";
import * as TWITCH_FUNCTIONS from "./twitch.js";
import fs, { link } from 'fs'

const tibb12Id = 1576231486
import buddyList from 'spotify-buddylist'

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

export const responses = {
  join(client, target, message = null){
    const SETTINGS = JSON.parse(fs.readFileSync("./SETTINGS.json"))
    var currentMode = SETTINGS.currentMode
    if (currentMode == "!link.on") {
      client.say(CHANNEL_NAME, `!link @${target}, it would help if you put your roblox username in the chat before joining.`);
    } else if (currentMode == "!1v1.on") {
      client.say(CHANNEL_NAME, `@${target}, tibb12 is randomly picking viewers to 1v1, type 1v1 in the chat once to have a chance of being picked.`);
    } else if (currentMode == "!ticket.on") {
      client.say(CHANNEL_NAME, `!ticket @${target}`);
    } else if (currentMode == "!join.on") {
      client.say(CHANNEL_NAME, `!join @${target}`);
    } else if (currentMode == "!gamble.on") {
      // client.say(CHANNEL_NAME, `!wild @${target}`);
    }
  }
  ,
  link(client, target, message = null) {
    client.say(
      CHANNEL_NAME,
      `!link @${target}, it would help if you put your roblox username in the chat before joining.`
    );
  },
  "1v1"(client, target, message = null) {
    client.say(
      CHANNEL_NAME,
      `@${target}, tibb12 is randomly picking viewers to 1v1, type 1v1 in the chat once to have a chance of being picked.`
    );
  },
  add(client, target, message = null) {
    client.say(CHANNEL_NAME, `!addme @${target}`);
  },
  music: async (client, target, message = null,filters=null) => {
    const { accessToken } = await buddyList.getWebAccessToken(WEB_ACCESS_TOKEN)
    const track = await buddyList.getFriendActivity(accessToken).then((r) => { return r.friends[0].track })

    const name = [] = track.name.split(' ')
    const artist = [] = track.artist.name.split(' ')

    var finalNameString = ''
    var finalArtistString = ''

    console.log(artist)

    for (let a = 0; a <= name.length; a++) {
      if (a == name.length) {

        console.log(finalNameString + "e")
      } else {
        const word = name[a]
        let isFilteredWord = name.some(word => filters.includes(word.toLowerCase()))

        if (isFilteredWord) {
          if (finalNameString.length != 0) {
            if (finalNameString[finalNameString.length - 1] == ' ') {
              finalNameString += word[0] + word[1] + '*'.repeat(word.length - 2)
            } else {
              finalNameString += ' ' + word[0] + word[1] + '*'.repeat(word.length - 2)
            }
          } else {
            finalNameString += word[0] + word[1] + '*'.repeat(word.length - 2) + ' '
          }

        } else {
          if (finalNameString.length != 0) {
            if (finalNameString[finalNameString.length - 1] == ' ') {
              finalNameString += word
            } else {
              finalNameString += ' ' + word
            }
          } else {
            finalNameString += word
          }

        }
      }
    }



    for (let a = 0; a <= artist.length; a++) {
      if (a == artist.length) {
        client.say(CHANNEL_NAME, `tibb12 prevously listened to '${finalNameString.trimEnd()+"'" + ' by ' + "'"+finalArtistString.trim()+"'"}`)
      } else {
        const word = artist[a]
        let isFilteredWord = artist.some(word => filters.includes(word.toLowerCase()))
        if (isFilteredWord) {
          if (finalArtistString.length != 0) {
            if (finalArtistString[finalArtistString.length - 1] == ' ') {
              finalArtistString += word[0] + word[1] + '*'.repeat(word.length - 2)
            } else {
              finalArtistString += ' ' + word[0] + word[1] + '*'.repeat(word.length - 2)
            }
          } else {
            finalArtistString += word[0] + word[1] + '*'.repeat(word.length - 2) + ' '
          }

        } else {
          if (finalArtistString.length != 0) {
            if (finalArtistString[finalArtistString.length - 1] == ' ') {
              finalArtistString += word + ' '
            } else {
              finalArtistString += ' ' + word
            }
          } else {
            finalArtistString += word + ' '
          }
        }
      }
    }
  },
  game: async(client, target, message = null) => {
    const location = await ROBLOX_FUNCTIONS.getPresence(tibb12Id).then((r)=>{return r.lastLocation})
    const locationId = await ROBLOX_FUNCTIONS.getPresence(tibb12Id).then((r)=>{return r.placeId})
    const onlineStatus = await ROBLOX_FUNCTIONS.getLastOnline(tibb12Id).then((r)=>{return r.diffTimeMinutes})
    const SETTINGS = JSON.parse(fs.readFileSync("./SETTINGS.json"))

    if (locationId == '4588604953') { return client.say(CHANNEL_NAME, `@${target}, Tibb is currently playing Criminality.`)};
    if (locationId == '8343259840') { return client.say(CHANNEL_NAME, `@${target}, Tibb is currently playing Criminality.`)};
    if (locationId == '292439477') { return client.say(CHANNEL_NAME, `@${target}, Tibb is currently playing Phantom Forces.`)};
    if (locationId == '2317712696') { return client.say(CHANNEL_NAME, `@${target}, Tibb is currently playing The Wild West.`)};
    if (locationId == '286090429') { return client.say(CHANNEL_NAME, `@${target}, Tibb is currently playing Arsenal.`)};
    if (locationId == '8260276694') { return client.say(CHANNEL_NAME, `@${target}, Tibb is currently playing Ability Wars.`)};
    if (locationId == '606849621') { return client.say(CHANNEL_NAME, `@${target}, Tibb is currently playing Jailbreak.`)};
    if (locationId == '1962086868') { return client.say(CHANNEL_NAME, `@${target}, Tibb is currently playing Tower of Hell.`)};
    if (locationId == '6808416928') { return client.say(CHANNEL_NAME, `@${target}, Tibb is currently playing Aimblox.`)};
    if (locationId == '3527629287') { return client.say(CHANNEL_NAME, `@${target}, Tibb is currently playing Biga Paintball.`)};
    if (locationId == '2414851778') { return client.say(CHANNEL_NAME, `@${target}, Tibb is currently playing Dungeon Quest.`)};
    if (locationId == '6403373529') { return client.say(CHANNEL_NAME, `@${target}, Tibb is currently playing Slap Battles.`)};
    if (locationId == '3260590327') { return client.say(CHANNEL_NAME, `@${target}, Tibb is currently playing Tower Defense Simulator.`)};
    if (locationId == '740581508') { return client.say(CHANNEL_NAME, `@${target}, Tibb is currently playing Entry Point.`)};
    if (locationId == '5993942214') { return client.say(CHANNEL_NAME, `@${target}, Tibb is currently playing Rush Point.`)};
    if (locationId == '4282985734') { return client.say(CHANNEL_NAME, `@${target}, Tibb is currently playing Combat Warriors.`)};
    if (locationId == '734159876') { return client.say(CHANNEL_NAME, `@${target}, Tibb is currently playing SharkBite.`)};
    if (locationId == '863266079') { return client.say(CHANNEL_NAME, `@${target}, Tibb is currently playing Apocalypse Rising 2.`)};
    if (locationId == '8054462345') { return client.say(CHANNEL_NAME, `@${target}, Tibb is currently playing Michael's Zombies.`)};
    if (locationId == '738339342') { return client.say(CHANNEL_NAME, `@${target}, Tibb is currently playing Flood Escape 2.`)};
    if (locationId == '9049840490') { return client.say(CHANNEL_NAME, `@${target}, Tibb is currently playing Sonic Speed Simulator.`)};
    if (locationId == '6284583030') { return client.say(CHANNEL_NAME, `@${target}, Tibb is currently playing Pet Simulator X.`)};
    if (locationId == '142823291') { return client.say(CHANNEL_NAME, `@${target}, Tibb is currently playing Murder Mystery 2.`)};
    if (locationId == '4572253581') { return client.say(CHANNEL_NAME, `@${target}, Tibb is currently playing Murder.`)};
    if (locationId == '185655149') { return client.say(CHANNEL_NAME, `@${target}, Tibb is currently playing Welcome to Bloxburg.`)};
    if (locationId == '2534724415') { return client.say(CHANNEL_NAME, `@${target}, Tibb is currently playing Emergency Response: Liberty County.`)};
    if (locationId == '4468711919') { return client.say(CHANNEL_NAME, `@${target}, Tibb is currently playing Super Golf.`)};
    if (locationId == '998374377') { return client.say(CHANNEL_NAME, `@${target}, Tibb is currently playing Super Nostalgia Zone.`)};
    if (locationId == '4872321990') { return client.say(CHANNEL_NAME, `@${target}, Tibb is currently playing Islands.`)};
    if (locationId == '4913331862') { return client.say(CHANNEL_NAME, `@${target}, Tibb is currently playing Recoil Zombies.`)};
    if (locationId == '3233893879') { return client.say(CHANNEL_NAME, `@${target}, Tibb is currently playing Bad Business.`)};
    if (locationId == '1224212277') { return client.say(CHANNEL_NAME, `@${target}, Tibb is currently playing Mad City.`)};


    if (onlineStatus > 30){
      return client.say(CHANNEL_NAME,`@${target}, Tibb is not playing anything right now.`)
    }
    console.log(location)
    if(location != 'Website'){
      return client.say(CHANNEL_NAME,`@${target}, Tibb is currently playing ${location}.`)
    }
    if (SETTINGS.currentMode == "!gamble.on") {
      return client.say(
        CHANNEL_NAME,
        `@${target}, Tibb is currently playing Rblx Wild. Type !wild to join.`
      )
    }

      return client.say(CHANNEL_NAME,`@${target}, Tibb is currently switching games.`)

    
  }
  ,
  // selfpromotion(client, target, message = null) {
    // client.say(CHANNEL_NAME, `.timeout ${target} 3s Self Promotion`)
    // client.say(CHANNEL_NAME, `@${target}, do not self-promote.`)
  // },
  camera(client, target, message = null) {
    client.say(CHANNEL_NAME, `!camera @${target}`);
  },
  cantjoin(client, target, message = null) {
    const SETTINGS = JSON.parse(fs.readFileSync("./SETTINGS.json"))

    var currentMode = SETTINGS.currentMode.replace('.on', '')
    currentMode = currentMode.replace('!', '')

    const responsesd = SETTINGS.main

    for (const key in responsesd) {
      console.log(key)
      console.log(currentMode)
      if (key == currentMode) {
        // client.say(CHANNEL_NAME, `${responsesd[key]} @${target}`);
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
      client.say(CHANNEL_NAME, `!link join using this link @${target}`);
    } else {
      client.say(CHANNEL_NAME, `tibbs joins are on, try refreshing the page or following his account @${target}`);
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
      client.say(CHANNEL_NAME, `!link join using this link @${target}`);
    } else if (currentMode == "1v1.on") {
      client.say(CHANNEL_NAME, `tibb is currently 1v1ing viewers in a private server, type 1v1 in chat to have a chance of being picked @${target}`);
    }
  },
  raid(client, target, message = null) {
    client.say(CHANNEL_NAME, `@${target}, no.`)
  },
  // picked(client, target, message=null) {
  //   client.say(CHANNEL_NAME, `!add @${target}`);
  // },
  recordingsoftware(client, target, message = null) {
    client.say(CHANNEL_NAME, `Tibb uses obs studio @${target}.`);
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
      client.say(CHANNEL_NAME, `This is a private server type !link to get the link to join @${target}`);
    } else if (currentMode == "!1v1.on") {
      client.say(CHANNEL_NAME, `tibb is currently 1v1ing viewers in his private server, type 1v1 in the chat to have a chance of being picked @${target}`);
    } else if (currentMode == "!ticket.on") {
      client.say(CHANNEL_NAME, `this is a private server type !ticket to learn how to join @${target}`);
    } else if (currentMode == "!join.on") {
      client.say(CHANNEL_NAME, `this is a public server type !join to join tibb @${target}`);
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
    const location = await ROBLOX_FUNCTIONS.getPresence(tibb12Id).then((r)=>{return r.lastLocation})
    var currentMode = SETTINGS.currentMode
    if (currentMode == "!1v1.on") {
      client.say(CHANNEL_NAME, `Hey, @${target} type 1v1 in the chat ONCE to have a chance to 1v1 tibb.`);
    } else {
      client.say(CHANNEL_NAME, `tibb is not currently doing 1v1s @${target}`);
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
      var exemption1 = findItem(emoteData, 'tibb12Howdy')
      emoteData.splice(exemption1, 1);

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
    client.say(CHANNEL_NAME, `@${target}, You can get rid of ads by subscribing to tibb12 by clicking the subscribe button or typing !prime`)
  },
  youtube(client, target, message = null) {
    client.say(CHANNEL_NAME, `!youtube @${target} click here to sub to tibb12 on youtube`)
  },
  crimid: async(client, target, message = null) => {
    const locationId = await ROBLOX_FUNCTIONS.getPresence(tibb12Id).then((r)=>{return r.placeId})

    if (locationId == '4588604953') {
      return client.say(
        CHANNEL_NAME,
        `@${target} tibb is not currently in a criminality server.`
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
    // client.say(CHANNEL_NAME, `@${target}, wait in the queue.`)
  },
  song(client, target, message = null) {
    client.say(
      CHANNEL_NAME,
      `!song @${target}`
    );
  }
};