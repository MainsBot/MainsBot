import fs from "fs";
import fetch from "node-fetch";

const BOT_OAUTH = process.env.BOT_OAUTH; // bot oauth token for performing actions
const COOKIE = process.env.COOKIE; // <--- change this to your cookie

const BOT_NAME = process.env.BOT_NAME; // bot username
const CHANNEL_NAME = process.env.CHANNEL_NAME; // name of the channel for the bot to be in
const CHANNEL_ID = process.env.CHANNEL_ID; // id of channel for the bot to be in
const BOT_ID = process.env.BOT_ID;
const SPOTIFY_BOT_OAUTH = process.env.SPOTIFY_BOT_OAUTH;
const SPOTIFY_BOT_NAME = process.env.SPOTIFY_BOT_NAME;
const TIBB_TOKEN = process.env.TIBB_TOKEN;

const WAIT_REGISTER = 5 * 60 * 1000; // number of milliseconds, to wait before starting to get stream information

const COOLDOWN = process.env.COOLDOWN; // number of milliseconds, cool down for replying to people
const MESSAGE_MEMORY = process.env.MESSAGE_MEMORY; // number of milliseconds, until bot forgots message for spam filter

const MAX_MESSAGE_LENGTH = process.env.MAX_MESSAGE_LENGTH; // max number of characters until timeout
const BASE_LENGTH_TIMEOUT = process.env.BASE_LENGTH_TIMEOUT; // base timeout for using too many characters
const MAX_LENGTH_TIMEOUT = process.env.MAX_LENGTH_TIMEOUT; // max timeout for using too many characters

const BASE_SPAM_TIMEOUT = process.env.BASE_SPAM_TIMEOUT; // base timeout for spam, this would be for first time offenders
const MAX_SPAM_TIMEOUT = process.env.MAX_SPAM_TIMEOUT; // max timeout for spam, this stops the timeout length doubling infinitely for repeat offenders

const MINIMUM_CHARACTERS = process.env.MINIMUM_CHARACTERS; // [NOT IMPLEMENTED RN] minimum message length for bot to log message
const MAXIMUM_SIMILARITY = process.env.MAXIMUM_SIMILARITY; // percentage similarity of spam for timeout to happen
const MINIMUM_MESSAGE_COUNT = process.env.MINIMUM_MESSAGE_COUNT; // minimum number of messages for spam filter to start punishing

const MAINS_BOT_CLIENT_ID = process.env.MAINS_BOT_CLIENT_ID;
const CHEEEZZ_BOT_CLIENT_ID = process.env.CHEEEZZ_BOT_CLIENT_ID;
const APP_ACCESS_TOKEN = process.env.APP_ACCESS_TOKEN;
// timers
const WAIT_UNTIL_FOC_OFF = process.env.WAIT_UNTIL_FOC_OFF; // 2 minutes
const WAIT_UNTIL_FOC_OFF_RAID = process.env.WAIT_UNTIL_FOC_OFF_RAID; // every 5 minutes
const SPAM_LINK = process.env.SPAM_LINK; // every 5 minutes
const JOIN_TIMER = process.env.JOIN_TIMER; // every 2 minutes
let MUTATED_JOIN_TIMER = 120000; // timer that uses the JOIN_TIMER to change the interval based on viewer count

const SONG_TIMER = process.env.SONG_TIMER;

import * as ROBLOX_FUNCTIONS from "./roblox.js";

export const getChatroomStatus = async () => {
  const r = await fetch("https://gql.twitch.tv/gql#origin=twilight", {
    headers: {
      "Client-Id": "kimne78kx3ncx6brgo4mv6wki5h1ko",
      Authorization: `OAuth ${BOT_OAUTH}`,
    },
    body: `[{\"operationName\":\"ChatRoomState\",\"variables\":{\"login\":\"${BOT_NAME}\"},\"extensions\":{\"persistedQuery\":{\"version\":1,\"sha256Hash\":\"04cc4f104a120ea0d9f9d69be8791233f2188adf944406783f0c3a3e71aff8d2\"}}}]`,
    method: "POST",
  });
  const json = r.json();
  const states = json.then((json) => {
    return json.channel;
  });
};

