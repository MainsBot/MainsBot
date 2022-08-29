const BOT_OAUTH = process.env.BOT_OAUTH // bot oauth token for performing actions
const COOKIE = process.env.COOKIE // <--- change this to your cookie
const MAINSMONITOR_COOKIE = process.env.MAINSMONITOR_COOKIE

const BOT_NAME = process.env.BOT_NAME // bot username
const CHANNEL_NAME = process.env.CHANNEL_NAME // name of the channel for the bot to be in
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

const SONG_TIMER = process.env.SONG_TIMER

import fetch from 'node-fetch'
import fs from 'fs'
import {setTimeout} from 'timers/promises'

var priv_listener = false

export const getXcsrf = async (cookie) => {
    if(cookie == null){
        cookie = COOKIE
    }
  const response = await fetch("https://auth.roblox.com/v2/logout",{
      method: "POST",
      headers:{
          Cookie: `.ROBLOSECURITY=${COOKIE}`
      }
  })
  const csrfToken = await response.headers.get('x-csrf-token')
  return csrfToken
}

export function getXcsrfCB (cb) {
    const response = fetch("https://auth.roblox.com/v2/logout",{
        method: "POST",
        headers:{
            Cookie: `.ROBLOSECURITY=${COOKIE}`
        }
    }).then((r)=>{return r.headers.get('x-csrf-token')})

    cb(response)
  }

export function monitorGetXcsrfCB (cb) {
    const response = fetch("https://auth.roblox.com/v2/logout",{
        method: "POST",
        headers:{
            Cookie: `.ROBLOSECURITY=${MAINSMONITOR_COOKIE}`
        }
    }).then((r)=>{return r.headers.get('x-csrf-token')})

    cb(response)
}


export function formatNumber(number) {
    return number.toString().replace(/\B(?!\.\d*)(?=(\d{3})+(?!\d))/g, ",");
  }
