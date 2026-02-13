import fs from "fs";
import WebSocket from "ws";
import { setTimeout as delay } from "timers/promises";

import * as FILTER_FUNCTIONS from "../functions/filters.js";
import * as ROBLOX_FUNCTIONS from "../api/roblox/index.js";
import * as SPOTIFY from "../api/spotify/index.js";
import { isSpotifyModuleEnabled } from "./spotifyCommands.js";
import {
  addTrackedRobloxFriend,
  getRobloxFriendCooldownRemainingMs,
  isRobloxModuleEnabled,
} from "./roblox.js";

function flagFromValue(value) {
  return /^(1|true|yes|on)$/i.test(String(value ?? "").trim());
}

export function isPubsubModuleEnabled() {
  const raw = String(process.env.MODULE_PUBSUB ?? "").trim();
  if (raw) return flagFromValue(raw);
  return true; // default on (backward compatible)
}

export function startTwitchPubsub({
  client,
  twitchFunctions,
  botOauth,
  channelId,
  botId,
  channelName,
  liveUpHandler,
  liveDownHandler,
  logger = console,
} = {}) {
  if (!client) throw new Error("startTwitchPubsub: missing client");
  if (!twitchFunctions) throw new Error("startTwitchPubsub: missing twitchFunctions");
  if (!botOauth) throw new Error("startTwitchPubsub: missing botOauth");
  if (!channelId) throw new Error("startTwitchPubsub: missing channelId");
  if (!botId) throw new Error("startTwitchPubsub: missing botId");
  if (!channelName) throw new Error("startTwitchPubsub: missing channelName");
  if (typeof liveUpHandler !== "function") throw new Error("startTwitchPubsub: missing liveUpHandler");
  if (typeof liveDownHandler !== "function") throw new Error("startTwitchPubsub: missing liveDownHandler");

  const TWITCH_FUNCTIONS = twitchFunctions;
  const BOT_OAUTH = botOauth;
  const CHANNEL_ID = channelId;
  const BOT_ID = botId;
  const CHANNEL_NAME = String(channelName).replace(/^#/, "");

  const WAIT_UNTIL_FOC_OFF = Math.max(0, Number(process.env.WAIT_UNTIL_FOC_OFF) || 0);
  const WAIT_UNTIL_FOC_OFF_RAID = Math.max(0, Number(process.env.WAIT_UNTIL_FOC_OFF_RAID) || 0);

  const IS_BOT = /^(1|true|yes|on)$/i.test(String(process.env.IS_BOT ?? "").trim());
  const bot = IS_BOT ? "[??] " : "";

  let stopped = false;

  // referenced by legacy handler
  let SETTINGS = {};
  let STREAMS = {};
  let streamNumber = 0;

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
  if (stopped) return;
  pubsub = new WebSocket("wss://pubsub-edge.twitch.tv");
  pubsub
    .on("close", function () {
      if (stopped) return;
      console.log("Disconnected");
      StartListener();
    })
    .on("open", function () {
      ping.start();
      runAuth();
    });
  pubsub.on("message", async function (raw_data, flags) {
    SETTINGS = JSON.parse(fs.readFileSync("./SETTINGS.json"));
    STREAMS = JSON.parse(fs.readFileSync("./STREAMS.json"));
    streamNumber = Object.keys(STREAMS).length;
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
        await TWITCH_FUNCTIONS.setFollowersOnlyMode(false).catch((e) => {
          console.warn(
            "[helix] failed to disable followers-only (stream-up):",
            String(e?.message || e)
          );
        });
        liveUpHandler();
      } else if (type == "stream-down") {
        await TWITCH_FUNCTIONS.setFollowersOnlyMode(true).catch((e) => {
          console.warn(
            "[helix] failed to enable followers-only (stream-down):",
            String(e?.message || e)
          );
        });
        await TWITCH_FUNCTIONS.setSlowMode(true, 5).catch((e) => {
          console.warn(
            "[helix] failed to enable slow mode (stream-down):",
            String(e?.message || e)
          );
        });
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
            await delay(WAIT_UNTIL_FOC_OFF);
            await TWITCH_FUNCTIONS.setFollowersOnlyMode(false).catch((e) => {
              console.warn(
                "[helix] failed to disable followers-only (delayed):",
                String(e?.message || e)
              );
            });
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
          // client.say(
          //   CHANNEL_NAME,
          //   `An ad has been ran, subscribe with prime for free and enjoy watching with 0 ads all month for free, !prime for more info EZ PogU .`
          // );
        }
      } else if (pubTopic == `community-moments-channel-v1.${CHANNEL_ID}`) {
        if (SETTINGS.ks == false) {
          const text = `${bot} A new moment PagMan everyone claim it while you can PogU .`;
          await TWITCH_FUNCTIONS.sendHelixAnnouncement(text).catch((e) => {
            console.warn("[helix] announcement failed:", String(e?.message || e));
            client.say(CHANNEL_NAME, text);
          });
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

            const getSubStatus = await TWITCH_FUNCTIONS.getSubStatus(node.user.id).catch(
              () => null
            );
            const tier = Number(getSubStatus?.data?.[0]?.tier ?? 0);

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

            if (cp > 1000) {
              client.say(
                CHANNEL_NAME,
                `@${username}, lost ${cp} channel points, since ${sub} thats ${cpToHours.timeString} of farming RIPBOZO`
              );
            }
          }
        } else if (type == "POLL_TERMINATE" || type == "POLL_COMPLETE") {
                    const nodes = r.userNodes;

                    for (let i = 0; i < nodes.length; i++) {
                      const node = nodes[i];
                      const username = node.user.login;
                      const cp = node.tokens.communityPoints;

                      // console.log(JSON.stringify(r, null, 1));

                      let winning_choice_id;
                      let winning_choice_votes = 0;

                      r.choices.forEach(function (choice) {
                        if (choice.votes.total > winning_choice_votes) {
                          winning_choice_votes = choice.votes.total;
                          winning_choice_id = choice.id;
                        }
                      });

                      //

                      nodes.forEach(function (node) {
                        var packs = [];
                        node.choices.forEach(function (choice) {
                          if (choice.id != winning_choice_id) {
                            r.choices.forEach(function (mainChoice) {
                              if (mainChoice.id == choice.id) {
                                packs.push(mainChoice.title);
                              }
                            });
                          }
                        });
                      });

                      nodes.forEach(function (node) {
                        var choiceArray = {};

                        const user = node.user.login;

                        node.choices.forEach(function (choice) {
                          if (!choiceArray[choice.pollChoice.id]) {
                            choiceArray[choice.pollChoice.id] =
                              choice.tokens.communityPoints;
                          } else {
                            choiceArray[choice.pollChoice.id] =
                              choiceArray[choice.pollChoice.id] +
                              choice.tokens.communityPoints;
                          }
                        });

                        let mostVotedFor;
                        let mostedVoted = 0;
                        let mostVotedForName;
                        let total = 0;

                        for (const key in choiceArray) {
                          const amount = choiceArray[key];
                          total += amount;
                          if (amount > mostedVoted) {
                            mostVotedFor = key;
                          }
                        }

                        r.choices.forEach(function (mainChoice) {
                          console.log(mostVotedFor);
                          if (mainChoice.id == mostVotedFor) {
                            mostVotedForName = mainChoice.title;
                          }
                        });

                        console.log(
                          `${user} spent in total ${total} channel points, spending the most on ${mostVotedForName} which they spent ${choiceArray[mostVotedFor]} channel points on.`
                        );
                      });
                    }

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
                const userChoices = Array.isArray(node?.choices) ? node.choices : [];

                const userId = node?.user?.id;
                if (!userId) return;
                const username = node?.user?.login || "";
                const displayName = node?.user?.displayName || "";

                userData[userId] = {
                  username: username,
                  displayName: displayName,
                };

              userChoices.forEach(function (userChoice) {
                const choiceId = userChoice?.pollChoice?.id;
                if (!choiceId) return;
                const amount = Number(userChoice?.tokens?.communityPoints ?? 0);
                userData[userId][choiceId] =
                  Number(userData[userId][choiceId] ?? 0) + amount;
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
                if (choice === "username" || choice === "displayName") continue;
                if (choice != winnerData.winner_id) {
                  userLosses[userId]["allLosses"][choice] = userData[userId][choice];
                } else {
                  userLosses[userId]["votedForWinner"] = true;
                  userLosses[userId]["winnerLoss"] =
                    Number(userData[userId][winnerData.winner_id] ?? 0);
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

            const packs = {};

            const packLeaders = {};

            const messages = {};

            for (const choiceId in choiceArray) {
              packs[choiceId] = {};
              packLeaders[choiceId] = {};
            }

            for (const userId in userLosses) {
              const user = userLosses[userId];

              for (const loss in user.allLosses) {
                if (!packs[loss]) continue;
                packs[loss][userId] = user.allLosses[loss];
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
          const skipSong = "c1177786-2fec-47bd-9500-530c239220da"
          const first = "0c4a5827-15f4-4a58-885e-14d785024e5b";


          const redemptionId = JSON.parse(pubMessage).data.redemption.reward.id;


          if (redemptionId == vipEntry) {
            SETTINGS = JSON.parse(fs.readFileSync('./SETTINGS.json'))
            if (SETTINGS.currentMode == '!ticket.on') {
                const userInputRaw = String(
                  JSON.parse(pubMessage).data.redemption.user_input || ""
                ).trim();
                const userInput = userInputRaw.split(/\s+/)[0];
                const twitchUsername = JSON.parse(pubMessage).data.redemption.user.login

                if (!userInput) {
                  return client.say(
                    CHANNEL_NAME,
                    `@${twitchUsername}, please include a Roblox username in your ticket redemption.`
                  );
                }

                const cooldownRemainingMs = Math.max(
                  0,
                  getRobloxFriendCooldownRemainingMs()
                );
                if (cooldownRemainingMs > 0) {
                  const seconds = Math.max(1, Math.ceil(cooldownRemainingMs / 1000));
                  return client.say(
                    CHANNEL_NAME,
                    `@${twitchUsername}, friend requests are on cooldown (${seconds}s left), please retry.`
                  );
                }

                const result = await addTrackedRobloxFriend({
                  targetName: userInput,
                  requestedBy: twitchUsername,
                  permanent: false,
                  source: "ticket_redemption",
                });

                if (
                  result.status === "invalid_username" ||
                  result.status === "missing_username"
                ) {
                  return client.say(
                    CHANNEL_NAME,
                    `@${twitchUsername}, '${userInput}' is not a valid Roblox username.`
                  );
                }

                if (result.status === "validate_error") {
                  return client.say(
                    CHANNEL_NAME,
                    `@${twitchUsername}, username validation failed, please retry.`
                  );
                }

                if (result.status === "rate_limited") {
                  return client.say(
                    CHANNEL_NAME,
                    `@${twitchUsername}, Roblox rate limited me, please retry in a bit.`
                  );
                }

                if (result.status === "send_error") {
                  return client.say(
                    CHANNEL_NAME,
                    `@${twitchUsername}, could not send friend request right now.`
                  );
                }

                if (result.status === "already") {
                  return client.say(
                    CHANNEL_NAME,
                    `@${twitchUsername}, '${result.username}' is already friended and has been tracked for cleanup.`
                  );
                }

                client.say(CHANNEL_NAME, `@${twitchUsername}, sent a friend request to ${result.username}.`)
              }
            }

          if (redemptionId == subonly) {
            await TWITCH_FUNCTIONS.setSubscriberMode(true).catch((e) => {
              console.warn(
                "[helix] failed to enable subscriber-only mode:",
                String(e?.message || e)
              );
            });
            client.say(CHANNEL_NAME, 'EZY Clap non-subs')
            await delay(5 * 60 * 1000)
            await TWITCH_FUNCTIONS.setSubscriberMode(false).catch((e) => {
              console.warn(
                "[helix] failed to disable subscriber-only mode:",
                String(e?.message || e)
              );
            });
            client.say(CHANNEL_NAME, `The chat is no longer in sub only. THE NON SUBS ARE FREE PagMan`);
          }

          if (redemptionId == emoteonly) {
            await TWITCH_FUNCTIONS.setEmoteMode(true).catch((e) => {
              console.warn(
                "[helix] failed to enable emote-only mode:",
                String(e?.message || e)
              );
            });
            client.say(CHANNEL_NAME, `The chat is now in emote only for 5 minutes.`)
            await delay(5 * 60 * 1000)
            await TWITCH_FUNCTIONS.setEmoteMode(false).catch((e) => {
              console.warn(
                "[helix] failed to disable emote-only mode:",
                String(e?.message || e)
              );
            });
            client.say(CHANNEL_NAME, `The chat is no longer in emote only.`);
          }
          
          if (redemptionId == remotesuboremote) {
            await TWITCH_FUNCTIONS.setEmoteMode(false).catch((e) => {
              console.warn(
                "[helix] failed to disable emote-only mode:",
                String(e?.message || e)
              );
            });
            await TWITCH_FUNCTIONS.setSubscriberMode(false).catch((e) => {
              console.warn(
                "[helix] failed to disable subscriber-only mode:",
                String(e?.message || e)
              );
            });
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
            await TWITCH_FUNCTIONS.timeoutUserByLogin(
              userInputSplit[0],
              60,
              `[AUTOMATIC] ${twitchUsername} redeemed a timeout on you.`
            ).catch((e) => {
              console.warn(
                "[helix] timeout failed:",
                String(e?.message || e)
              );
            });
          }

          if (redemptionId == removeoraddhat) {
            await delay(30 * 60 * 100)
            client.say(CHANNEL_NAME, `@${CHANNEL_NAME} 30 miniutes has passed since ${twitchUsername} redeemed the hat redemption.`);
          }

          if (redemptionId == skipSong) {
            if (isSpotifyModuleEnabled()) {
              SPOTIFY.skipNext().catch(() => null);
              client.say(CHANNEL_NAME, `${twitchUsername}, song skipped.`);
            } else {
              client.say(CHANNEL_NAME, `${twitchUsername}, Spotify module is disabled.`);
            }
          }

          if (redemptionId == first) {
            await TWITCH_FUNCTIONS.addPajbotPointsById(twitchUserId, 25_000);
            client.say(CHANNEL_NAME, `@${twitchDisplayName} got 25,000 basement points for being first!`);
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
      // `hype-train-events-v1.${CHANNEL_ID}`,
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
    // STREAMER_TOKEN
  );
};
StartListener();


  return {
    stop() {
      stopped = true;
      try {
        pubsub?.close?.();
      } catch {}
    },
  };
}