export const isLive = async () => {
  const r = await fetch("https://gql.twitch.tv/gql", {
    headers: {
      authorization: `OAuth ${BOT_OAUTH}`,
      "client-id": "kimne78kx3ncx6brgo4mv6wki5h1ko",
    },
    body: `[{"operationName":"VideoPlayerStreamInfoOverlayChannel","variables":{"channel":"tibb12"},"extensions":{"persistedQuery":{"version":1,"sha256Hash":"a5f2e34d626a9f4f5c0204f910bab2194948a9502089be558bb6e779a9e1b3d2"}}}]`,
    method: "POST",
  });

  const json = await r.json().then((d) => {
    return d[0].data.user.stream;
  });
  const isLive = (() => {
    if (json == null) {
      return false;
    } else if (json != null) {
      return true;
    }
  })();
  return isLive;
};

export const getTwitchUsernameFromUserId = async (userid) => {
  const r = await fetch(`https://api.twitch.tv/helix/users?id=${userid}`, {
    headers: {
      "Client-Id": "os2kmdts5tvcojd34pguyzsn3eyn5q",
      Authorization: "Bearer gt97qfd52py56hunxw5ycf5pmmzvnu",
    },
  });
  const json = await r.json().then((e) => {
    return e;
  });
  if (json.data.length != 0) {
    return json.data[0];
  }
  return false;
};

export const getTwitchIdFromUsername = async (username) => {
  const r = await fetch(`https://api.twitch.tv/helix/users?login=${username}`, {
    headers: {
      "Client-id": "os2kmdts5tvcojd34pguyzsn3eyn5q",
      Authorization: `Bearer gt97qfd52py56hunxw5ycf5pmmzvnu`,
    },
    method: "GET",
  });

  const id = await r.json().then((r) => {
    return r.data[0].id;
  });

  return id;
};

export const timeoutUser = async (target, reason = null, duration) => {
  if (reason != null) {
    reason = '"' + reason + '"';
  }
  const weeks = Math.floor(duration / (60 * 60 * 24 * 7));
  const days = Math.floor(
    (duration - weeks * 60 * 60 * 24 * 7) / (60 * 60 * 24)
  );
  const hours = Math.floor(
    (duration - weeks * 60 * 60 * 24 * 7 - days * 60 * 60 * 24) / (60 * 60)
  );
  const minutes = Math.floor(
    (duration -
      weeks * 60 * 60 * 24 * 7 -
      days * 60 * 60 * 24 -
      hours * 60 * 60) /
      60
  );
  const seconds = Math.floor(
    duration -
      weeks * 60 * 60 * 24 * 7 -
      days * 60 * 60 * 24 -
      hours * 60 * 60 -
      minutes * 60
  );

  const formatted = {
    weeks: [weeks, "w"],
    days: [days, "d"],
    hours: [hours, "h"],
    minutes: [minutes, "m"],
    seconds: [seconds, "s"],
  };
  var formattedDuration = "";

  for (const key in formatted) {
    if (formatted[key][0] == 0) {
      delete formatted[key];
    } else {
      formattedDuration += formatted[key][0] + formatted[key][1];
    }
  }

  const r = await fetch("https://gql.twitch.tv/gql#origin=twilight", {
    headers: {
      "Client-Id": "kimne78kx3ncx6brgo4mv6wki5h1ko",
      Authorization: `OAuth ${BOT_OAUTH}`,
    },
    body: `[{\"operationName\":\"Chat_BanUserFromChatRoom\",\"variables\":{\"input\":{\"channelID\":\"${CHANNEL_ID}\",\"bannedUserLogin\":\"${target}\",\"expiresIn\":\"${formattedDuration}\",\"reason\":${reason}}},\"extensions\":{\"persistedQuery\":{\"version\":1,\"sha256Hash\":\"d7be2d2e1e22813c1c2f3d9d5bf7e425d815aeb09e14001a5f2c140b93f6fb67\"}}}]`,
    method: "POST",
  });

  const isOk = await r.ok;

  return isOk;
};

