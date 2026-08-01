/**
 * One-off live audit of guild category → channel permission access.
 * Usage: bun src/scripts/audit-channels.ts
 */
import { Client, GatewayIntentBits } from 'discord.js';
import { config } from '../config.js';
import { auditGuildChannelAccess, formatAuditReport } from '../lib/channel-sync.js';

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('ready', async () => {
  try {
    const guildId = config.guildId;
    if (!guildId) {
      console.error('GUILD_ID is required in .env for this audit.');
      process.exit(1);
    }

    const guild = await client.guilds.fetch(guildId);
    await guild.channels.fetch();
    await guild.roles.fetch();

    const report = await auditGuildChannelAccess(guild);
    console.log(formatAuditReport(report, 80));
    console.log('\n--- JSON summary ---');
    console.log(
      JSON.stringify(
        {
          syncedCount: report.syncedCount,
          outOfSyncCount: report.outOfSyncCount,
          issueCount: report.issues.length,
          categories: report.categories.map((c) => ({
            name: c.categoryName,
            children: c.childCount,
            outOfSync: c.outOfSyncCount,
            accessIssues: c.accessIssues,
            accessRoles: c.accessRoles,
          })),
          issues: report.issues.filter((i) => i.outOfSync || i.blockedRoles.length > 0),
        },
        null,
        2,
      ),
    );
  } catch (err) {
    console.error(err);
    process.exitCode = 1;
  } finally {
    client.destroy();
  }
});

await client.login(config.token);