export function timeToAgo(time){
    var fullWeeksAgo = Math.floor(time*(365/7))
    var fullDaysAgo = Math.floor(time*(365))
    var fullHoursAgo = Math.floor(time*(365*24))
    var fullMinutesAgo = Math.floor(time*(365*24*60))
    var fullSecondsAgo = Math.floor(time*(365*24*60*60))
    var fullMilliseconds = Math.floor(time*(365*24*60*60*1000))

    var yearsAgo = Math.floor(time)
    var monthsAgo = Math.floor((time-yearsAgo)*12)
    var weeksAgo = Math.floor((time-yearsAgo-(monthsAgo/12))*(365/7))
    var daysAgo = Math.floor((time-yearsAgo-(monthsAgo/12)-(weeksAgo/(365/7)))*365)
    var hoursAgo = Math.floor((time-yearsAgo-(monthsAgo/12)-(weeksAgo/(365/7))-(daysAgo/365))*365*24)
    var minutesAgo = Math.floor((time-yearsAgo-(monthsAgo/12)-(weeksAgo/(365/7))-(daysAgo/365)-(hoursAgo/(24*365)))*365*24*60)
    var secondsAgo = Math.floor((time-yearsAgo-(monthsAgo/12)-(weeksAgo/(365/7))-(daysAgo/365)-(hoursAgo/(24*365))-(minutesAgo/(60*24*365)))*365*24*60*60)

    var times = {
        yearsAgo:yearsAgo,
        monthsAgo:monthsAgo,
        weeksAgo:weeksAgo,
        daysAgo:daysAgo,
        hoursAgo:hoursAgo,
        minutesAgo:minutesAgo,
        secondsAgo:secondsAgo,
    }
    var formattedTimes = {
        yearsAgo:yearsAgo.toString()+' year',
        monthsAgo:monthsAgo.toString()+' month',
        weeksAgo:weeksAgo.toString()+' week',
        daysAgo:daysAgo.toString()+' day',
        hoursAgo:hoursAgo.toString()+' hour',
        minutesAgo:minutesAgo.toString()+' minute',
        secondsAgo:secondsAgo.toString()+' second',
    }

    var fullTimes = {
        fullWeeksAgo:fullWeeksAgo,
        fullDaysAgo:fullDaysAgo,
        fullHoursAgo:fullHoursAgo,
        fullMinutesAgo:fullMinutesAgo,
        fullSecondsAgo:fullSecondsAgo,
        fullMilliseconds:fullMilliseconds,
    }

    var timeString = ''

    for (const time in formattedTimes){
        var number = formattedTimes[time].replace(/[^0-9]+/g, "").split(' ').join('')

        if (number > 999){
            formattedTimes[time] = formatNumber(number)
        }
        if (number > 1){
            formattedTimes[time] = formattedTimes[time] + 's'
        }

        if (number != 0){
            timeString = timeString.concat(formattedTimes[time]+ ' ')
        }
    }

    return{
        times:times,
        fullTimes:fullTimes,
        formattedTimes:formattedTimes,
        timeString:timeString
    }

}
export const getUniverseIdFromPlaceId = async (placeId) => {
   try{
        var r = await fetch(`https://api.roblox.com/universes/get-universe-containing-place?placeid=${placeId}`,{"headers": {"Accept": "*/*",},"method": "GET",})
        var d = await r.json()
        return d.UniverseId
   }catch(err){
       console.log("Error caught")
   }
};
export const getServerData = async (placeId) => {
    let r = await fetch(`https://games.roblox.com/v1/games/${placeId}/servers/Public?limit=100&cursor=`)
    let d = await r.json()

    var nextCursor = ''

    var maxPlayers = d.data[0].maxPlayers
    
    var filteredData = []

    var rawPlayerTokens = []
    var rawServerIds = []

    var fullServerIds = []
    var emptyServerIds = []

    var pingServerIds = []

    const setEmptyServerIds = async (server) => {
        if (server.playing == 0){
            emptyServerIds.push(server.id)
        }
    }

    const setFullServerIds = async (server) => {
        if (server.playing == server.maxPlayers){
            fullServerIds.push(server.id)
        }
    }

    const setPingServerIds = async (server) => {
        pingServerIds.push({serverId: server.id, ping: server.ping})
        pingServerIds = pingServerIds.sort((a, b) => a.ping - b.ping)
    }

    var server = d.data

    for (let i = 0; i < server.length; i++) {
        setEmptyServerIds(server[i])
        setFullServerIds(server[i])
        setPingServerIds(server[i])
        rawPlayerTokens = rawPlayerTokens.concat(server[i].playerTokens)
        rawServerIds.push(server[i].id)
        filteredData = filteredData.concat(server[i])
    }

    if (d.nextPageCursor == undefined && d.previousPageCursor == undefined){
    }else if (d.nextPageCursor == undefined){
        nextCursor = d.previousPageCursor
    }else if (d.previousPageCursor == undefined){
        nextCursor = d.nextPageCursor
    }
    
    while (true ){ 
        r = await fetch(`https://games.roblox.com/v1/games/${placeId}/servers/Public?limit=100&cursor=`)
        d = await r.json()
        
        if (d.nextPageCursor == undefined && d.previousPageCursor == undefined){
            break
        }else if (d.nextPageCursor == undefined){
            nextCursor = d.previousPageCursor
        }else if (d.previousPageCursor == undefined){
            nextCursor = d.nextPageCursor
        }

        for (let i = 0; i < server.length; i++) {
            setEmptyServerIds(server[i])
            setFullServerIds(server[i])
            setPingServerIds(server[i])
            rawPlayerTokens = rawPlayerTokens.concat(server[i].playerTokens)
            rawServerIds.push(server[i].id)
            filteredData = filteredData.concat(server[i])
        }
    }

    return{
        maxPlayers: maxPlayers,
        emptyServers: emptyServerIds,
        fullServers: fullServerIds,
        rawPlayerTokens: rawPlayerTokens,
        rawServerIds: rawServerIds,
        serversByPing: pingServerIds,
        data: filteredData
    }
}