export function timeoutEXP(target, reason = null, duration, cb) {
  if (reason != null) {
    reason = '"' + reason + '"';
  }
  const weeks = Math.floor(duration / (60 * 60 * 24 * 7));
  const days = Math.floor(
    (duration - weeks * 60 * 60 * 24 * 7) / (60 * 60 * 24)
  );
  const hours = Math.floor(
    (duration - weeks * 60 * 60 * 24 * 7 - days * 60 * 60 * 24) / (60 * 60)
  );
  const minutes = Math.floor(
    (duration -
      weeks * 60 * 60 * 24 * 7 -
      days * 60 * 60 * 24 -
      hours * 60 * 60) /
      60
  );
  const seconds = Math.floor(
    duration -
      weeks * 60 * 60 * 24 * 7 -
      days * 60 * 60 * 24 -
      hours * 60 * 60 -
      minutes * 60
  );

  const formatted = {
    weeks: [weeks, "w"],
    days: [days, "d"],
    hours: [hours, "h"],
    minutes: [minutes, "m"],
    seconds: [seconds, "s"],
  };
  var formattedDuration = "";

  for (const key in formatted) {
    if (formatted[key][0] == 0) {
      delete formatted[key];
    } else {
      formattedDuration += formatted[key][0] + formatted[key][1];
    }
  }

  fetch("https://gql.twitch.tv/gql#origin=twilight", {
    headers: {
      "Client-Id": "kimne78kx3ncx6brgo4mv6wki5h1ko",
      Authorization: `OAuth ${BOT_OAUTH}`,
    },
    body: `[{\"operationName\":\"Chat_BanUserFromChatRoom\",\"variables\":{\"input\":{\"channelID\":\"${CHANNEL_ID}\",\"bannedUserLogin\":\"${target}\",\"expiresIn\":\"${formattedDuration}\",\"reason\":${reason}}},\"extensions\":{\"persistedQuery\":{\"version\":1,\"sha256Hash\":\"d7be2d2e1e22813c1c2f3d9d5bf7e425d815aeb09e14001a5f2c140b93f6fb67\"}}}]`,
    method: "POST",
  })
    .then((r) => {
      return r.json();
    })
    .then((json) => {
      cb(json[0].errors == null);
    });
}

const scuffedSystem = [];

export function scuffedTimeout(target, reason = null, duration, test = null) {
  if (test != null) {
    scuffedSystem.splice(scuffedSystem.indexOf(target), 1);
  } else if (scuffedSystem.includes(target) != null) {
    scuffedSystem.push(target);
    if (reason != null) {
      reason = '"' + reason + '"';
    }
    const weeks = Math.floor(duration / (60 * 60 * 24 * 7));
    const days = Math.floor(
      (duration - weeks * 60 * 60 * 24 * 7) / (60 * 60 * 24)
    );
    const hours = Math.floor(
      (duration - weeks * 60 * 60 * 24 * 7 - days * 60 * 60 * 24) / (60 * 60)
    );
    const minutes = Math.floor(
      (duration -
        weeks * 60 * 60 * 24 * 7 -
        days * 60 * 60 * 24 -
        hours * 60 * 60) /
        60
    );
    const seconds = Math.floor(
      duration -
        weeks * 60 * 60 * 24 * 7 -
        days * 60 * 60 * 24 -
        hours * 60 * 60 -
        minutes * 60
    );

    const formatted = {
      weeks: [weeks, "w"],
      days: [days, "d"],
      hours: [hours, "h"],
      minutes: [minutes, "m"],
      seconds: [seconds, "s"],
    };
    var formattedDuration = "";

    for (const key in formatted) {
      if (formatted[key][0] == 0) {
        delete formatted[key];
      } else {
        formattedDuration += formatted[key][0] + formatted[key][1];
      }
    }

    fetch("https://gql.twitch.tv/gql#origin=twilight", {
      headers: {
        "Client-Id": "kimne78kx3ncx6brgo4mv6wki5h1ko",
        Authorization: `OAuth ${BOT_OAUTH}`,
      },
      body: `[{\"operationName\":\"Chat_BanUserFromChatRoom\",\"variables\":{\"input\":{\"channelID\":\"${CHANNEL_ID}\",\"bannedUserLogin\":\"${target}\",\"expiresIn\":\"${formattedDuration}\",\"reason\":${reason}}},\"extensions\":{\"persistedQuery\":{\"version\":1,\"sha256Hash\":\"d7be2d2e1e22813c1c2f3d9d5bf7e425d815aeb09e14001a5f2c140b93f6fb67\"}}}]`,
      method: "POST",
    });
  }
}

