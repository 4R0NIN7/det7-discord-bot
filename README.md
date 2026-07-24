# det7-discord-bot

DeepTeam7 Discord Bot — self-roles + sync uprawnień kanałów z kategoriami.

Runtime: **Bun**

## Setup

1. Skopiuj `.env.example` → `.env` i uzupełnij `DISCORD_TOKEN`, `CLIENT_ID`, opcjonalnie `GUILD_ID`.
2. W [Discord Developer Portal](https://discord.com/developers/applications): Bot → włącz **Server Members Intent**.
3. Zaproś bota z uprawnieniami: Manage Roles, Manage Channels.
4. Rangę bota ustaw **wyżej** niż self-rangi na liście ról.
5. `bun install` → `bun run register` → `bun run dev`

## Komendy

- `/selfrole add|remove|list|panel` — self-rangi
- `/sync-channels all|category` — Sync Now dla kanałów
