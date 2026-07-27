# det7-discord-bot

DeepTeam7 Discord Bot — self-roles and channel permission sync with categories.

Runtime: **Bun**

## Setup

1. Copy `.env.example` → `.env` and fill in `DISCORD_TOKEN`, `CLIENT_ID`, and optionally `GUILD_ID`.
2. In the [Discord Developer Portal](https://discord.com/developers/applications): Bot → enable **Server Members Intent**.
3. Invite the bot with **Manage Roles** and **Manage Channels**.
4. Place the bot’s role **above** any self-assignable roles in the role list.
5. `bun install` → `bun run register` → `bun run dev`

Run tests: `bun test`

## Commands

- `/selfrole add|remove|list|panel` — self-assignable roles
- `/sync-channels all|category` — Sync Now for channels
- `/clear` — purge messages from a text channel
- `/config log-channel|panel-channel|show` — bot settings
