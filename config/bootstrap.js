import fs from "fs";
import path from "path";
import { readIniFile } from "./ini.js";

const APP_ENV_PREFIXES_TO_CLEAR = [
  "WEB_",
  "TWITCH_",
  "ROBLOX_",
  "SPOTIFY_",
  "DISCORD_",
  "LINK_",
  "GAMEPING_",
  "MODULE_",
  "DATABASE_",
  "PAJBOT_",
];

const APP_ENV_KEYS_TO_CLEAR = [
  "INSTANCE_NAME",
  "DATA_DIR",
  "SETTINGS_PATH",
  "STREAMS_PATH",
  "QUOTES_PATH",
  "USERDATA_PATH",
  "PREDICTIONDATA_PATH",
  "POLLDATA_PATH",
  "WORDS_PATH",
  "GLOBAL_WORDS_PATH",
  "TO_UNFRIEND_PATH",
  "AUBREY_TAB_PATH",
  "PLAYTIME_PATH",
  "PGSSLMODE",
  "BOT_TOKEN",
  "BOT_OAUTH",
  "BOT_NAME",
  "BOT_ID",
  "CHANNEL_NAME",
  "CHANNEL_ID",
  "CHANNEL_NAME_DISPLAY",
  "CLIENT_ID",
  "CLIENT_SECRET",
  "COOKIE",
  "STREAMLABS_SOCKET_TOKEN",
  "PAJBOT_ENABLED",
  "PAJBOT_NAME",
  "PAJBOT_OAUTH",
  "REDDIT_RECAP_URL",
  "COOLDOWN",
  "MESSAGE_MEMORY",
  "MAX_MESSAGE_LENGTH",
  "BASE_LENGTH_TIMEOUT",
  "MAX_LENGTH_TIMEOUT",
  "BASE_SPAM_TIMEOUT",
  "MAX_SPAM_TIMEOUT",
  "MINIMUM_CHARACTERS",
  "MAXIMUM_SIMILARITY",
  "MINIMUM_MESSAGE_COUNT",
  "WAIT_UNTIL_FOC_OFF",
  "WAIT_UNTIL_FOC_OFF_RAID",
  "SPAM_LINK",
  "JOIN_TIMER",
  "SONG_TIMER",
  "DISCORD_TIMEZONE",
  "WEB_IP_INTEL_ENABLED",
  "WEB_IP_INTEL_TIMEOUT_MS",
  "WEB_IP_INTEL_CACHE_MS",
  "BOT_STARTUP_MESSAGE",
  "BOT_SHUTDOWN_MESSAGE",
];

function clearEnvKey(key) {
  if (!key) return;
  try {
    delete process.env[key];
  } catch {}
}

function clearAppEnvForIni() {
  // This prevents OS-level env vars from "leaking" into an instance when the INI doesn't set a key.
  for (const key of APP_ENV_KEYS_TO_CLEAR) {
    clearEnvKey(key);
  }

  for (const prefix of APP_ENV_PREFIXES_TO_CLEAR) {
    for (const key of Object.keys(process.env)) {
      if (key.startsWith(prefix)) clearEnvKey(key);
    }
  }
}

function parseArgs(argv = process.argv) {
  const args = Array.from(argv || []);
  const out = Object.create(null);
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--config" || a === "-c") {
      out.config = args[i + 1];
      i++;
      continue;
    }
  }
  return out;
}

function asAbs(p) {
  if (!p) return "";
  return path.isAbsolute(p) ? p : path.resolve(process.cwd(), p);
}

