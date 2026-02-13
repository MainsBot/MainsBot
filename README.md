# MainsBot
### Current Version: 2.6.8
<!-- ![](https://cdn.7tv.app/emote/61a157c215b3ff4a5bb7dcc0/4x.avif) --> 

## Bot Features

ㅤ•  A killswitch

ㅤ•  Roblox game/playtime command

ㅤ•  Twitch Stuff

## NPM

Run: 
```bash
npm i pm2 tmi.js ws fs spotify-buddylist string-similarity nodemon dotenv node-fetch discord.js

sudo npm install pm2 -g
cd MainsBot && npm i pm2 tmi.js ws fs spotify-buddylist string-similarity nodemon dotenv node-fetch discord.js && cd..
```

## GIT 

Run: 
```bash
git clone https://github.com/Mr-Cheeezz/MainsBot.git
```

## START

Run:
```bash
cd MainsBot && pm2 start main.js && cd ..
```

## Code layout

- Entry point: `main.js`
- Bot runtime: `bot/app.js`
- Optional modules: `bot/modules/*`

## Multi-instance (INI)

- Copy `config/instance.example.ini` to a per-instance file and edit it.
- The example INI defaults to `[state].backend=postgres`; set `[database].url` (recommended) or switch it to `file`.
- Run one bot per config:
  - `node main.js --config config/myinstance.ini`
  - `pm2 start main.js --name mainsbot:myinstance -- --config config/myinstance.ini`

If `instance.data_dir` is set, per-instance state lives under that directory (file backend) or in Postgres (postgres backend). Files under `data_dir` are still used to seed defaults on first run.

## Web admin login (Twitch)

- Visit `/admin` and login via Twitch.
- All `/auth/*` routes are protected (you must be logged in as an allowed user).

Config (INI keys in `[web]` or env vars):
- `WEB_COOKIE_SECRET` (required)
- `WEB_OWNER_USER_ID` or `WEB_OWNER_LOGIN` (recommended)
- `WEB_ALLOWED_USERS` (comma/space separated Twitch logins)

## Socket hosting (nginx)

- Set `[web].listen=socket` + `[web].socket_path` and proxy to it in nginx.
- Example: `deploy/nginx-mainsbot-socket.conf.example`

## Postgres state (recommended)

State is stored in Postgres (JSONB) when enabled. This lets you run multiple instances without sharing JSON files.

### Create DB (Debian/server, pajbot-style)

Run as a Postgres superuser:
- `sudo -u postgres psql -f deploy/sql/00-create-role-and-db.sql`

Then set these in your INI:
- `[state].backend = postgres`
- `[database].url = postgresql://mainsbot@127.0.0.1:5432/mainsbot`
- `[database].schema = mainsbot_<streamername>` (example: `mainsbot_tibb12`)

On Debian-like systems, a passwordless role can work because `pg_hba.conf` often allows peer auth for local users (same idea as pajbot).

### Create DB (Windows local testing)

Scoop `psql` is just the client. You also need a Postgres server running (local service, Docker, WSL, etc).

1) Check you can connect to a server:
- `psql -h 127.0.0.1 -U postgres -d postgres -c "select version();"`

2) Create the `mainsbot` role + DB (run as a superuser):
- `psql -h 127.0.0.1 -U postgres -d postgres -f deploy/sql/00-create-role-and-db.sql`

3) (Optional) Pre-create a schema/table:
- `psql -h 127.0.0.1 -U mainsbot -d mainsbot -v schema=mainsbot_tibb12 -f deploy/sql/10-schema.sql`

Passwordless on Windows usually requires editing `pg_hba.conf` to allow `trust`/`peer` for local connections. If you don't want to touch `pg_hba.conf`, set a password:
- `psql -h 127.0.0.1 -U postgres -d postgres -c "alter role mainsbot with password 'change_me';"`
- then use `postgresql://mainsbot:change_me@127.0.0.1:5432/mainsbot` in your INI.

### Note

You don't have to run `deploy/sql/10-schema.sql` for the bot to work: the bot auto-creates the schema/table on startup based on `[database].schema`.

## Modules (optional)

Enable/disable optional feature modules in your INI:
- `[modules].spotify = 1` (or `0` to disable Spotify chat commands/status)

## ENV

