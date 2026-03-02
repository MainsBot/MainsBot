export function getDefaultCommandsCatalog() {
  return [
    {
      name: "KillSwitch",
      commands: [
        { cmd: "!ks.on", desc: "Enables killswitch.", modOnly: true },
        { cmd: "!ks.off", desc: "Disables killswitch.", modOnly: true },
      ],
    },
    {
      name: "Modes",
      commands: [
        { cmd: "!join.on", desc: "Enables join mode.", modOnly: true },
        {
          cmd: "!link.on",
          desc: "Enables link mode (also enables with valid VIP link post).",
          modOnly: true,
        },
        { cmd: "!ticket.on", desc: "Enables ticket mode.", modOnly: true },
        { cmd: "!1v1.on", desc: "Enables 1v1 mode for Arsenal.", modOnly: true },
        { cmd: "!val.on", desc: "Enables valorant mode.", modOnly: true },
        { cmd: "!reddit.on", desc: "Enables reddit recap mode.", modOnly: true },
      ],
    },
    {
      name: "Filters",
      commands: [
        { cmd: "!spamfilter.[on/off]", desc: "Enables/disables spam filter.", modOnly: true },
        { cmd: "!lengthfilter.[on/off]", desc: "Enables/disables length filter.", modOnly: true },
        { cmd: "!linkfilter.[on/off]", desc: "Enables/disables link filter.", modOnly: true },
      ],
    },
    {
      name: "Handlers",
      commands: [
        { cmd: "!timers.[on/off]", desc: "Enables/disables timers.", modOnly: true },
        { cmd: "!keywords.[on/off]", desc: "Enables/disables keyword responses.", modOnly: true },
      ],
    },
    {
      name: "Spotify",
      commands: [
        { cmd: "!song", desc: "Shows the currently playing track.", cooldown: "shared" },
        { cmd: "!lastsong / !last song", desc: "Shows the last played song.", cooldown: "shared" },
        { cmd: "!nextsong / !next song", desc: "Shows the upcoming song.", cooldown: "shared" },
        { cmd: "!songqueue / !song queue", desc: "Shows next songs in queue.", cooldown: "shared" },
        { cmd: "!addsong [song-name/id/link]", desc: "Adds a song to queue.", modOnly: true },
        { cmd: "!skipsong", desc: "Skips current song.", modOnly: true },
        { cmd: "!songvol [0-100]", desc: "Changes spotify volume.", modOnly: true },
      ],
    },
    {
      name: "Roblox",
      commands: [
        { cmd: "!game", desc: "Shows current Roblox game.", cooldown: "shared" },
        { cmd: "!playtime", desc: "Shows Roblox playtime.", cooldown: "shared" },
        { cmd: "!gamelink", desc: "Sends current game link.", cooldown: "shared" },
        { cmd: "!friend [username]", desc: "Adds temporary tracked friend.", modOnly: true, cooldown: "friend" },
        { cmd: "!permadd [username]", desc: "Adds permanent tracked friend.", modOnly: true, cooldown: "friend" },
        { cmd: "!unfriendtemp / !unfriendall", desc: "Removes tracked temp friends.", modOnly: true },
        { cmd: "!friendstats", desc: "Shows tracked friend counts.", modOnly: true },
        { cmd: "!gamesplayed", desc: "Top games this stream.", cooldown: "shared+games" },
        { cmd: "!gamesplayedall", desc: "Top games all-time.", cooldown: "shared+games" },
        { cmd: "!gamesplayedweek", desc: "Top games this week.", cooldown: "shared+games" },
        { cmd: "!gamesplayedmonth", desc: "Top games this month.", cooldown: "shared+games" },
        { cmd: "!gamesplayedyesterday", desc: "Top games yesterday.", cooldown: "shared+games" },
        { cmd: "!gamesplayedcount", desc: "Shows gamesplayed count.", cooldown: "shared" },
        { cmd: "!gamesplayedcount [1-10]", desc: "Sets gamesplayed count.", modOnly: true, cooldown: "shared" },
      ],
    },
    {
      name: "Channel Point/Sub",
      commands: [
        { cmd: "!cptotime [amount] [tier1/tier2/tier3/nosub]", desc: "Estimate SAND farming time.", cooldown: "shared" },
        { cmd: "!whogiftedme", desc: "Shows who gifted your sub.", cooldown: "shared" },
      ],
    },
    {
      name: "Extra Commands",
      commands: [
        { cmd: "!dice", desc: "Roll a dice.", cooldown: "shared" },
        { cmd: "!version", desc: "Shows bot version.", cooldown: "shared" },
        { cmd: "!commands", desc: "Shows command website.", cooldown: "shared" },
      ],
    },
  ];
}