function ensureDir(p) {
  if (!p) return;
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function setEnvIfMissing(key, value) {
  if (!key) return;
  if (process.env[key] != null && String(process.env[key]).trim() !== "") return;
  if (value == null) return;
  process.env[key] = String(value);
}

function setEnvOverride(key, value) {
  if (!key) return;
  if (value == null) return;
  process.env[key] = String(value);
}

function applyEnvSection(ini) {
  const envSection = ini?.env && typeof ini.env === "object" ? ini.env : null;
  if (!envSection) return;
  for (const [k, v] of Object.entries(envSection)) {
    if (!k) continue;
    setEnvOverride(String(k).trim(), v);
  }
}

function readSecretsJson(secretsPath) {
  if (!secretsPath) return null;
  const abs = asAbs(secretsPath);
  if (!fs.existsSync(abs)) return null;
  try {
    return JSON.parse(fs.readFileSync(abs, "utf8"));
  } catch {
    throw new Error(`Invalid JSON in secrets file: ${secretsPath}`);
  }
}

function applySecretsJson(obj) {
  if (!obj || typeof obj !== "object") return;
  for (const [k, v] of Object.entries(obj)) {
    if (!k) continue;
    if (v === undefined || v === null) continue;
    if (typeof v === "string" && v.trim() === "") continue;
    setEnvOverride(String(k).trim(), v);
  }
}

function applyInstanceDefaults(ini) {
  const inst = ini?.instance && typeof ini.instance === "object" ? ini.instance : {};
  const instanceName = String(inst.name || "default").trim() || "default";
  // INI should be the single source of truth; always override any persisted OS env.
  setEnvOverride("INSTANCE_NAME", instanceName);

  const dataDir = String(inst.data_dir || inst.dataDir || `./data/${instanceName}`).trim();
  if (dataDir) {
    const absDir = asAbs(dataDir);
    ensureDir(absDir);
    setEnvOverride("DATA_DIR", absDir);

    // Keep per-instance runtime files under a single subfolder for cleanliness.
    const stateDir = path.join(absDir, "d");
    ensureDir(stateDir);

    setEnvOverride("SETTINGS_PATH", path.join(stateDir, "SETTINGS.json"));
    setEnvOverride("STREAMS_PATH", path.join(stateDir, "STREAMS.json"));
    setEnvOverride("QUOTES_PATH", path.join(stateDir, "QUOTES.json"));
    setEnvOverride("USERDATA_PATH", path.join(stateDir, "USERDATA.json"));
    setEnvOverride("PREDICTIONDATA_PATH", path.join(stateDir, "PREDICTIONDATA.json"));
    setEnvOverride("POLLDATA_PATH", path.join(stateDir, "POLLDATA.json"));
    const globalWordsPathRaw = String(
      inst.words_path ||
        inst.wordsPath ||
        process.env.GLOBAL_WORDS_PATH ||
        "./data/WORDS.json"
    ).trim();
    const globalWordsPath = asAbs(globalWordsPathRaw);
    ensureDir(path.dirname(globalWordsPath));
    setEnvOverride("GLOBAL_WORDS_PATH", globalWordsPath);
    setEnvOverride("WORDS_PATH", globalWordsPath);
    setEnvOverride("TO_UNFRIEND_PATH", path.join(stateDir, "TOUNFRIEND.json"));
    setEnvOverride("AUBREY_TAB_PATH", path.join(stateDir, "aubrey_tab.json"));
    setEnvOverride("PLAYTIME_PATH", path.join(stateDir, "playtime.json"));

    // Optional module data
    setEnvIfMissing("GAMEPING_ROLES_PATH", path.join(stateDir, "game_pings.json"));

    // Per-instance OAuth token stores (JSON)
    setEnvOverride("TWITCH_TOKEN_STORE_PATH", path.join(absDir, "secrets", "twitch_tokens.json"));
    setEnvOverride("ROBLOX_TOKEN_STORE_PATH", path.join(absDir, "secrets", "roblox_tokens.json"));
    setEnvOverride("SPOTIFY_TOKEN_STORE_PATH", path.join(absDir, "secrets", "spotify_tokens.json"));
  }

  const paths = ini?.paths && typeof ini.paths === "object" ? ini.paths : {};
  if (paths.twitch_token_store) setEnvOverride("TWITCH_TOKEN_STORE_PATH", paths.twitch_token_store);
  if (paths.roblox_token_store) setEnvOverride("ROBLOX_TOKEN_STORE_PATH", paths.roblox_token_store);
  if (paths.spotify_token_store) setEnvOverride("SPOTIFY_TOKEN_STORE_PATH", paths.spotify_token_store);
  if (paths.words_path || paths.wordsPath) {
    const wordsPath = asAbs(paths.words_path || paths.wordsPath);
    ensureDir(path.dirname(wordsPath));
    setEnvOverride("GLOBAL_WORDS_PATH", wordsPath);
    setEnvOverride("WORDS_PATH", wordsPath);
  }
}

function applyWebConfig(ini) {
  const web = ini?.web && typeof ini.web === "object" ? ini.web : {};
  if (web.auth_mode || web.authMode) setEnvOverride("WEB_AUTH_MODE", web.auth_mode || web.authMode);
  if (web.admin_username || web.adminUsername) setEnvOverride("WEB_ADMIN_USERNAME", web.admin_username || web.adminUsername);
  if (web.admin_password || web.adminPassword) setEnvOverride("WEB_ADMIN_PASSWORD", web.admin_password || web.adminPassword);
  if (web.admin_password_hash || web.adminPasswordHash) {
    setEnvOverride("WEB_ADMIN_PASSWORD_HASH", web.admin_password_hash || web.adminPasswordHash);
  }
  if (web.listen) setEnvOverride("WEB_LISTEN", web.listen);
  if (web.port) setEnvOverride("WEB_PORT", web.port);
  if (web.host) setEnvOverride("WEB_HOST", web.host);
  if (web.socket_path || web.socketPath) setEnvOverride("WEB_SOCKET_PATH", web.socket_path || web.socketPath);
  if (web.public_url || web.publicUrl) setEnvOverride("WEB_PUBLIC_URL", web.public_url || web.publicUrl);
  if (web.origin || web.web_origin || web.webOrigin) {
    setEnvOverride("WEB_ORIGIN", web.origin || web.web_origin || web.webOrigin);
  }
  if (web.admin_origin || web.adminOrigin) setEnvOverride("WEB_ADMIN_ORIGIN", web.admin_origin || web.adminOrigin);
  if (web.admin_redirect_uri || web.adminRedirectUri) setEnvOverride("WEB_ADMIN_REDIRECT_URI", web.admin_redirect_uri || web.adminRedirectUri);
  if (web.mods_cache_path || web.modsCachePath) {
    setEnvOverride("WEB_MODS_CACHE_PATH", web.mods_cache_path || web.modsCachePath);
  }
  if (web.allowed_users || web.allowedUsers) setEnvOverride("WEB_ALLOWED_USERS", web.allowed_users || web.allowedUsers);
  if (web.owner_user_id || web.ownerUserId) setEnvOverride("WEB_OWNER_USER_ID", web.owner_user_id || web.ownerUserId);
  if (web.owner_login || web.ownerLogin) setEnvOverride("WEB_OWNER_LOGIN", web.owner_login || web.ownerLogin);
  if (web.login_force_verify || web.loginForceVerify) {
    setEnvOverride("WEB_LOGIN_FORCE_VERIFY", web.login_force_verify || web.loginForceVerify);
  }
  if (web.cookie_secret || web.cookieSecret) {
    setEnvOverride("WEB_COOKIE_SECRET", web.cookie_secret || web.cookieSecret);
  }
  if (
    web.ip_intel_enabled != null ||
    web.ipIntelEnabled != null ||
    web.vpn_detection_enabled != null ||
    web.vpnDetectionEnabled != null
  ) {
    setEnvOverride(
      "WEB_IP_INTEL_ENABLED",
      web.ip_intel_enabled ??
        web.ipIntelEnabled ??
        web.vpn_detection_enabled ??
        web.vpnDetectionEnabled
    );
  }
  if (web.ip_intel_timeout_ms != null || web.ipIntelTimeoutMs != null) {
    setEnvOverride("WEB_IP_INTEL_TIMEOUT_MS", web.ip_intel_timeout_ms ?? web.ipIntelTimeoutMs);
  }
  if (web.ip_intel_cache_ms != null || web.ipIntelCacheMs != null) {
    setEnvOverride("WEB_IP_INTEL_CACHE_MS", web.ip_intel_cache_ms ?? web.ipIntelCacheMs);
  }
}

function applyStateConfig(ini) {
  const state = ini?.state && typeof ini.state === "object" ? ini.state : {};
  if (state.backend) setEnvOverride("STATE_BACKEND", state.backend);
  if (state.words_path || state.wordsPath) {
    const wordsPath = asAbs(state.words_path || state.wordsPath);
    ensureDir(path.dirname(wordsPath));
    setEnvOverride("GLOBAL_WORDS_PATH", wordsPath);
    setEnvOverride("WORDS_PATH", wordsPath);
  }
}

function applyModulesConfig(ini) {
  const mods = ini?.modules && typeof ini.modules === "object" ? ini.modules : {};
  if (mods.spotify != null) setEnvOverride("MODULE_SPOTIFY", mods.spotify);
  if (mods.roblox != null) setEnvOverride("MODULE_ROBLOX", mods.roblox);
  if (mods.discord != null) setEnvOverride("MODULE_DISCORD", mods.discord);
  if (mods.gameping != null) setEnvOverride("MODULE_GAMEPING", mods.gameping);
  if (mods.pubsub != null) setEnvOverride("MODULE_PUBSUB", mods.pubsub);
  if (mods.alerts != null) setEnvOverride("MODULE_ALERTS", mods.alerts);
  if (mods.tab != null) setEnvOverride("MODULE_AUBREYTAB", mods.tab);
  // backward compatible name (deprecated)
  if (mods.aubreytab != null) setEnvOverride("MODULE_AUBREYTAB", mods.aubreytab);
  if (mods.custom_commands != null || mods.customCommands != null) {
    setEnvOverride("MODULE_CUSTOM_COMMANDS", mods.custom_commands ?? mods.customCommands);
  }
}

function applyGamepingSection(ini) {
  const gp = ini?.gameping && typeof ini.gameping === "object" ? ini.gameping : {};

  if (gp.allowed_users || gp.allowedUsers) {
    setEnvOverride("GAMEPING_ALLOWED_USERS", gp.allowed_users || gp.allowedUsers);
  }
  if (gp.roles_path || gp.rolesPath) {
    setEnvOverride("GAMEPING_ROLES_PATH", gp.roles_path || gp.rolesPath);
  }
  if (gp.auto_dump_roles != null || gp.autoDumpRoles != null) {
    setEnvOverride("GAMEPING_ROLES_AUTO_DUMP", gp.auto_dump_roles ?? gp.autoDumpRoles);
  }
  if (gp.dump_mode || gp.dumpMode) {
    setEnvOverride("GAMEPING_ROLES_DUMP_MODE", gp.dump_mode || gp.dumpMode);
  }
  if (gp.stale_hours != null || gp.staleHours != null) {
    setEnvOverride("GAMEPING_ROLES_STALE_HOURS", gp.stale_hours ?? gp.staleHours);
  }
  if (gp.exclude_roles || gp.excludeRoles) {
    setEnvOverride("GAMEPING_ROLES_EXCLUDE", gp.exclude_roles || gp.excludeRoles);
  }
}

function applySettingsSection(ini) {
  const settings = ini?.settings && typeof ini.settings === "object" ? ini.settings : {};
  if (settings.is_bot != null || settings.isBot != null) {
    setEnvOverride("IS_BOT", settings.is_bot ?? settings.isBot);
  }
  if (settings.admin_id != null || settings.adminId != null) {
    setEnvOverride("ADMIN_ID", settings.admin_id ?? settings.adminId);
  }
  if (
    settings.timezone != null ||
    settings.time_zone != null ||
    settings.discord_timezone != null ||
    settings.discordTimeZone != null
  ) {
    setEnvOverride(
      "DISCORD_TIMEZONE",
      settings.timezone ??
        settings.time_zone ??
        settings.discord_timezone ??
        settings.discordTimeZone
    );
  }
}

function applyMessagesSection(ini) {
  const messages = ini?.messages && typeof ini.messages === "object" ? ini.messages : {};
  if (messages.startup || messages.on_start || messages.onStart) {
    setEnvOverride("BOT_STARTUP_MESSAGE", messages.startup || messages.on_start || messages.onStart);
  }
  if (messages.shutdown || messages.on_stop || messages.onStop) {
    setEnvOverride("BOT_SHUTDOWN_MESSAGE", messages.shutdown || messages.on_stop || messages.onStop);
  }
}

function applyDatabaseSection(ini) {
  const db = ini?.database && typeof ini.database === "object"
    ? ini.database
    : ini?.db && typeof ini.db === "object"
      ? ini.db
      : {};

  if (db.url || db.database_url || db.databaseUrl) {
    setEnvOverride("DATABASE_URL", db.url || db.database_url || db.databaseUrl);
  }
  if (db.schema || db.database_schema || db.databaseSchema) {
    setEnvOverride("DATABASE_SCHEMA", db.schema || db.database_schema || db.databaseSchema);
  }
  if (db.sslmode || db.pgsslmode || db.PGSSLMODE) {
    setEnvOverride("PGSSLMODE", db.sslmode || db.pgsslmode || db.PGSSLMODE);
  }
}

function applyTwitchSection(ini) {
  const tw = ini?.twitch && typeof ini.twitch === "object" ? ini.twitch : {};

  if (tw.bot_name || tw.botName) setEnvOverride("BOT_NAME", tw.bot_name || tw.botName);
  if (tw.bot_id || tw.botId) setEnvOverride("BOT_ID", tw.bot_id || tw.botId);
  if (tw.channel_name || tw.channelName) setEnvOverride("CHANNEL_NAME", tw.channel_name || tw.channelName);
  if (tw.channel_id || tw.channelId) setEnvOverride("CHANNEL_ID", tw.channel_id || tw.channelId);
  if (tw.channel_name_display || tw.channelNameDisplay) {
    setEnvOverride("CHANNEL_NAME_DISPLAY", tw.channel_name_display || tw.channelNameDisplay);
  }

  // Optional legacy IRC credentials (prefer token store via /auth/*).
  // These map to the historical env var names used throughout the bot.
  if (tw.bot_token || tw.botToken) setEnvOverride("BOT_TOKEN", tw.bot_token || tw.botToken);
  if (tw.bot_oauth || tw.botOauth || tw.bot_oauth_token || tw.botOauthToken) {
    setEnvOverride(
      "BOT_OAUTH",
      tw.bot_oauth || tw.botOauth || tw.bot_oauth_token || tw.botOauthToken
    );
  }
  if (tw.streamer_token || tw.streamerToken || tw.stramer_token || tw.stramerToken) {
    setEnvOverride(
      "STREAMER_TOKEN",
      tw.streamer_token || tw.streamerToken || tw.stramer_token || tw.stramerToken
    );
  }

  if (tw.client_id || tw.clientId) setEnvOverride("CLIENT_ID", tw.client_id || tw.clientId);
  if (tw.client_secret || tw.clientSecret) setEnvOverride("CLIENT_SECRET", tw.client_secret || tw.clientSecret);

  if (tw.auth_redirect_uri || tw.authRedirectUri) {
    setEnvOverride("TWITCH_AUTH_REDIRECT_URI", tw.auth_redirect_uri || tw.authRedirectUri);
  }
  if (tw.auth_force_verify != null || tw.authForceVerify != null) {
    setEnvOverride("TWITCH_AUTH_FORCE_VERIFY", tw.auth_force_verify ?? tw.authForceVerify);
  }
  if (tw.auth_dynamic_redirect != null || tw.authDynamicRedirect != null) {
    setEnvOverride("TWITCH_AUTH_DYNAMIC_REDIRECT", tw.auth_dynamic_redirect ?? tw.authDynamicRedirect);
  }

  if (tw.chat_use_helix != null || tw.chatUseHelix != null) {
    setEnvOverride("TWITCH_CHAT_USE_HELIX", tw.chat_use_helix ?? tw.chatUseHelix);
  }
  if (tw.chat_allow_irc_fallback != null || tw.chatAllowIrcFallback != null) {
    setEnvOverride("TWITCH_CHAT_ALLOW_IRC_FALLBACK", tw.chat_allow_irc_fallback ?? tw.chatAllowIrcFallback);
  }
  if (tw.chat_use_app_token != null || tw.chatUseAppToken != null) {
    setEnvOverride("TWITCH_CHAT_USE_APP_TOKEN", tw.chat_use_app_token ?? tw.chatUseAppToken);
  }
}

function applySpotifySection(ini) {
  const sp = ini?.spotify && typeof ini.spotify === "object" ? ini.spotify : {};

  if (sp.enabled != null) setEnvOverride("MODULE_SPOTIFY", sp.enabled);
  if (sp.client_id || sp.clientId) setEnvOverride("SPOTIFY_CLIENT_ID", sp.client_id || sp.clientId);
  if (sp.client_secret || sp.clientSecret) setEnvOverride("SPOTIFY_CLIENT_SECRET", sp.client_secret || sp.clientSecret);
  // Legacy fallback: refresh_token can be set directly, but preferred is linking via /auth/spotify.
  if (sp.refresh_token || sp.refreshToken) setEnvOverride("SPOTIFY_REFRESH_TOKEN", sp.refresh_token || sp.refreshToken);
  if (sp.auth_redirect_uri || sp.authRedirectUri) {
    setEnvOverride("SPOTIFY_AUTH_REDIRECT_URI", sp.auth_redirect_uri || sp.authRedirectUri);
  }
  if (sp.auth_dynamic_redirect != null || sp.authDynamicRedirect != null) {
    setEnvOverride("SPOTIFY_AUTH_DYNAMIC_REDIRECT", sp.auth_dynamic_redirect ?? sp.authDynamicRedirect);
  }
}

function applyRobloxSection(ini) {
  const rb = ini?.roblox && typeof ini.roblox === "object" ? ini.roblox : {};

  if (rb.client_id || rb.clientId) setEnvOverride("ROBLOX_CLIENT_ID", rb.client_id || rb.clientId);
  if (rb.client_secret || rb.clientSecret) setEnvOverride("ROBLOX_CLIENT_SECRET", rb.client_secret || rb.clientSecret);
  // Legacy Roblox cookie-based auth fallback (needed for some endpoints like friend requests).
  // Stored under [roblox] in the INI but mapped to COOKIE for backward compatibility.
  if (rb.cookie != null) setEnvOverride("COOKIE", rb.cookie);
  if (rb.auth_redirect_uri || rb.authRedirectUri) {
    setEnvOverride("ROBLOX_AUTH_REDIRECT_URI", rb.auth_redirect_uri || rb.authRedirectUri);
  }
  if (rb.auth_scopes || rb.authScopes) setEnvOverride("ROBLOX_AUTH_SCOPES", rb.auth_scopes || rb.authScopes);
  if (rb.auth_force_verify != null || rb.authForceVerify != null) {
    setEnvOverride("ROBLOX_AUTH_FORCE_VERIFY", rb.auth_force_verify ?? rb.authForceVerify);
  }
  if (rb.auth_dynamic_redirect != null || rb.authDynamicRedirect != null) {
    setEnvOverride("ROBLOX_AUTH_DYNAMIC_REDIRECT", rb.auth_dynamic_redirect ?? rb.authDynamicRedirect);
  }
}

function applyDiscordSection(ini) {
  const dc = ini?.discord && typeof ini.discord === "object" ? ini.discord : {};
  if (dc.webhook_url || dc.webhookUrl) setEnvOverride("DISCORD_WEBHOOK_URL", dc.webhook_url || dc.webhookUrl);
  if (dc.bot_token || dc.botToken) setEnvOverride("DISCORD_BOT_TOKEN", dc.bot_token || dc.botToken);
  if (dc.guild_id || dc.guildId) setEnvOverride("GUILD_ID", dc.guild_id || dc.guildId);
  if (dc.channel_id || dc.channelId) setEnvOverride("DISCORD_CHANNEL_ID", dc.channel_id || dc.channelId);
  if (dc.announce_channel_id || dc.announceChannelId) {
    setEnvOverride("DISCORD_ANNOUNCE_CHANNEL_ID", dc.announce_channel_id || dc.announceChannelId);
  }
  if (dc.log_channel_id || dc.logChannelId) {
    setEnvOverride("DISCORD_LOG_CHANNEL_ID", dc.log_channel_id || dc.logChannelId);
  }
  if (dc.commands_enabled != null || dc.commandsEnabled != null) {
    setEnvOverride("DISCORD_COMMANDS_ENABLED", dc.commands_enabled ?? dc.commandsEnabled);
  }
  if (dc.command_channel_ids || dc.commandChannelIds) {
    setEnvOverride("DISCORD_COMMAND_CHANNEL_IDS", dc.command_channel_ids || dc.commandChannelIds);
  }
  if (dc.mod_role_ids || dc.modRoleIds) {
    setEnvOverride("DISCORD_MOD_ROLE_IDS", dc.mod_role_ids || dc.modRoleIds);
  }
  if (dc.relay_mode || dc.relayMode) {
    setEnvOverride("DISCORD_RELAY_MODE", dc.relay_mode || dc.relayMode);
  }
  if (dc.relay_debug != null || dc.relayDebug != null) {
    setEnvOverride("DISCORD_RELAY_DEBUG", dc.relay_debug ?? dc.relayDebug);
  }

  // Optional: Twitch chat -> Discord embed logs (batched).
  if (dc.twitch_chat_log_enabled != null || dc.twitchChatLogEnabled != null) {
    setEnvOverride("DISCORD_TWITCH_CHAT_LOG_ENABLED", dc.twitch_chat_log_enabled ?? dc.twitchChatLogEnabled);
  }
  if (dc.twitch_chat_log_commands_only != null || dc.twitchChatLogCommandsOnly != null) {
    setEnvOverride(
      "DISCORD_TWITCH_CHAT_LOG_COMMANDS_ONLY",
      dc.twitch_chat_log_commands_only ?? dc.twitchChatLogCommandsOnly
    );
  }
  if (dc.twitch_chat_log_mode || dc.twitchChatLogMode) {
    setEnvOverride("DISCORD_TWITCH_CHAT_LOG_MODE", dc.twitch_chat_log_mode || dc.twitchChatLogMode);
  }
  if (dc.twitch_chat_log_flush_ms != null || dc.twitchChatLogFlushMs != null) {
    setEnvOverride("DISCORD_TWITCH_CHAT_LOG_FLUSH_MS", dc.twitch_chat_log_flush_ms ?? dc.twitchChatLogFlushMs);
  }
  if (dc.twitch_chat_log_max_lines != null || dc.twitchChatLogMaxLines != null) {
    setEnvOverride("DISCORD_TWITCH_CHAT_LOG_MAX_LINES", dc.twitch_chat_log_max_lines ?? dc.twitchChatLogMaxLines);
  }
  if (dc.twitch_chat_log_channel_id || dc.twitchChatLogChannelId) {
    setEnvOverride("DISCORD_TWITCH_CHAT_LOG_CHANNEL_ID", dc.twitch_chat_log_channel_id || dc.twitchChatLogChannelId);
  }
}

function applyPajbotSection(ini) {
  const pb = ini?.pajbot && typeof ini.pajbot === "object" ? ini.pajbot : {};

  if (pb.enabled != null) setEnvOverride("PAJBOT_ENABLED", pb.enabled);
  if (pb.name) setEnvOverride("PAJBOT_NAME", pb.name);
  if (pb.oauth || pb.oauth_token || pb.oauthToken) {
    setEnvOverride("PAJBOT_OAUTH", pb.oauth || pb.oauth_token || pb.oauthToken);
  }
}

function applyStreamlabsSection(ini) {
  const sl =
    ini?.streamlabs && typeof ini.streamlabs === "object"
      ? ini.streamlabs
      : {};

  if (sl.socket_token || sl.socketToken || sl.token) {
    setEnvOverride("STREAMLABS_SOCKET_TOKEN", sl.socket_token || sl.socketToken || sl.token);
  }
}

function applyLinkSection(ini) {
  const link = ini?.link && typeof ini.link === "object" ? ini.link : {};

  if (link.mode != null) setEnvOverride("LINK_MODE", link.mode);
  if (link.provider != null) setEnvOverride("LINK_PROVIDER", link.provider);
  if (link.command_name || link.commandName) {
    setEnvOverride("LINK_COMMAND_NAME", link.command_name || link.commandName);
  }
  if (link.mobile_howto_url || link.mobileHowToUrl) {
    setEnvOverride("LINK_MOBILE_HOWTO_URL", link.mobile_howto_url || link.mobileHowToUrl);
  }
  if (link.reply_style || link.replyStyle) {
    setEnvOverride("LINK_REPLY_STYLE", link.reply_style || link.replyStyle);
  }
}

function safeJsonParse(text, fallback = null) {
  try {
    return JSON.parse(String(text ?? ""));
  } catch {
    return fallback;
  }
}

function ensureDirFor(filePath) {
  if (!filePath) return;
  const dir = path.dirname(filePath);
  ensureDir(dir);
}

function seedJsonFileIfMissing(destPath, value) {
  if (!destPath) return false;
  const abs = asAbs(destPath);
  if (fs.existsSync(abs)) return false;

  ensureDirFor(abs);
  fs.writeFileSync(abs, JSON.stringify(value ?? {}, null, 2), "utf8");
  return true;
}

function seedFileFromDiskIfMissing(destPath, sourcePath) {
  if (!destPath || !sourcePath) return false;
  const absDest = asAbs(destPath);
  if (fs.existsSync(absDest)) return false;

  const absSrc = asAbs(sourcePath);
  if (!fs.existsSync(absSrc)) return false;

  ensureDirFor(absDest);
  fs.copyFileSync(absSrc, absDest);
  return true;
}

function buildEmptyPlaytimeState() {
  return {
    totals: {},
    daily: {},
    current: { game: null, startedAt: null },
    stream: { live: false, startedAt: null, totals: {} },
  };
}

function buildEmptyQuotesState() {
  return { nextId: 1, quotes: [] };
}

function buildEmptyAubreyTabState() {
  const now = Date.now();
  return { balance: 0, lastTouchedMs: now, lastInterestAppliedMs: now };
}

function findLegacyWordsTemplate() {
  const dataRoot = asAbs("./data");
  if (!dataRoot || !fs.existsSync(dataRoot)) return "";
  try {
    const entries = fs.readdirSync(dataRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry?.isDirectory?.()) continue;
      const candidate = path.join(dataRoot, entry.name, "WORDS.json");
      if (!fs.existsSync(candidate)) continue;
      const stat = fs.statSync(candidate);
      if (stat.isFile() && stat.size > 2) {
        return candidate;
      }
    }
  } catch {}
  return "";
}

