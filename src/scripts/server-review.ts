/**
 * Broader server health check.
 * Usage: bun src/scripts/server-review.ts
 */
import {
  ChannelType,
  Client,
  GatewayIntentBits,
  OverwriteType,
  PermissionFlagsBits,
} from 'discord.js';
import { config } from '../config.js';
import { getGuildSelfRoles } from '../lib/self-roles-store.js';
import { getGuildConfig } from '../lib/guild-config-store.js';
import { auditGuildChannelAccess } from '../lib/channel-sync.js';

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('clientReady', async () => {
  try {
    const guildId = config.guildId;
    if (!guildId) throw new Error('GUILD_ID required');

    const guild = await client.guilds.fetch(guildId);
    await guild.channels.fetch();
    await guild.roles.fetch();
    const me = await guild.members.fetchMe();

    const findings: string[] = [];
    const ok: string[] = [];

    // --- Channel audit ---
    const audit = await auditGuildChannelAccess(guild);
    if (audit.outOfSyncCount === 0 && audit.issues.filter((i) => i.blockedRoles.length).length === 0) {
      ok.push(`All ${audit.syncedCount} categorized channels are synced with categories`);
    } else {
      findings.push(`${audit.outOfSyncCount} channels out of sync with their category`);
    }

    // --- Categories without role View allows ---
    for (const cat of audit.categories) {
      const category = guild.channels.cache.get(cat.categoryId);
      if (!category || category.type !== ChannelType.GuildCategory) continue;
      const everyone = category.permissionOverwrites.cache.get(guild.id);
      const everyoneDenied = everyone?.deny.has(PermissionFlagsBits.ViewChannel) ?? false;
      if (everyoneDenied && cat.accessRoles.length === 0) {
        findings.push(
          `Category "${cat.categoryName}" hides @everyone but has no role with View Channel allow — may be staff-only or misconfigured`,
        );
      }
      if (!everyoneDenied && cat.accessRoles.length === 0 && cat.childCount > 0) {
        ok.push(`Category "${cat.categoryName}" looks public (${cat.childCount} channels)`);
      }
    }

    // --- Channels without category ---
    const uncategorized = guild.channels.cache.filter(
      (c) =>
        c.type !== ChannelType.GuildCategory &&
        !c.isThread() &&
        'parentId' in c &&
        !c.parentId,
    );
    if (uncategorized.size > 0) {
      findings.push(
        `${uncategorized.size} channels without a category: ${[...uncategorized.values()].map((c) => c.name).join(', ')}`,
      );
    } else {
      ok.push('No uncategorized channels');
    }

    // --- Self-roles ---
    const selfRoles = await getGuildSelfRoles(guildId);
    const guildCfg = await getGuildConfig(guildId);

    if (selfRoles.roles.length === 0) {
      findings.push('No self-roles configured yet (`/selfrole add`)');
    } else {
      ok.push(`${selfRoles.roles.length} self-role(s) configured`);
      for (const entry of selfRoles.roles) {
        const role = guild.roles.cache.get(entry.roleId);
        if (!role) {
          findings.push(`Self-role "${entry.label}" (${entry.roleId}) no longer exists on the server`);
          continue;
        }
        if (role.managed) {
          findings.push(`Self-role @${role.name} is managed/integration — bot cannot assign it`);
        }
        if (me.roles.highest.comparePositionTo(role) <= 0) {
          findings.push(
            `Bot role "${me.roles.highest.name}" is not above self-role @${role.name} — assignments will fail`,
          );
        }
      }
    }

    if (!selfRoles.panelChannelId || !selfRoles.panelMessageId) {
      findings.push('Self-role panel not posted yet (`/selfrole panel`)');
    } else {
      try {
        const ch = await client.channels.fetch(selfRoles.panelChannelId);
        if (!ch || !ch.isTextBased() || ch.isDMBased()) {
          findings.push('Stored self-role panel channel is invalid');
        } else {
          await ch.messages.fetch(selfRoles.panelMessageId);
          ok.push(`Self-role panel message exists in #${'name' in ch ? ch.name : selfRoles.panelChannelId}`);
        }
      } catch {
        findings.push('Self-role panel message missing (deleted?) — repost with `/selfrole panel`');
      }
    }

    if (!guildCfg.logChannelId) {
      findings.push('Bot log channel not set (`/config log-channel`)');
    } else {
      const logCh = guild.channels.cache.get(guildCfg.logChannelId);
      ok.push(logCh ? `Log channel set: #${logCh.name}` : 'Log channel ID set (channel may be missing)');
    }

    if (!guildCfg.selfrolePanelChannelId) {
      findings.push('Panel channel restriction not set (optional: `/config panel-channel`)');
    }

    // --- Bot permissions ---
    const needed = [
      ['View Channel', PermissionFlagsBits.ViewChannel],
      ['Manage Channels', PermissionFlagsBits.ManageChannels],
      ['Manage Roles', PermissionFlagsBits.ManageRoles],
      ['Manage Messages', PermissionFlagsBits.ManageMessages],
      ['Send Messages', PermissionFlagsBits.SendMessages],
      ['Embed Links', PermissionFlagsBits.EmbedLinks],
    ] as const;

    for (const [label, bit] of needed) {
      if (!me.permissions.has(bit)) {
        findings.push(`Bot is missing permission: ${label}`);
      }
    }
    if (needed.every(([, bit]) => me.permissions.has(bit))) {
      ok.push('Bot has all core permissions');
    }

    // --- Role hygiene ---
    const duplicateNames = new Map<string, number>();
    for (const role of guild.roles.cache.values()) {
      if (role.id === guild.id) continue;
      const key = role.name.toLowerCase();
      duplicateNames.set(key, (duplicateNames.get(key) ?? 0) + 1);
    }
    for (const [name, count] of duplicateNames) {
      if (count > 1) findings.push(`Duplicate role name "${name}" ×${count}`);
    }

    // --- Category × self-role alignment hints ---
    const selfRoleNames = new Set(
      selfRoles.roles
        .map((r) => guild.roles.cache.get(r.roleId)?.name)
        .filter(Boolean) as string[],
    );
    for (const cat of audit.categories) {
      if (cat.accessRoles.length === 0) continue;
      const missingFromSelf = cat.accessRoles.filter(
        (r) =>
          !['DET7', 'wunderbares Team', 'PatchBot'].includes(r) &&
          !selfRoleNames.has(r),
      );
      // Suggest game roles as self-roles if not already
      for (const r of missingFromSelf) {
        if (['Faceit', 'WoW', 'CS2', 'DayZ', 'Arma'].some((g) => r.includes(g) || g.includes(r))) {
          findings.push(
            `Category "${cat.categoryName}" uses @${r} but it is not in self-roles — members cannot self-assign it`,
          );
        }
      }
    }

    // Also check: game categories that only have DET7
    for (const cat of audit.categories) {
      const gameLike = /arma|wow|dayz|cs|faceit|taktik/i.test(cat.categoryName);
      if (!gameLike) continue;
      const onlyDet7 =
        cat.accessRoles.length > 0 &&
        cat.accessRoles.every((r) => ['DET7', 'wunderbares Team', 'PatchBot'].includes(r));
      if (onlyDet7 && !cat.accessRoles.some((r) => selfRoleNames.has(r))) {
        findings.push(
          `Category "${cat.categoryName}" is gated only by ${cat.accessRoles.map((r) => `@${r}`).join(', ')} — consider a dedicated game self-role if non-DET7 members should see it`,
        );
      }
    }

    console.log('=== SERVER REVIEW ===');
    console.log(`Guild: ${guild.name} (${guild.id})`);
    console.log(`Bot: ${me.user.tag} | highest role: ${me.roles.highest.name}`);
    console.log(`Members approx: ${guild.memberCount}`);
    console.log(`Channels: ${guild.channels.cache.size} | Roles: ${guild.roles.cache.size}`);
    console.log('');
    console.log('--- OK ---');
    for (const line of ok) console.log(`✓ ${line}`);
    console.log('');
    console.log('--- SUGGESTIONS / ISSUES ---');
    if (findings.length === 0) console.log('(none)');
    else for (const line of findings) console.log(`• ${line}`);

    console.log('\n--- CATEGORY MAP ---');
    for (const cat of audit.categories) {
      console.log(
        `${cat.categoryName}: ${cat.childCount} ch | roles=[${cat.accessRoles.join(', ') || '—'}] | unsynced=${cat.outOfSyncCount}`,
      );
    }
  } catch (err) {
    console.error(err);
    process.exitCode = 1;
  } finally {
    client.destroy();
  }
});

await client.login(config.token);