export async function onMultiplayerAdStart() {
  var colours = ["BLUE", "PURPLE", "GREEN"];
  var randomColour = colours[Math.floor(Math.random() * colours.length)];

  fetch("https://gql.twitch.tv/gql", {
    headers: {
      authorization: `OAuth ${BOT_OAUTH}`,
      "client-id": "kimne78kx3ncx6brgo4mv6wki5h1ko",
    },
    body: `[{"operationName":"SendAnnouncementMessage","variables":{"input":{"channelID":"${CHANNEL_ID}","message":"VOTE IN THE MULTIPLAYER AD PogU EZY","color":"${randomColour}"}},"extensions":{"persistedQuery":{"version":1,"sha256Hash":"f9e37b572ceaca1475d8d50805ae64d6eb388faf758556b2719f44d64e5ba791"}}}]`,
    method: "POST",
  });
}

export async function makeAnnouncement(message) {
  var colours = ["BLUE", "PURPLE", "GREEN"];
  var randomColour = colours[Math.floor(Math.random() * colours.length)];

  fetch("https://gql.twitch.tv/gql", {
    headers: {
      authorization: `OAuth ${BOT_OAUTH}`,
      "client-id": "kimne78kx3ncx6brgo4mv6wki5h1ko",
    },
    body: `[{"operationName":"SendAnnouncementMessage","variables":{"input":{"channelID":"${CHANNEL_ID}","message":"${message}","color":"${randomColour}"}},"extensions":{"persistedQuery":{"version":1,"sha256Hash":"f9e37b572ceaca1475d8d50805ae64d6eb388faf758556b2719f44d64e5ba791"}}}]`,
    method: "POST",
  });
}

export const getCurrentPollId = async () => {
  let r = await fetch(
    `https://api.twitch.tv/helix/polls?broadcaster_id=${CHANNEL_ID}`,
    {
      headers: {
        "Client-Id": CHEEEZZ_BOT_CLIENT_ID,
        Authorization: "Bearer " + TIBB_TOKEN,
      },
    }
  );

  let json = await r.json().then((r) => {
    return r.data[0].id;
  });

  return json;
};

export async function deleteCurrentPoll() {
  const currentPollId = await getCurrentPollId();

  fetch("https://gql.twitch.tv/gql#origin=twilight", {
    headers: {
      "Client-Id": "kimne78kx3ncx6brgo4mv6wki5h1ko",
      Authorization: `OAuth ${BOT_OAUTH}`,
    },
    body: `[{\"operationName\":\"ArchivePoll\",\"variables\":{\"input\":{\"pollID\":\"${currentPollId}\"}},\"extensions\":{\"persistedQuery\":{\"version\":1,\"sha256Hash\":\"444ead3d68d94601cb66519e36c9f6c6fd9ba8b827a4299b8ed3604e57918d92\"}}}]`,
    method: "POST",
  });
}

export async function endCurrentPoll() {
  const currentPollId = await getCurrentPollId();

  fetch("https://gql.twitch.tv/gql#origin=twilight", {
    headers: {
      "Client-Id": "kimne78kx3ncx6brgo4mv6wki5h1ko",
      Authorization: `OAuth ${BOT_OAUTH}`,
    },
    body: `[{\"operationName\":\"TerminatePoll\",\"variables\":{\"input\":{\"pollID\":\"${currentPollId}\"}},\"extensions\":{\"persistedQuery\":{\"version\":1,\"sha256Hash\":\"2701ef0594dae5f532ce68e58cc3036a6d020755eef49927f98c14017fd819b2\"}}}]`,
    method: "POST",
  });
}

export async function onMultiplayerAdEnd(adData) {
  var RandomChants = [
    `+${adData.rewards[0].current_total * 0.01} BUCC EZY Clap`,
    `Thanks for voting in the multiplayer ad peepoLove +${
      adData.rewards[0].current_total * 0.01
    } BUCC PogU`,
    `TibbEZY +${adData.rewards[0].current_total * 0.01} cold hard us dollars.`,
    `EZY PogU +${adData.rewards[0].current_total} cents.`,
    `+${adData.rewards[0].current_total * 0.01 * 1.25} Canadian monies PogU`,
  ];
  var chantmessage =
    RandomChants[Math.floor(Math.random() * RandomChants.length)];
}