function seedWordsFileIfMissing(wordsPath) {
  if (!wordsPath) return;

  const candidates = [
    String(process.env.GLOBAL_WORDS_PATH || "").trim(),
    "./WORDS.json",
    "./archive/WORDS.json",
    findLegacyWordsTemplate(),
  ];

  const seen = new Set();
  for (const candidate of candidates) {
    const raw = String(candidate || "").trim();
    if (!raw) continue;
    const abs = asAbs(raw);
    if (!abs || seen.has(abs)) continue;
    seen.add(abs);
    if (seedFileFromDiskIfMissing(wordsPath, abs)) return;
  }

  seedJsonFileIfMissing(wordsPath, {});
}

function seedInstanceStateFiles() {
  const dataDir = String(process.env.DATA_DIR || "").trim();
  if (!dataDir) return;

  const backend = String(process.env.STATE_BACKEND || "file").trim().toLowerCase();
  const settingsPath = String(process.env.SETTINGS_PATH || "").trim();
  const streamsPath = String(process.env.STREAMS_PATH || "").trim();
  const quotesPath = String(process.env.QUOTES_PATH || "").trim();
  const userdataPath = String(process.env.USERDATA_PATH || "").trim();
  const predictiondataPath = String(process.env.PREDICTIONDATA_PATH || "").trim();
  const polldataPath = String(process.env.POLLDATA_PATH || "").trim();
  const wordsPath = String(process.env.WORDS_PATH || "").trim();
  const toUnfriendPath = String(process.env.TO_UNFRIEND_PATH || "").trim();
  const aubreyTabPath = String(process.env.AUBREY_TAB_PATH || "").trim();
  const playtimePath = String(process.env.PLAYTIME_PATH || "").trim();
  const gamepingRolesPath = String(process.env.GAMEPING_ROLES_PATH || "").trim();

  // These stay JSON even when state is in Postgres.
  if (quotesPath) {
    seedJsonFileIfMissing(quotesPath, buildEmptyQuotesState());
  }
  if (wordsPath) {
    seedWordsFileIfMissing(wordsPath);
  }
  if (gamepingRolesPath) {
    seedJsonFileIfMissing(gamepingRolesPath, { pings: {}, gameChangeRoleId: null });
  }

  // When using postgres state backend, avoid creating per-instance JSON state files.
  // State is stored in DB and fs reads/writes are intercepted by data/postgres/stateInterceptor.js.
  if (backend === "postgres" || backend === "pg") return;

  // SETTINGS.json: prefer copying the repo root default for a valid shape.
  if (settingsPath) {
    const seeded = seedFileFromDiskIfMissing(settingsPath, "./SETTINGS.json");
    if (!seeded) {
      // last-resort shape (avoids crashes when currentMode is missing)
      seedJsonFileIfMissing(settingsPath, {
        ks: false,
        timers: true,
        keywords: true,
        spamFilter: true,
        lengthFilter: false,
        linkFilter: true,
        linkAllowlist: [],
        currentMode: "!join.on",
        currentGame: "Website",
        titles: {},
        timer: {},
        validModes: [],
        specialModes: [],
        customModes: [],
        ignoreModes: [],
        corrections: {},
      });
    }
  }

  // STREAMS.json: seed with a minimal template at key "1" (required by app.js).
  if (streamsPath) {
    const absStreams = asAbs(streamsPath);
    if (!fs.existsSync(absStreams)) {
      let template = null;
      try {
        const base = safeJsonParse(fs.readFileSync(asAbs("./STREAMS.json"), "utf8"), null);
        if (base && typeof base === "object") {
          template = base["1"] || base[Object.keys(base)[0]] || null;
        }
      } catch {}

      if (!template || typeof template !== "object") {
        template = {
          date: new Date().toISOString(),
          ISODate: new Date().toISOString(),
          day: new Date().getDay(),
          length: "",
          streamStart: 0,
          streamEnd: 0,
          averageviewers: 0,
          averageViewersPer30Seconds: {},
          repeatLengthOffenders: {},
          repeatSpamOffenders: {},
        };
      }

      seedJsonFileIfMissing(streamsPath, { "1": template });
    }
  }

  // playtime.json: always start empty (don't copy any existing playtime from repo).
  if (playtimePath) {
    seedJsonFileIfMissing(playtimePath, buildEmptyPlaytimeState());
  }

  // WORDS.json is seeded once above (global/shared path).

  // USERDATA/PREDICTIONDATA/POLLDATA: start empty by default.
  if (userdataPath) {
    seedJsonFileIfMissing(userdataPath, {});
  }
  if (predictiondataPath) {
    seedJsonFileIfMissing(predictiondataPath, []);
  }
  if (polldataPath) {
    seedJsonFileIfMissing(polldataPath, {});
  }

  // TOUNFRIEND.json: empty object
  if (toUnfriendPath) {
    seedJsonFileIfMissing(toUnfriendPath, {});
  }

  // aubrey_tab.json: seed minimal ledger
  if (aubreyTabPath) {
    seedJsonFileIfMissing(aubreyTabPath, buildEmptyAubreyTabState());
  }
}