export function getServerDataCB (placeId,cb) {
    fetch(`https://games.roblox.com/v1/games/${placeId}/servers/Public?limit=100&cursor=`)
    .then((r)=>{return r.json()})
    .then((d)=>{
        var nextCursor = ''

        var maxPlayers = d.data[0].maxPlayers
        
        var filteredData = []
    
        var rawPlayerTokens = []
        var rawServerIds = []
    
        var fullServerIds = []
        var emptyServerIds = []
    
        var pingServerIds = []
    
        const setEmptyServerIds = async (server) => {
            if (server.playing == 0){
                emptyServerIds.push(server.id)
            }
        }
    
        const setFullServerIds = async (server) => {
            if (server.playing == server.maxPlayers){
                fullServerIds.push(server.id)
            }
        }
    
        const setPingServerIds = async (server) => {
            pingServerIds.push({serverId: server.id, ping: server.ping})
            pingServerIds = pingServerIds.sort((a, b) => a.ping - b.ping)
        }
    
        var server = d.data
    
        for (let i = 0; i < server.length; i++) {
            setEmptyServerIds(server[i])
            setFullServerIds(server[i])
            setPingServerIds(server[i])
            rawPlayerTokens = rawPlayerTokens.concat(server[i].playerTokens)
            rawServerIds.push(server[i].id)
            filteredData = filteredData.concat(server[i])
        }
    
        if (d.nextPageCursor == undefined && d.previousPageCursor == undefined){
        }else if (d.nextPageCursor == undefined){
            nextCursor = d.previousPageCursor
        }else if (d.previousPageCursor == undefined){
            nextCursor = d.nextPageCursor
        }
        let temps = true
        while (temps){ 
            fetch(`https://games.roblox.com/v1/games/${placeId}/servers/Public?limit=100&cursor=`)
            .then((r)=>{return r.json()})
            .then((d)=>{  

                if (d.nextPageCursor == undefined && d.previousPageCursor == undefined){
                    temps = false
                }else if (d.nextPageCursor == undefined){
                    nextCursor = d.previousPageCursor
                }else if (d.previousPageCursor == undefined){
                    nextCursor = d.nextPageCursor
                }
        
                for (let i = 0; i < server.length; i++) {
                    setEmptyServerIds(server[i])
                    setFullServerIds(server[i])
                    setPingServerIds(server[i])
                    rawPlayerTokens = rawPlayerTokens.concat(server[i].playerTokens)
                    rawServerIds.push(server[i].id)
                    filteredData = filteredData.concat(server[i])
                }

            })
        }
    
        cb({
            maxPlayers: maxPlayers,
            emptyServers: emptyServerIds,
            fullServers: fullServerIds,
            rawPlayerTokens: rawPlayerTokens,
            rawServerIds: rawServerIds,
            serversByPing: pingServerIds,
            data: filteredData
        })
    })
}