export const isFollowing = async (userId) => {
  const r = await fetch(
    `https://api.twitch.tv/helix/users/follows?from_id=${userId}&to_id=197407231`,
    {
      headers: {
        authorization: `Bearer ${APP_ACCESS_TOKEN}`,
        "client-id": "uc561ftzndbzse3u8pspb5kjxtid9v",
        "Content-Type": "application/json",
      },
    }
  );
  const json = await r.json();
  if (json.total == 0) {
    return false;
  }
  return true;
};

export const getFollowers = async (userId) => {
  let followers = [];
  let r = await fetch(
    `https://api.twitch.tv/helix/users/follows?to_id=${userId}&first=100`,
    {
      headers: {
        authorization: `Bearer ${APP_ACCESS_TOKEN}`,
        "client-id": "uc561ftzndbzse3u8pspb5kjxtid9v",
        "Content-Type": "application/json",
      },
    }
  );
  let json = await r.json();

  let cursor = json.pagination.cursor;

  while (cursor != null) {
    r = await fetch(
      `https://api.twitch.tv/helix/users/follows?to_id=${userId}&first=100&after=${cursor}`,
      {
        headers: {
          "Client-Id": CHEEEZZ_BOT_CLIENT_ID,
          Authorization: "Bearer " + TIBB_TOKEN,
        },
      }
    );

    json = await r.json();

    if (Object.keys(json.pagination).length != 0 && json.data.length != 0) {
      cursor = json.pagination.cursor;
      followers = followers.concat(json.data);
      console.log("working");
    } else {
      //fs.writeFileSync("./PREDICTIONDATA.json", JSON.stringify(allPredictions,null,2));
      console.log(followers.length);
      console.log(JSON.stringify(followers, null, 2));
      break;
    }
  }
  return followers;
};

export const followAge = async (userId) => {
  const r = await fetch(
    `https://api.twitch.tv/helix/users/follows?from_id=${userId}&to_id=197407231`,
    {
      headers: {
        authorization: `Bearer ${process.env.APP_ACCESS_TOKEN}`,
        "client-id": "uc561ftzndbzse3u8pspb5kjxtid9v",
        "Content-Type": "application/json",
      },
    }
  );
  const json = await r.json();
  if (json.total == 0) {
    return null;
  }
  const timeDifference =
    (new Date(new Date().toISOString()).getTime() -
      new Date(json.data[0].followed_at).getTime()) /
    (1000 * 60 * 60 * 24 * 365);

  const followAge = ROBLOX_FUNCTIONS.timeToAgo(timeDifference).timeString;

  return followAge;
};

export const getAppAccessToken = async () => {
  const r = await fetch(
    `https://id.twitch.tv/oauth2/token?client_id=${MAINS_BOT_CLIENT_ID}&client_secret=kz4bhtjutvhp0k1fptr0efr6f4zy9u&grant_type=client_credentials`,
    {
      method: "POST",
    }
  );
  const json = await r.json();
  return json;
};

export const getPredictionData = async () => {
  let allPredictions = [];

  let r = await fetch(
    `https://api.twitch.tv/helix/predictions?broadcaster_id=${CHANNEL_ID}`,
    {
      headers: {
        "Client-Id": CHEEEZZ_BOT_CLIENT_ID,
        Authorization: "Bearer " + TIBB_TOKEN,
      },
    }
  );

  let json = await r.json();

  let cursor = json.pagination.cursor;

  while (cursor != null) {
    r = await fetch(
      `https://api.twitch.tv/helix/predictions?broadcaster_id=${CHANNEL_ID}&after=${cursor}`,
      {
        headers: {
          "Client-Id": CHEEEZZ_BOT_CLIENT_ID,
          Authorization: "Bearer " + TIBB_TOKEN,
        },
      }
    );

    json = await r.json();

    if (Object.keys(json.pagination).length != 0 && json.data.length != 0) {
      cursor = json.pagination.cursor;
      allPredictions = allPredictions.concat(json.data);
    } else {
      fs.writeFileSync(
        "./PREDICTIONDATA.json",
        JSON.stringify(allPredictions, null, 2)
      );
      return allPredictions;
    }
  }

  // while (true){
  //   r = await fetch(`https://api.twitch.tv/helix/predictions?broadcaster_id=${CHANNEL_ID}&after=${cursor}`, {
  //     headers: {
  //       'Client-Id': CHEEEZZ_BOT_CLIENT_ID,
  //       'Authorization': 'Bearer '+TIBB_TOKEN
  //     },
  //   })

  //   json = await r.json()

  //   if (Object.keys(json.pagination).length != 0 && json.data.length != 0){
  //     cursor = json.pagination.cursor
  //     allPredictions = allPredictions.concat(json.data)
  //   }else{
  //     fs.writeFileSync("./PREDICTIONDATA.json", JSON.stringify(allPredictions,null,2));
  //     return allPredictions
  //   }
  // }
};
let POLLDATA = JSON.parse(fs.readFileSync("./POLLDATA.json"));

