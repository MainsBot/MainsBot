import * as ROBLOX_FUNCTIONS from "./roblox.js";
import * as TWITCH_FUNCTIONS from "./twitch.js";
import fs, { link } from 'fs'

const tibb12Id = 1576231486
import buddyList from 'spotify-buddylist'
import { client } from "tmi.js";
import { channel } from "diagnostics_channel";
import exp from "constants";

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

let SETTINGS = JSON.parse(fs.readFileSync("./SETTINGS.json"));

export const upTimeCommand = async (client, channel, message, self, userstate) => {}

export const robloxGameCommand = async (client, channel, message, self, userstate) => {
    SETTINGS = JSON.parse(fs.readFileSync("./SETTINGS.json"));

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


        if (currentMode.ks == "!gamble.on") {
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

export const robloxPlaytimeCommand = async (client, channel, message, self, userstate) => {
    SETTINGS = JSON.parse(fs.readFileSync("./SETTINGS.json"));

    const location = await ROBLOX_FUNCTIONS.getPresence(tibb12Id).then((r)=>{return r.lastLocation})
    const locationId = await ROBLOX_FUNCTIONS.getPresence(tibb12Id).then((r)=>{return r.placeId})
    const onlineStatus = await ROBLOX_FUNCTIONS.getLastOnline(tibb12Id).then((r)=>{return r.diffTimeMinutes})
    const playtime = await ROBLOX_FUNCTIONS.getLastOnline(tibb12Id).then((r)=>{return r.timeString})

    if (locationId == '4588604953') {
        return client.raw(`@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Tibb has been playing Criminality for ${playtime}.`)};
    if (locationId == '8343259840') {
        return client.raw(`@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Tibb has been playing Criminality for ${playtime}.`)};
    if (locationId == '292439477') {
        return client.raw(`@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Tibb has been playing Phantom Forces for ${playtime}.`)};
    if (locationId == '2317712696') {
        return client.raw(`@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Tibb has been playing The Wild West for ${playtime}.`)};
    if (locationId == '286090429') {
        return client.raw(`@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Tibb has been playing Arsenal for ${playtime}.`)};
    if (locationId == '8260276694') {
        return client.raw(`@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Tibb has been playing Ability Wars for ${playtime}.`)};
    if (locationId == '606849621') {
        return client.raw(`@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Tibb has been playing Jailbreak for ${playtime}.`)};
    if (locationId == '1962086868') {
        return client.raw(`@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Tibb has been playing Tower of Hell for ${playtime}.`)};
    if (locationId == '6808416928') {
        return client.raw(`@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Tibb has been playing Aimblox for ${playtime}.`)};
    if (locationId == '3527629287') {
        return client.raw(`@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Tibb has been playing Big Paintball for ${playtime}.`)};
    if (locationId == '2414851778') {
        return client.raw(`@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Tibb has been playing Dungeon Quest for ${playtime}.`)};
    if (locationId == '6403373529') {
        return client.raw(`@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Tibb has been playing Slap Battles for ${playtime}.`)};
    if (locationId == '3260590327') {
        return client.raw(`@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Tibb has been playing Tower Defense Simulator for ${playtime}.`)};
    if (locationId == '740581508') {
        return client.raw(`@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Tibb has been playing Entry Point for ${playtime}.`)};
    if (locationId == '5993942214') {
        return client.raw(`@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Tibb has been playing Rush Point for ${playtime}.`)};
    if (locationId == '4282985734') {
        return client.raw(`@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Tibb has been playing Combat Warriors for ${playtime}.`)};
    if (locationId == '734159876') {
        return client.raw(`@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Tibb has been playing SharkBite for ${playtime}.`)};
    if (locationId == '863266079') {
        return client.raw(`@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Tibb has been playing Apocalypse Rising 2 for ${playtime}.`)};
    if (locationId == '8054462345') {
        return client.raw(`@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Tibb has been playing Michael's Zombies for ${playtime}.`)};
    if (locationId == '738339342') {
        return client.raw(`@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Tibb has been playing Flood Escape 2 for ${playtime}.`)};
    if (locationId == '9049840490') {
        return client.raw(`@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Tibb has been playing Sonic Speed Simulator for ${playtime}.`)};
    if (locationId == '6284583030') {
        return client.raw(`@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Tibb has been playing Pet Simulator X for ${playtime}.`)};
    if (locationId == '142823291') {
        return client.raw(`@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Tibb has been playing Murder Mystery 2 for ${playtime}.`)};
    if (locationId == '4572253581') {
        return client.raw(`@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Tibb has been playing Murder for ${playtime}.`)};
    if (locationId == '185655149') {
        return client.raw(`@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Tibb has been playing Welcome to Bloxburg ${playtime}.`)};
    if (locationId == '2534724415') {
        return client.raw(`@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Tibb has been playing Emergency Response: Liberty County for ${playtime}.`)};
    if (locationId == '4468711919') {
        return client.raw(`@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Tibb has been playing Super Golf for ${playtime}.`)};
    if (locationId == '998374377') {
        return client.raw(`@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Tibb has been playing Super Nostalgia Zone for ${playtime}.`)};
    if (locationId == '4872321990') {
        return client.raw(`@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Tibb has been playing Islands for ${playtime}.`)};
    if (locationId == '4913331862') {
        return client.raw(`@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Tibb has been playing Recoil Zombies for ${playtime}.`)};
    if (locationId == '3233893879') {
        return client.raw(`@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Tibb has been playing Bad Business for ${playtime}.`)};
    if (locationId == '1224212277') {
        return client.raw(`@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Tibb has been playing Mad City for ${playtime}.`)};
    if (locationId == '6839171747') {
        return client.raw(`@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Tibb has been playing Doors for ${playtime}.`)};
    if (locationId == '6516141723') {
        return client.raw(`@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Tibb has been playing Doors for ${playtime}.`)};

    if (SETTINGS.currentMode == "!gamble.on") {
      return client.raw(
        `@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Tibb is playing RblxWild but sadly cant track playtime for this yet SadgeCry`
        );
    }
    if (onlineStatus > 30) {
      return client.raw(
        `@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Tibb is not playing anything right now.`
        );
    }
    if (location != 'Website') {
      client.raw(
        `@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Tibb has been playing ${location} for ${playtime}.`
        );
      return
    }
    return client.raw(
        `@client-nonce=${userstate['client-nonce']};reply-parent-msg-id=${userstate['id']} PRIVMSG #${CHANNEL_NAME} :Tibb is currently switching games.`
        );
}