export const getEmptyServerIds = async (placeId) => {
    let r = await fetch(`https://games.roblox.com/v1/games/${placeId}/servers/Public?limit=100&cursor=`)
    let d = await r.json()

    var nextCursor = ''
    var emptyServerIds = []

    var server = d.data

    for (let i = 0; i < server.length; i++) {
        if (server[i].playing == 0){
            emptyServerIds.push(server[i].id)
        }
    }

    if (d.nextPageCursor == undefined && d.previousPageCursor == undefined){
    }else if (d.nextPageCursor == undefined){
        nextCursor = d.previousPageCursor
    }else if (d.previousPageCursor == undefined){
        nextCursor = d.nextPageCursor
    }
    
    while (true ){ 
        r = await fetch(`https://games.roblox.com/v1/games/${placeId}/servers/Public?limit=100&cursor=`)
        d = await r.json()
        
        if (d.nextPageCursor == undefined && d.previousPageCursor == undefined){
            break
        }else if (d.nextPageCursor == undefined){
            nextCursor = d.previousPageCursor
        }else if (d.previousPageCursor == undefined){
            nextCursor = d.nextPageCursor
        }

        for (let i = 0; i < server.length; i++) {
            if (server[i].playing == 0){
                emptyServerIds.push(server[i].id)
            }
        }
    }
    return emptyServerIds
}
export const getFullServerIds = async (placeId) => {
    let r = await fetch(`https://games.roblox.com/v1/games/${placeId}/servers/Public?limit=100&cursor=`)
    let d = await r.json()

    var nextCursor = ''
    var fullServerIds = []

    var server = d.data

    for (let i = 0; i < server.length; i++) {
        if (server[i].playing == server[i].maxPlayers){
            fullServerIds.push(server[i].id)
        }
    }

    if (d.nextPageCursor == undefined && d.previousPageCursor == undefined){
    }else if (d.nextPageCursor == undefined){
        nextCursor = d.previousPageCursor
    }else if (d.previousPageCursor == undefined){
        nextCursor = d.nextPageCursor
    }
    
    while (true ){ 
        r = await fetch(`https://games.roblox.com/v1/games/${placeId}/servers/Public?limit=100&cursor=`)
        d = await r.json()
        
        if (d.nextPageCursor == undefined && d.previousPageCursor == undefined){
            break
        }else if (d.nextPageCursor == undefined){
            nextCursor = d.previousPageCursor
        }else if (d.previousPageCursor == undefined){
            nextCursor = d.nextPageCursor
        }

        for (let i = 0; i < server.length; i++) {
            if (server[i].playing == server[i].maxPlayers){
                fullServerIds.push(server[i].id)
            }
        }
    }
    return fullServerIds
}
export const getMaxPlayers = async (placeId) => {
    var r = await fetch(`https://games.roblox.com/v1/games/${placeId}/servers/Public?limit=100&cursor=`)
    var d = await r.json()
    var nextCursor = ''

    return d.data[0].maxPlayers
}
export const getServerIdsByPing = async (placeId) => {
    let r = await fetch(`https://games.roblox.com/v1/games/${placeId}/servers/Public?limit=100&cursor=`)
    let d = await r.json()

    var nextCursor = ''
    var pingServerIds = []

    var server = d.data

    for (let i = 0; i < server.length; i++) {
        pingServerIds.push({serverId: server[i].id, ping: server[i].ping})
        pingServerIds = pingServerIds.sort((a, b) => a.ping - b.ping)
    }

    if (d.nextPageCursor == undefined && d.previousPageCursor == undefined){
    }else if (d.nextPageCursor == undefined){
        nextCursor = d.previousPageCursor
    }else if (d.previousPageCursor == undefined){
        nextCursor = d.nextPageCursor
    }
    
    while (true ){ 
        r = await fetch(`https://games.roblox.com/v1/games/${placeId}/servers/Public?limit=100&cursor=`)
        d = await r.json()
        
        if (d.nextPageCursor == undefined && d.previousPageCursor == undefined){
            break
        }else if (d.nextPageCursor == undefined){
            nextCursor = d.previousPageCursor
        }else if (d.previousPageCursor == undefined){
            nextCursor = d.nextPageCursor
        }

        for (let i = 0; i < server.length; i++) {
            pingServerIds.push({serverId: server[i].id, ping: server[i].ping})
            pingServerIds = pingServerIds.sort((a, b) => a.ping - b.ping)
        }
    }
    return pingServerIds
}
export const getRawPlayerTokensFromAllServers = async (placeId) => {
    // Player count of public servers only
    let d = await getServerData(placeId,'')

    var rawPlayerTokens = [];
    var nextCursor = ''

    var server = d.data

    for (let i = 0; i < server.length; i++) {
        rawPlayerTokens = rawPlayerTokens.concat(server[i].playerTokens)
    }

    if (d.nextPageCursor == undefined && d.previousPageCursor == undefined){
    }else if (d.nextPageCursor == undefined){
        nextCursor = d.previousPageCursor
    }else if (d.previousPageCursor == undefined){
        nextCursor = d.nextPageCursor
    }
    
    while (true ){ 
        d = await getServerData(placeId,nextCursor)
        
        if (d.nextPageCursor == undefined && d.previousPageCursor == undefined){
            break
        }else if (d.nextPageCursor == undefined){
            nextCursor = d.previousPageCursor
        }else if (d.previousPageCursor == undefined){
            nextCursor = d.nextPageCursor
        }
        
        for (let i = 0; i < server[i].length; i++) {
            rawPlayerTokens = rawPlayerTokens.concat(server[i].playerTokens)
        }
    }
    return rawPlayerTokens
}
export const getRawServerIdsFromAllServers = async (placeId) => {
    let d = await getServerData(placeId,'')

    var nextCursor = ''
    var rawServerIds = []
    
    var server = d.data

    for (let i = 0; i < server.length; i++) {
        rawServerIds.push(server[i].id)
    }

    if (d.nextPageCursor == undefined && d.previousPageCursor == undefined){
    }else if (d.nextPageCursor == undefined){
        nextCursor = d.previousPageCursor
    }else if (d.previousPageCursor == undefined){
        nextCursor = d.nextPageCursor
    }
    
    while (true ){ 
        d = await getServerData(placeId,nextCursor)
        
        if (d.nextPageCursor == undefined && d.previousPageCursor == undefined){
            break
        }else if (d.nextPageCursor == undefined){
            nextCursor = d.previousPageCursor
        }else if (d.previousPageCursor == undefined){
            nextCursor = d.nextPageCursor
        }

        for (let i = 0; i < server.length; i++) {
            console.log(server[i].id)
            rawServerIds.push(server[i].id)
        }
    }

    return rawServerIds
}
export const getRobloxFriends = async (userId) => {
    var r = await fetch(`https://friends.roblox.com/v1/users/${userId}/friends`)
    var d = await r.json()

    var usernames = []
    var userIds = []
    var dataByUsername = {}

    var friends = d.data

    for (let i = 0; i < friends.length; i++) {
        usernames.push(friends[i].name)
        userIds.push(friends[i].id)
        dataByUsername[friends[i].name] = {id : friends[i].id, name : friends[i].name, created : friends[i].created, isBanned: friends[i].isBanned,displayName: friends[i].displayName}
    }


    return {
        usernames: usernames,
        userIds: userIds,
        filteredData: dataByUsername,
        rawData: d.data
    }
}
export const getRobloxUserFromId = async (userId) => {
    var r = await fetch(`https://users.roblox.com/v1/users`,{method:'POST',headers:{"Content-Type": "application/json",Accept: "application/json"},body:`{"userIds": [${userId}],"excludeBannedUsers": false}`})
    var d = await r.json()

    var name = d.data[0].name
    var displayName = d.data[0].displayName

    return {
        username: name,
        displayName: displayName
    }
}
export const getRobloxIdFromUser = async (username) => {
    var r = await fetch(`https://users.roblox.com/v1/usernames/users`,{method:'POST',headers:{"Content-Type": "application/json",Accept: "application/json"},body:`{"usernames": ["${username}"],"excludeBannedUsers": false}`})
    var d = await r.json()

    var id = d.data[0].id

    return {
        userId: id
    }
}
export const getAvatarInfo = async (userId) => {
    var r = await fetch(`https://avatar.roblox.com/v1/users/${userId}/avatar`)
    var d = await r.json()
    
    var scales = d.scales
    var playerAvatarType = d.playerAvatarType
    var bodyColors = d.bodyColors
    var assets = d.assets
    var emotes = d.emotes
    
    return{
        scales:scales,
        playerAvatarType:playerAvatarType,
        bodyColors:bodyColors,
        assets:assets,
        emotes:emotes
    }
}
export const getUserOutfits = async (userId) => {
    var r = await fetch(`https://avatar.roblox.com/v1/users/${userId}/outfits?page=1&itemsPerPage=1000&isEditable=true`)
    var d = await r.json()
    
    var total = d.total
    var outfits = d.data
    var outfitNames = []
    var outfitIds = []

    for (let i = 0; i < outfits.length; i++) {
        outfitNames.push(outfits[i].name)
        outfitIds.push(outfits[i].id)
    }

    return{
        total:total,
        outfits:outfits,
        outfitNames:outfitNames,
        outfitIds:outfitIds
    }
}
export const getOutfitDetails = async (outfitId) => {
    var r = await fetch(`https://avatar.roblox.com/v1/outfits/${outfitId}/details`)
    var d = await r.json()

    var outfitName = d.name
    var assets = d.assets
    var assetIds = []
    var assetNames = []

    for (let i = 0; i < assets.length; i++) {
        assetIds.push(assets[i].id)
        assetNames.push(assets[i].name)
    }

    return{
        outfitName:outfitName,
        assets:assets,
        assetIds:assetIds,
        assetNames:assetNames
    }

}
export const getCurrentlyWearing = async (userId) => {
    var r = await fetch(`https://avatar.roblox.com/v1/users/${userId}/currently-wearing`)
    var d = await r.json()

    var assetIds = d.assetIds

    return assetIds
}