export const getLatestPollData = async () => {
  const r = await fetch("https://gql.twitch.tv/gql#origin=twilight", {
    headers: {
      "Client-Id": "kimne78kx3ncx6brgo4mv6wki5h1ko",
      Authorization: "OAuth " + BOT_OAUTH,
    },
    body: `[{\"operationName\":\"AdminPollsPage\",\"variables\":{\"login\":\"${CHANNEL_NAME}\"},\"extensions\":{\"persistedQuery\":{\"version\":1,\"sha256Hash\":\"58b2740296aad07f9b75fdf069f61a79b305f4d6b93c3764be533d76532b37fa\"}}}]`,
    method: "POST",
  });

  let json = await r.json();

  json = json[0].data.channel.latestPoll;

  const dataBreakdown = async (choiceId) => {
    let r = await fetch(`https://gql.twitch.tv/gql`, {
      headers: {
        "client-id": "kimne78kx3ncx6brgo4mv6wki5h1ko",
        authorization: "OAuth " + BOT_OAUTH,
      },
      body: `[{\"operationName\":\"ChoiceBreakdown\",\"variables\":{\"login\":\"tibb12\",\"choiceID\":\"${choiceId}\",\"sort\":\"CHANNEL_POINTS\",\"id\":\"123\"},\"extensions\":{\"persistedQuery\":{\"version\":1,\"sha256Hash\":\"7451688887b68798527dbaa222b4408e456adf5283063bfae8f02db2289deee0\"}}}]`,
      method: "POST",
    });

    let json = await r.json();

    json = json[0].data.channel;

    return json;
  };

  const choices = json.choices;
  const archives = json.status;
  const title = json.title;
  const id = json.id;
  const duration = json.durationSeconds;
  const startedAt = json.startedAt;
  const endedAt = json.endedAt;
  const totalCp = json.tokens.communityPoints;
  const totalBits = json.tokens.bits;
  const totalVoters = json.totalVoters;
  const totalVotes = json.votes.total;

  const settings = json.settings;

  const bitVoteEnabled = settings.bitsVotes.isEnabled;

  const bitVoteCost = settings.bitsVotes.cost;

  const cpVoteEnabled = settings.communityPointsVotes.isEnabled;
  const cpVoteCost = settings.communityPointsVotes.cost;

  const multiChoiceEnabled = settings.multichoice.isEnabled;

  const dataArray = {};

  dataArray["id"] = id;
  dataArray["status"] = archives;
  dataArray["totalCp"] = totalCp;
  dataArray["duration"] = duration;
  dataArray["startedAt"] = startedAt;
  dataArray["endedAt"] = endedAt;
  dataArray["title"] = title;
  dataArray["totalBits"] = totalBits;
  dataArray["totalVoters"] = totalVoters;
  dataArray["totalVotes"] = totalVotes;
  dataArray["boughtVotes"] = totalVotes - totalVoters;
  dataArray["cpVote"] = cpVoteCost;
  dataArray["bitVote"] = bitVoteCost;
  dataArray["cpVoteEnabled"] = cpVoteEnabled;
  dataArray["bitVoteEnabled"] = bitVoteEnabled;
  dataArray["choices"] = choices;
  dataArray["multichoice"] = multiChoiceEnabled;
  dataArray["userNodes"] = [];
  // console.log(choices)
  


  for (let i = 0; i < choices.length; i++) {
    const choice = choices[i];
    const choiceId = choice.id;

    const data = await dataBreakdown(choiceId);
    
    if(data.latestPoll.choice.voters == null) return 'error'
    
    const voters = data.latestPoll.choice.voters.nodes;

    if (voters.length != 0) {
      dataArray["userNodes"].push(voters[0].node);
    }
  }
  POLLDATA[id] = dataArray;
  fs.writeFileSync("./POLLDATA.json", JSON.stringify(POLLDATA, null, 1));
  POLLDATA = JSON.parse(fs.readFileSync("./POLLDATA.json"));
  return dataArray;
};

