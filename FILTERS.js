let chatArray = {}

const BOT_OAUTH = process.env.BOT_OAUTH// bot oauth token for performing actions
const COOKIE = process.env.COOKIE // <--- change this to your cookie

const BOT_NAME = process.env.BOT_NAME// bot username
const CHANNEL_NAME = process.env.CHANNEL_NAME// name of the channel for the bot to be in
const CHANNEL_ID = process.env.CHANNEL_ID // id of channel for the bot to be in
const BOT_ID = process.env.BOT_ID
const SPOTIFY_BOT_OAUTH = process.env.SPOTIFY_BOT_OAUTH
const SPOTIFY_BOT_NAME = process.env.SPOTIFY_BOT_NAME

const WAIT_REGISTER = process.env.WAIT_REGISTER// number of milliseconds, to wait before starting to get stream information

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

const SONG_TIMER = process.env.SONG_TIMER


import fs from "fs";
import stringSimilarity from "string-similarity";
import { setTimeout } from 'timers/promises';

let SETTINGS = JSON.parse(fs.readFileSync("./SETTINGS.json"));
let STREAMS = JSON.parse(fs.readFileSync("./STREAMS.json"));

import * as ROBLOX_FUNCTIONS from "./Functions/roblox.js";
import * as TWITCH_FUNCTIONS from "./Functions/twitch.js";

const exemptions = SETTINGS.filterExemptions;

var streamNumber = Object.keys(STREAMS).length;
const bots = SETTINGS.bots

export async function lengthFilter(client,message, twitchUsername) {
  //TO DO : make this work by twitch id instead of username
  if (!exemptions.includes(twitchUsername.toLowerCase()) && !bots.includes(twitchUsername.toLowerCase())) {
    let timeout_length = BASE_LENGTH_TIMEOUT;

    if (message.length > MAX_MESSAGE_LENGTH) {
      const repeatLengthOffenders =
        STREAMS[streamNumber]["repeatLengthOffenders"];

      if (repeatLengthOffenders != null) {
        if (repeatLengthOffenders[twitchUsername.toLowerCase()] != null) {
          timeout_length *= Math.pow(
            2,
            repeatLengthOffenders[twitchUsername.toLowerCase()]
          );
          if (timeout_length > MAX_LENGTH_TIMEOUT) {
            timeout_length = MAX_LENGTH_TIMEOUT;
          }
        }
        STREAMS[streamNumber]["repeatLengthOffenders"][
          twitchUsername.toLowerCase()
        ] += 1;
      } else {
        STREAMS[streamNumber]["repeatLengthOffenders"][
          twitchUsername.toLowerCase()
        ] = 1;
      }
      client.say(CHANNEL_NAME,`@${twitchUsername} Message is too long, exceeds max character limit. tibb12Cringe tibb12Pepeg tibb12Fall`)
      TWITCH_FUNCTIONS.timeoutUser(
        twitchUsername,
        "[AUTOMATIC] Message exceeds max character limit. -MainsBot",
        timeout_length
      );
      fs.writeFileSync("./STREAMS.json", JSON.stringify(STREAMS));
    }
  }
}

let timedOutUsers = []

async function handleTimeouts(timeout_length, twitchUsername) {
  await setTimeout(timeout_length * 1000)
  chatArray[twitchUsername.toLowerCase()][1] = false
}

export async function onUntimedOut(twitchUsername) {
  // for (const chatter in chatArray){
  //   if (chatter == twitchUsername.toLowerCase()){
  //     chatArray[chatter][1] = false
  //   }
  // }
}

export function spamFilter(client,message, twitchUsername) {
  if(bots.includes(twitchUsername.toLowerCase()))return
  // add user message to array
  if (chatArray[twitchUsername] == null) {
    chatArray[twitchUsername] = [
      [
        {
          message: message, time: new Date().getTime()
        }
      ],
      false
    ]
  } else {
    chatArray[twitchUsername][0].push({ message: message, time: new Date().getTime() })
  }

  // delete all messages that are older than 6 seconds for all users
  for (const key in chatArray) {
    chatArray[key][0].forEach(function (message2, index) {
      console.log((new Date().getTime() - chatArray[key][0][index].time))
      if ((new Date().getTime() - chatArray[key][0][index].time) > 5000) {
        var removed = chatArray[key][0].splice(index, 1)
        chatArray[key][0].splice(index, 1)
        console.log('deleted')
      }
    })

  }
  //check if need timeout

  if (chatArray[twitchUsername][1] == false && (chatArray[twitchUsername][0].length > MINIMUM_MESSAGE_COUNT)) {
    //check message similarity

    // let total = 0;

    // for (const key in chatArray) {
    //   chatArray[key][0].forEach(function (message, index) {
    //     chatArray[key][0].forEach(function (message2, index2) {
    //       var similarity = stringSimilarity.compareTwoStrings(message.message, message2.message)
    //       total += (similarity * 100)
    //     })
    //   })
    // }

    // const averageSimilarity = total / (Math.pow(chatArray[twitchUsername][0].length, 2))

    chatArray[twitchUsername][1] = true

    // if (averageSimilarity > MAXIMUM_SIMILARITY) {
      let timeout_length = BASE_SPAM_TIMEOUT

      const repeatOffenders = STREAMS[streamNumber]['repeatSpamOffenders']

      timeout_length = repeatOffenders[twitchUsername.toLowerCase()] != null ? BASE_LENGTH_TIMEOUT * Math.pow(2, repeatOffenders[twitchUsername.toLowerCase()]) : 5
      var timeoutMessage =  repeatOffenders[twitchUsername.toLowerCase()] != null ? `@${twitchUsername} Please STOP excessively spamming. tibb12Rage tibb12Fall tibb12Pepeg` : `@${twitchUsername}, please stop excessively spamming. tibb12Rage tibb12Fall tibb12Pepeg [warning]`
      if (timeout_length > MAX_SPAM_TIMEOUT) {
        timeout_length = MAX_SPAM_TIMEOUT
      }
      const isRepeatOffender = STREAMS[streamNumber]['repeatSpamOffenders'][twitchUsername.toLowerCase()] != null

      if (isRepeatOffender) {
        STREAMS[streamNumber]['repeatSpamOffenders'][twitchUsername.toLowerCase()] += 1
      } else {
        STREAMS[streamNumber]['repeatSpamOffenders'][twitchUsername.toLowerCase()] = 1
      }

      TWITCH_FUNCTIONS.timeoutEXP(twitchUsername, '[AUTOMATIC] Please stop excessively spamming. - MainsBot', timeout_length, function (result) {
        client.say(CHANNEL_NAME, `${timeoutMessage}`)
        chatArray[twitchUsername][1] = false
        fs.writeFileSync("./STREAMS.json", JSON.stringify(STREAMS));
      })

    // }
  }
  console.log(chatArray)
}