const SCHIS_COOKIE = '_|WARNING:-DO-NOT-SHARE-THIS.--Sharing-this-will-allow-someone-to-log-in-as-you-and-to-steal-your-ROBUX-and-items.|_AEB2BF8DC8B7DF7AE266AF13E2A753CF6EB58FB9D0E2873563FE30391252869C5358CABAB028E72CF24A67C74C898406FD0703ED4AAD60AB009EC9FB5A53BD7927C93240AD5196016311D233C3B7332A8224AA748F473B3FADB6DC69CEC43ABF5CFDA44EA42CD381E6DFCEBC3A5834B8742372CEFE61589703F3F54682358EE7F6612581CC0C59B8315DDED0EA2914608ED7C3C769C9D1921F5104FCCA574BF8307C6D7C0C3EF06C792A6772EC0F3A79DE7BAB46F4BBFB8FD54A536706BFDCE901D84B77460F4FF5CEA22B0EEEBC19192F4A9BBD6CBF62B154045410AE936E17AFEFAECECDA03431D2D48F725C0E4AF0E4FC114A6AEFBB1BAD202F773AC8C546BB7281310A39451175792E2CE9D180EF6E8D85635AF249009D29938DEABA169296FF4C1ED6E89ED3F7A09C994771B08A1413B359905829B3BD9C526D9AD46D90E9D4B45A28070786B203B98638069DA50DDA277E36FB66A5DB81272CC5BC871B3EB569370D8D566457059D2B0CE6A6FDF647B1B4EEAD437D32FE9F90DFED3BAF75FE340C'

export const getPresence = async (userId) => {

  var r = await fetch(`https://presence.roblox.com/v1/presence/users`,{method:'POST',headers:{"Content-Type": "application/json", cookie: `.ROBLOSECURITY=${COOKIE}`, "X-CSRF-TOKEN":  await getXcsrf(COOKIE)},body:`{"userIds": [${userId}]}`})
  var d = await r.json()

  var userPresences = d.userPresences[0]

  //2 = playing
  //1 = online
  //0 = offline
  
  var userPresenceType = userPresences.userPresenceType
  var lastLocation = userPresences.lastLocation
  var placeId = userPresences.placeId
  var universeId = userPresences.universeId

  return{
      userPresenceType,
      lastLocation,
      placeId,
      universeId
  }
}