export const getPollData = async () => {
  let allPolls = []

  const dataBreakdown = async (choiceId) => {
    let r = await fetch(`https://gql.twitch.tv/gql`, {
      headers: {
        'client-id': 'kimne78kx3ncx6brgo4mv6wki5h1ko',
        'authorization': 'OAuth '+BOT_OAUTH
      },
     body: `[{\"operationName\":\"ChoiceBreakdown\",\"variables\":{\"login\":\"tibb12\",\"choiceID\":\"${choiceId}\",\"sort\":\"CHANNEL_POINTS\",\"id\":\"123\"},\"extensions\":{\"persistedQuery\":{\"version\":1,\"sha256Hash\":\"7451688887b68798527dbaa222b4408e456adf5283063bfae8f02db2289deee0\"}}}]`,
      method: 'POST'
    })

    let json = await r.json()

    json = json[0].data.channel

    console.log(json)

    return json

  }

  let r = await fetch(`https://api.twitch.tv/helix/polls?broadcaster_id=${CHANNEL_ID}`, {
    headers: {
      'Client-Id': CHEEEZZ_BOT_CLIENT_ID,
      'Authorization': 'Bearer '+TIBB_TOKEN
    },
  })

  let json = await r.json()

  let data = json.data

  data.forEach(async function(poll){
    const pollId = poll.id
    const choices = poll.choices
    const title = poll.title

    const bits_per_vote = poll.bits_per_vote
    const channel_points_voting_enabled = poll.channel_points_voting_enabled
    const channel_points_per_vote = poll.channel_points_per_vote

    const duration = poll .duration

    choices.forEach(async function(choice){
      const choiceId = choice.id

      if (choice.votes == 0){
        return
      }

      const data = await dataBreakdown(choiceId)
    })

  })

  let cursor = json.pagination.cursor

  while (cursor != null) {
    r = await fetch(`https://api.twitch.tv/helix/polls?broadcaster_id=${CHANNEL_ID}&after=${cursor}`, {
      headers: {
        'Client-Id': CHEEEZZ_BOT_CLIENT_ID,
        'Authorization': 'Bearer '+TIBB_TOKEN
      },
    })

    json = await r.json()
    if (Object.keys(json.pagination).length != 0 && json.data.length != 0){
      cursor = json.pagination.cursor
      allPolls = allPolls.concat(json.data)
    }else{
      cursor = null
      fs.writeFileSync("./POLLDATA.json", JSON.stringify(allPolls,null,2));
      return allPolls
    }

  }

}

export const getSubStatus = async (userId) => {
  const r = await fetch(
    `https://api.twitch.tv/helix/subscriptions?broadcaster_id=${CHANNEL_ID}&user_id=${userId}`,
    {
      headers: {
        Authorization: "Bearer " + TIBB_TOKEN,
        "Client-Id": CHEEEZZ_BOT_CLIENT_ID,
      },
    }
  );

  const json = await r.json();

  return json;
};

export const getChannelEmotes = async () => {
  const r = await fetch(
    `https://api.twitch.tv/helix/chat/emotes?broadcaster_id=${CHANNEL_ID}`,
    {
      headers: {
        Authorization: "Bearer " + TIBB_TOKEN,
        "Client-Id": CHEEEZZ_BOT_CLIENT_ID,
      },
    }
  );

  const json = await r.json();

  return json;
};