`.env` / exported environment variables are no longer the supported configuration path.

Use `config/<instance>.ini` (see “Multi-instance (INI)” above).

Legacy reference (do not use):
```javascript
COOKIE = ''

BOT_TOKEN = '' // preferred
// BOT_OAUTH = '' // legacy fallback
BOT_NAME = ''
BOT_ID = 
CLIENT_ID = '' // preferred Twitch app client id
CLIENT_SECRET = '' // preferred Twitch app client secret

CHANNEL_NAME = ''
CHANNEL_NAME_DISPLAY = ''
CHANNEL_ID = 

STRAMER_TOKEN = '' // preferred streamer token name (supports STREAMER_TOKEN too)

// Optional: send bot chat/replies through Helix instead of IRC PRIVMSG
TWITCH_CHAT_USE_HELIX = true
TWITCH_CHAT_CLIENT_ID = '' // optional override; defaults to CLIENT_ID (or token store client_id)
TWITCH_CHAT_TOKEN = '' // optional override; defaults to BOT_TOKEN
TWITCH_CHAT_SENDER_ID = '' // defaults to BOT_ID
TWITCH_CHAT_BROADCASTER_ID = '' // defaults to CHANNEL_ID
TWITCH_CHAT_BROADCASTER_LOGIN = '' // defaults to CHANNEL_NAME
// token scopes for Helix chat should include user:write:chat (+ user:read:chat / user:bot as needed by your auth flow)
// All client.say/client.raw PRIVMSG sends attempt Helix first, with IRC fallback if Helix fails.

// OAuth web auth + token storage
TWITCH_AUTH_REDIRECT_URI = 'https://example.com/auth/callback'
TWITCH_AUTH_FORCE_VERIFY = true
TWITCH_TOKEN_STORE_PATH = 'secrets/twitch_tokens.json'

// Roblox OAuth 2.0 token storage
ROBLOX_CLIENT_ID = ''
ROBLOX_CLIENT_SECRET = ''
ROBLOX_AUTH_REDIRECT_URI = 'https://example.com/auth/roblox/callback'
ROBLOX_AUTH_SCOPES = 'openid profile'
ROBLOX_TOKEN_STORE_PATH = 'secrets/roblox_tokens.json'

// Web admin login (protects /auth/*)
WEB_COOKIE_SECRET = ''
WEB_OWNER_USER_ID = ''
WEB_OWNER_LOGIN = ''
WEB_ALLOWED_USERS = '' // comma/space-separated Twitch logins

// Web server listen (prefer socket behind nginx)
WEB_SOCKET_PATH = '/run/mainsbot.sock'
WEB_HOST = '127.0.0.1'
WEB_PORT = 8787

// Optional Postgres state for SETTINGS/STREAMS/playtime
STATE_BACKEND = 'file' // or 'postgres'
DATABASE_URL = ''

// Public site URL (used in !commands and web UI labels)
WEB_PUBLIC_URL = 'https://example.com'

// Optional: reddit recap link for !reddit.on
REDDIT_RECAP_URL = 'https://reddit.com/r/your_subreddit'

WEB_ACCESS_TOKEN = ''

ADMIN_ID = 505216805

WAIT_REGISTER = 300000

COOLDOWN = 90000
MESSAGE_MEMORY = 5000

MAX_MESSAGE_LENGTH = 495
BASE_LENGTH_TIMEOUT = 15 
MAX_LENGTH_TIMEOUT = 300

BASE_SPAM_TIMEOUT = 30 
MAX_SPAM_TIMEOUT = 300 

MINIMUM_CHARACTERS = 0
MAXIMUM_SIMILARITY = 0
MINIMUM_MESSAGE_COUNT = 4

WAIT_UNTIL_FOC_OFF = 60000
WAIT_UNTIL_FOC_OFF_RAID = 300000
SPAM_LINK = 300000
JOIN_TIMER = 150000
SONG_TIMER = 4000
```

Auth routes:
- `/auth`
- `/auth/bot`
- `/auth/streamer`
- `/auth/callback` (OAuth redirect target)
- `/auth/success`
- `/auth/status`
- `/auth/roblox`
- `/auth/roblox/bot`
- `/auth/roblox/callback` (OAuth redirect target)
- `/auth/roblox/success`
- `/auth/roblox/status`