export function getPresenceSync (userId,cb) {

    fetch(`https://presence.roblox.com/v1/presence/users`,{method:'POST',headers:{"Content-Type": "application/json", cookie: `.ROBLOSECURITY=${COOKIE}`, "X-CSRF-TOKEN": getXcsrfCB(function(result){return result})},body:`{"userIds": [${userId}]}`})
    .then((r)=>{
        return r.json()
    })
    .then((d)=>{
        var userPresences = d.userPresences[0]
      
        //2 = playing
        //1 = online
        //0 = offline
        
        var userPresenceType = userPresences.userPresenceType
        var lastLocation = userPresences.lastLocation
        var placeId = userPresences.placeId
        var universeId = userPresences.universeId

        cb({
            userPresenceType,
            lastLocation,
            placeId,
            universeId
        })
    })
    
  }


  export const monitorGetPresence = async (userId) => {

    var r = await fetch(`https://presence.roblox.com/v1/presence/users`,{method:'POST',headers:{"Content-Type": "application/json", cookie: `.ROBLOSECURITY=${MAINSMONITOR_COOKIE}`, "X-CSRF-TOKEN":  await getXcsrf(MAINSMONITOR_COOKIE)},body:`{"userIds": [${userId}]}`})
    var d = await r.json()
  
    var userPresences = d.userPresences[0]
  
    //2 = playing
    //1 = online
    //0 = offline
    
    var userPresenceType = userPresences.userPresenceType
    var lastLocation = userPresences.lastLocation
    var placeId = userPresences.placeId
    var universeId = userPresences.universeId
  
    return{
        userPresenceType,
        lastLocation,
        placeId,
        universeId
    }
  }
  
  export function monitorGetPresenceSync (userId,cb) {
  
      fetch(`https://presence.roblox.com/v1/presence/users`,{method:'POST',headers:{"Content-Type": "application/json", cookie: `.ROBLOSECURITY=${MAINSMONITOR_COOKIE}`, "X-CSRF-TOKEN": monitorGetXcsrfCB(function(result){return result})},body:`{"userIds": [${userId}]}`})
      .then((r)=>{
          return r.json()
      })
      .then((d)=>{
          var userPresences = d.userPresences[0]
        
          //2 = playing
          //1 = online
          //0 = offline
          
          var userPresenceType = userPresences.userPresenceType
          var lastLocation = userPresences.lastLocation
          var placeId = userPresences.placeId
          var universeId = userPresences.universeId

          cb({
              userPresenceType,
              lastLocation,
              placeId,
              universeId
          })
      })
      
    }

    
export const getLastOnline = async (userId) => {
    // TO DO: if someone is in game it doesnt register last online as 0 seconds or takes a while to do so, so check if they are playing a game, if so then return 0
    var r = await fetch(`https://api.roblox.com/users/${userId}/onlinestatus/`)
    var d = await r.json()

    var date = new Date (new Date().toISOString()).getTime()

    var lastOnline = new Date(new Date(d.LastOnline).toISOString()).getTime()
    
    var diffTime = Math.abs(date-lastOnline)/(1000*60*60*24*365)
    var diffTimeMinutes = Math.abs(date-lastOnline)/(1000*60)

    var timeString = timeToAgo(diffTime).timeString

    return {
        timeString,
        diffTimeMinutes
    }
}
export const getPreviousUsernames = async (userId) => {
    var r = await fetch(`https://users.roblox.com/v1/users/${userId}/username-history?limit=100&sortOrder=Asc`)
    var d = await r.json()

    var usernames = d.data
    var usernamesList = []

    for (let i = 0; i < usernames.length; i++) {
        if (!usernamesList.includes(usernames[i].name)){
            usernamesList.push(usernames[i].name)
        }
    }
    
    return usernamesList
}

