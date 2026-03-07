# Changelog

All notable changes to this project should be documented here.

## [3.0.0] - 2026-03-07

Major release focused on moving the bot from single-instance/file-first behavior to a multi-instance service layout with database-backed state, split web hosting, and a larger admin surface.

### Added

- Split runtime entry points for bot and web:
  - `main.js`
  - `main-web.js`
- Socket-first web hosting for production with per-instance Unix socket paths.
- Prediction overlay page and overlay websocket endpoint for OBS/browser sources.
- Owner/admin dashboards for:
  - settings
  - keywords
  - quotes
  - redemptions
  - activity log
  - channel points analytics
- Postgres-backed storage for:
  - keywords
  - custom commands
  - state/settings
  - channel point analytics
  - tab/misc state
- Redis-backed token storage for:
  - Twitch
  - Roblox
  - Spotify
- Keyword JSON import into the database.
- Website theming from the streamer Twitch chat color.
- Spotify auto-announce support from the admin dashboard.
- Poll chat announcers from the admin dashboard:
  - poll created
  - poll completed with winner-aware channel-point spend variants
- Richer keyword management UI:
  - row/list editor
  - per-keyword custom response templates
  - JSON import/export workflow
- Theme toggle support across public pages and admin pages.
- Build metadata in the UI footer:
  - version
  - branch
  - commit
  - commit count
  - last commit timestamp

### Changed

- Raised runtime target to Node 20.
- Version/build reporting now comes from `package.json` + git metadata.
- Web/admin frontend is more modular and resilient to partial API failures.
- Website layout direction moved toward a cleaner structured shell while keeping the existing visual identity.
- Twitch outbound chat is Helix-first.
- Twitch inbound chat intake now uses TMI/IRC read-only mode, separated from outbound Helix sending.
- Discord compatibility layer now supports the current repo import style more safely.
- Footer/version display now matches release-style build output instead of showing the site URL.
- Discord chat log embeds now avoid duplicate profile images.
- Systemd socket layout is per-instance instead of sharing one runtime directory.
- Admin settings now favor slider-style toggles over raw checkboxes.
- Redemptions admin now returns clearer Twitch permission diagnostics for `403` reward API failures.

### Fixed

- Web split-service `502/504` issues caused by bad socket binding assumptions and shared runtime cleanup.
- Incorrect offline state in split web mode.
- Misleading commands-page status card showing `OFFLINE` when only web status was available.
- Admin page blank-screen failure paths.
- Light theme contrast issues.
- Twitch bot identity resolution inconsistencies between config/env and stored token metadata.
- IRC/Twitch command intake path visibility by adding clearer IRC connection logs.
- Toggle/settings writes using the wrong settings file path.
- Roblox presence/game lookup fallback behavior.
- Channel-point reward/redemption Helix auth now uses the streamer token identity as the authoritative broadcaster for reward APIs.
- Reward update/delete/fulfill failures now explain broadcaster/token mismatches and same-client-ID restrictions more clearly.

### Removed

- JSON fallback for OAuth token storage.
- IRC fallback for outbound Twitch chat sends.
- Footer dependence on public URL/host display.

### Operational notes

- `v3.0.0` assumes Node `20.x`.
- Twitch, Roblox, and Spotify OAuth tokens are expected in Redis.
- State is expected in Postgres for multi-instance deployments.
- Recommended production deployment is:
  - `mainsbot@<instance>`
  - `mainsbot-web@<instance>`
  - Nginx proxying to per-instance Unix sockets

## [2.x]

Older pre-multi-instance/file-first builds before the database and split-service migration.