export async function bootstrapConfig() {
  const args = parseArgs(process.argv);
  const configPathRaw =
    args.config ||
    process.env.MAINSBOT_CONFIG ||
    process.env.MAINBOT_CONFIG ||
    "";
  const configPath = configPathRaw ? asAbs(configPathRaw) : "";

  if (configPath && fs.existsSync(configPath)) {
    clearAppEnvForIni();
    const ini = readIniFile(configPath);
    setEnvOverride("MAINSBOT_CONFIG", configPath);
    applyInstanceDefaults(ini);
    applyWebConfig(ini);
    applyStateConfig(ini);

    // Structured sections (recommended for new configs)
    applyModulesConfig(ini);
    applySettingsSection(ini);
    applyMessagesSection(ini);
    applyDatabaseSection(ini);
    applyTwitchSection(ini);
    applySpotifySection(ini);
    applyRobloxSection(ini);
    applyDiscordSection(ini);
    applyPajbotSection(ini);
    applyStreamlabsSection(ini);
    applyLinkSection(ini);
    applyGamepingSection(ini);

    // [env] is still supported for advanced/legacy overrides.
    applyEnvSection(ini);

    const secretsSection = ini?.secrets && typeof ini.secrets === "object" ? ini.secrets : {};
    const secretsPath = String(secretsSection.path || secretsSection.file || "").trim();
    if (secretsPath) {
      const secrets = readSecretsJson(secretsPath);
      applySecretsJson(secrets);
      setEnvOverride("SECRETS_PATH", asAbs(secretsPath));
    }

    seedInstanceStateFiles();

    return { mode: "ini", configPath };
  }

  throw new Error(
    "Missing INI config. Run: node main.js --config config/<instance>.ini"
  );
}