export const getCostOfCurrentlyWearing = async (assetIds) => {
    var items = []
    var totalCost = 0
    var bundles = []
    var index = 0

    for (let i = 0; i < assetIds.length; i++) {
        items.push({"itemType":"Asset","id":assetIds[i]})
    }
    
    var assetDetails = await fetch(`https://catalog.roblox.com/v1/catalog/items/details`,{method:'POST',headers:{"Content-Type": "application/json",Accept: "application/json",cookie:`.ROBLOSECURITY=${COOKIE}`,"x-csrf-token":await getXcsrf()},body:`{"items": ${JSON.stringify(items)}}`})
    var d = await assetDetails.json()

    while (d.data[index] != undefined){
        var data = d.data[index]
        if (data.creatorName == "Roblox" && (data.price != undefined || data.lowestPrice != undefined)){
            if (data.price != undefined){
                totalCost += data.price
            }else if (data.lowestPrice != undefined){
                totalCost += data.lowestPrice
            }
        }
        if (data.priceStatus == "Offsale"){
            var r = await fetch(`https://catalog.roblox.com/v1/assets/${data.id}/bundles?sortOrder=Asc&limit=100`)
            var e = await r.json()
            bundles.push(e.data[0].id)
        }
        index = index + 1
    }
    bundles = [...new Set(bundles)];
  
    index = 0

    while (bundles[index] != undefined){
        var r = await fetch(`https://catalog.roblox.com/v1/bundles/${bundles[index]}/details`)
        var e = await r.json()

        if(e.product.priceInRobux != null){
            totalCost += e.product.priceInRobux
        } 
        
        index = index + 1
    }

    return totalCost
}
export function getPlayersInPrivateServerSync(placeId,privateServerID,cb) {
    fetch(`https://games.roblox.com/v1/games/${placeId}/servers/VIP?cursor=`, {
    "headers": {
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "en-GB,en;q=0.5",
        cookie:`.ROBLOSECURITY=${COOKIE}`,
        "x-csrf-token": getXcsrfCB(function(result){return result})
    },
    "method": "GET"
    }).then((r)=>{
        return r.json()
    }).then((e)=>{
        var privateServers = e.data


        var players = []
    
        for (let i = 0; i < privateServers.length; i++) {
            if (privateServers[i].vipServerId == privateServerID){
                players = privateServers[i].players
            }
        }
    
        cb(players)
    })


}

export function getPlayersInPrivateServerAsync(placeId,privateServerID,cb) {
    // MAKE THIS ASYNC
    fetch(`https://games.roblox.com/v1/games/${placeId}/servers/VIP?cursor=`, {
    "headers": {
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "en-GB,en;q=0.5",
        cookie:`.ROBLOSECURITY=${COOKIE}`,
        "x-csrf-token": getXcsrfCB(function(result){return result})
    },
    "method": "GET"
    }).then((r)=>{
        return r.json()
    }).then((e)=>{
        var privateServers = e.data


        var players = []
    
        for (let i = 0; i < privateServers.length; i++) {
            if (privateServers[i].vipServerId == privateServerID){
                players = privateServers[i].players
            }
        }
    
        cb(players)
    })


}



export function monitorGetPlayersInPrivateServerSync(placeId,privateServerID,cb) {
    fetch(`https://games.roblox.com/v1/games/${placeId}/servers/VIP?cursor=`, {
    "headers": {
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "en-GB,en;q=0.5",
        cookie:`.ROBLOSECURITY=${MAINSMONITOR_COOKIE}`,
        "x-csrf-token": monitorGetXcsrfCB(function(result){return result})
    },
    "method": "GET"
    }).then((r)=>{
        return r.json()
    }).then((e)=>{
        var privateServers = e.data


        var playerNames = []
        
        // privateServers.forEach(function(vs){
        //     console.log(vs.players)
        // })
        console.log(JSON.stringify(privateServers,null,1))
        // for (let i = 0; i < privateServers.length; i++) {
        //     if (privateServers[i].vipServerId == privateServerID){
        //         var players = privateServers[i].players
        //         console.log(players)
        //         for (let playerIndex = 0; playerIndex < players.length; playerIndex++){
        //             const playerName = players[playerIndex].name
        //             playerNames.push(playerName)
        //             // if(playerNames.length == players.length){
        //             //     console.log(playerNames)
        //             //     cb(playerNames)
        //             // }
        //         }
        //     }
        // }
    })


}

export function monitorGetPlayersInPrivateServerAsync(placeId,privateServerID,cb) {
    // MAKE THIS ASYNC AND FOR MAINSMONITOR COOKIE
    fetch(`https://games.roblox.com/v1/games/${placeId}/servers/VIP?cursor=`, {
    "headers": {
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "en-GB,en;q=0.5",
        cookie:`.ROBLOSECURITY=${COOKIE}`,
        "x-csrf-token": getXcsrfCB(function(result){return result})
    },
    "method": "GET"
    }).then((r)=>{
        return r.json()
    }).then((e)=>{
        var privateServers = e.data


        var players = []
    
        for (let i = 0; i < privateServers.length; i++) {
            if (privateServers[i].vipServerId == privateServerID){
                players = privateServers[i].players
            }
        }
    
        cb(players)
    })


}


function toggleListener(val){
    priv_listener = val
}