export const pauseTicketRedemption = async (bool) => {
  try {
    const r = await fetch("https://gql.twitch.tv/gql#origin=twilight", {
      headers: {
        "Client-Id": "kimne78kx3ncx6brgo4mv6wki5h1ko",
        Authorization: `OAuth ${BOT_OAUTH}`,
      },
      body: `[{\"operationName\":\"PauseCustomRewardRedemptions\",\"variables\":{\"input\":{\"channelID\":\"${CHANNEL_ID}\",\"rewardID\":\"b9c9dca5-7488-4169-83a8-83cf577325e4\",\"isPaused\":${bool}}},\"extensions\":{\"persistedQuery\":{\"version\":1,\"sha256Hash\":\"0cf84624f984ef052db18bedb2e034a5c1017dda9d065bb0f6978c3128fa9b99\"}}}]`,
      method: "POST",
    });

    return await r.ok;
  } catch (e) {
    return false;
  }
};

export const doesLinkExist = async () => {
  const r = await fetch("https://api.nightbot.tv/1/commands", {
    headers: {
      "Nightbot-Channel": "5b7e71960287f64708af75bb",
    },
  });

  const json = await r.json();
  const commands = json.commands;
  console.log(commands.length);
  for (let i = 0; i < commands.length; i++) {
    const command = commands[i];
    console.log(command.name);
    // console.log(command)
    if (command.name.toLowerCase() == "!link") {
      return true;
    }
  }

  return false;
};

export const changeTitle = async (newTitle) => {
  fetch("https://gql.twitch.tv/gql", {
    headers: {
      authorization: "OAuth 7x8gw340wqhv0lm6grgv2hcfr3luu8",
      "client-id": "kimne78kx3ncx6brgo4mv6wki5h1ko",
    },
    body: `[{"operationName":"EditBroadcastContext_ChannelTagsMutation","variables":{"input":{"contentID":"197407231","contentType":"USER","tagIDs":["6ea6bca4-4712-4ab9-a906-e3336a9d8039","ac763b17-7bea-4632-9eb4-d106689ff409","e90b5f6e-4c6e-4003-885b-4d0d5adeb580","8bbdb07d-df18-4f82-a928-04a9003e9a7e","64d9afa6-139a-48d5-ab4e-51d0a92b22de","52d7e4cc-633d-46f5-818c-bb59102d9549"],"authorID":"197407231"}},"extensions":{"persistedQuery":{"version":1,"sha256Hash":"4dd3764af06e728e1b4082b4dc17947dd51ab1aabbd8371ff49c01e440dfdfb1"}}},{"operationName":"EditBroadcastContext_BroadcastSettingsMutation","variables":{"input":{"broadcasterLanguage":"en","game":"Roblox","status":"${newTitle}","userID":"197407231"}},"extensions":{"persistedQuery":{"version":1,"sha256Hash":"856e69184d9d3aa37529d1cec489a164807eff0c6264b20832d06b669ee80ea5"}}}]`,
    method: "POST",
  });
}

export const getLatestPredictionData = async () => {
  const r = await fetch("https://gql.twitch.tv/gql#origin=twilight", {
    headers: {
      Accept: "*/*",
      "Accept-Language": "en-US",
      "Client-Id": "kimne78kx3ncx6brgo4mv6wki5h1ko",
      Authorization: "OAuth "+BOT_OAUTH,
    },
    body: `{\"operationName\":\"ChannelPointsPredictionContext\",\"variables\":{\"count\":1,\"channelLogin\":\"tibb12\"},\"extensions\":{\"persistedQuery\":{\"version\":1,\"sha256Hash\":\"beb846598256b75bd7c1fe54a80431335996153e358ca9c7837ce7bb83d7d383\"}}}`,
    method: "POST",
  })
  return(await r.json())
};

export const streamTags = async () => {
  const r = await fetch("https://gql.twitch.tv/gql", {
    "headers": {
      "authorization": `OAuth ${BOT_OAUTH}`,
      "client-id": "kimne78kx3ncx6brgo4mv6wki5h1ko",
    },
    "body": `[{"operationName":"EditBroadcastContext_FreeformTagsMutation","variables":{"input":{"contentID":"197407231","contentType":"CHANNEL","freeformTagNames":["PlayingwithViewers","FamilyFriendly","LGBTQIAPlus","Vtuber","AuditoryASMR","Giveaway","Robux","Roblox","Anime","ADHD"]}},"extensions":{"persistedQuery":{"version":1,"sha256Hash":"8aaac5a848941ff6a26bacb44b6b251909c77b84f39ce6eced8f4c694036fc08"}}}]`,
    "method": "POST"
  })
  return(await r.json())
}