export const basicPrivateServerListener = async(placeId,serverId) =>{
    let oldPlayers = await getPlayersInPrivateServer(placeId,serverId)
    let newPlayers = await getPlayersInPrivateServer(placeId,serverId)

    while (priv_listener){
        for (var i = 0, len = newPlayers.length; i < len; i++) {
            if (!oldPlayers.some(oldPlayer => oldPlayer.name == newPlayers[i].name)){
                console.log(`${newPlayers[i].name}, joined the game.`)
            }
        }

        for (var i = 0, len = oldPlayers.length; i < len; i++) {
            if (!newPlayers.some(newPlayer => newPlayer.name == oldPlayers[i].name)){
                console.log(`${oldPlayers[i].name}, left the game.`)
            }
        }

        oldPlayers = [...newPlayers]
        newPlayers = await getPlayersInPrivateServer(placeId,serverId)
        
        await setTimeout(1000)
    }
}


export const getPlayerAvatarToken = async(userId) =>{
    const r = await fetch(`https://www.roblox.com/headshot-thumbnail/image?userId=${userId}&width=48&height=48&format=png`, {
    "headers": {
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-GB,en;q=0.5",
    },
    "method": "GET"
    })

    const url = await r.url
    
    return url
}

export function getPrivateServersSync (placeId,cb){
    fetch(`https://games.roblox.com/v1/games/${placeId}/servers/VIP?sortOrder=Asc&limit=100`,{
        headers:{
            "Accept": "application/json, text/plain, */*",
            "Accept-Language": "en-GB,en;q=0.5",
            cookie:`.ROBLOSECURITY=${COOKIE}`,
            "x-csrf-token": getXcsrfCB(function(result){return result})
        },
        "method":"GET"
    }).then((r)=>{
        return r.json()
    }).then((e)=>{
        cb(e)
    })

    
}

export function monitorGetPrivateServersSync (placeId,cb){
    fetch(`https://games.roblox.com/v1/games/${placeId}/servers/VIP?sortOrder=Asc&limit=100`,{
        headers:{
            "Accept": "application/json, text/plain, */*",
            "Accept-Language": "en-GB,en;q=0.5",
            cookie:`.ROBLOSECURITY=${MAINSMONITOR_COOKIE}`,
            "x-csrf-token": monitorGetXcsrfCB(function(result){return result})
        },
        "method":"GET"
    }).then((r)=>{
        return r.json()
    }).then((e)=>{
        cb(e)
    })

    
}

export const sendFriendRequest = async (userId)=>{
    const r = await fetch(`https://friends.roblox.com/v1/users/${userId}/request-friendship`, {
    "headers": {
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "en-GB,en;q=0.5",
        cookie:`.ROBLOSECURITY=${COOKIE}`,
        "X-CSRF-TOKEN": await getXcsrf()
    },
    "method": "POST"
    });

    const json = await r.json()

    if (json.errors != null){
        if (json.errors[0].message.toLowerCase() == "the target user is already a friend."){
            return 'already'
        }else{
            return 'unknown error'
        }
    }

    console.log(json)

    return 'success'
}
export const getCurrentUserFriends = async(userId = 3562575828)=>{
    const r = await fetch ('https://friends.roblox.com/v1/users/3511204536/friends?userSort=Alphabetical',{
        "headers": {
            "Accept": "application/json, text/plain, */*",
            "Accept-Language": "en-GB,en;q=0.5",
            cookie:`.ROBLOSECURITY=${COOKIE}`,
            "X-CSRF-TOKEN": await getXcsrf()
        }
    })

    const json = await r.json()

    return json.data
}
export const isValidRobloxUser = async (username)=>{
    var r = await fetch(`https://users.roblox.com/v1/usernames/users`,{method:'POST',headers:{"Content-Type": "application/json",Accept: "application/json"},body:`{"usernames": ["${username}"],"excludeBannedUsers": false}`})
    var d = await r.json()

    if (d.data.length == 0)    return {
        isValidUser: false,
        userId: null
    }

    return {
        isValidUser: true,
        userId: d.data[0].id
    }
}
// module.exports(
//   {
//     basicPrivateServerListener,
//     toggleListener,
//     getPlayersInPrivateServer,
//     getCostOfCurrentlyWearing,
//     getPreviousUsernames,
//     getLastOnline,
//     getPresence,
//     getCurrentlyWearing,
//     getOutfitDetails,
//     getUserOutfits,
//     getAvatarInfo,
//     getRobloxIdFromUser,
//     getRobloxUserFromId,
//     getRobloxFriends,
//     getRawServerIdsFromAllServers,
//     getRawPlayerTokensFromAllServers,
//     getServerIdsByPing,
//     getMaxPlayers,
//     getFullServerIds,
//     getServerData,
//     getUniverseIdFromPlaceId,
//     timeToAgo,
//     getXcsrf,
//   }
// )
