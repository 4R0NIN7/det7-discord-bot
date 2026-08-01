import {
  ChannelType,
  OverwriteType,
  PermissionFlagsBits,
  type CategoryChannel,
  type ForumChannel,
  type Guild,
  type GuildBasedChannel,
  type GuildChannel,
  type NewsChannel,
  type Role,
  type StageChannel,
  type TextChannel,
  type VoiceChannel,
} from 'discord.js';

type SyncableChannel =
  | TextChannel
  | VoiceChannel
  | ForumChannel
  | NewsChannel
  | StageChannel;

function isSyncable(channel: GuildBasedChannel): channel is SyncableChannel {
  return (
    channel.type === ChannelType.GuildText ||
    channel.type === ChannelType.GuildVoice ||
    channel.type === ChannelType.GuildForum ||
    channel.type === ChannelType.GuildAnnouncement ||
    channel.type === ChannelType.GuildStageVoice
  );
}

export interface SyncResult {
  synced: string[];
  skipped: string[];
  failed: { name: string; error: string }[];
}

export interface ChannelAuditIssue {
  categoryName: string;
  categoryId: string;
  channelName: string;
  channelId: string;
  /** Channel is not synced with its parent category. */
  outOfSync: boolean;
  /** Roles that can see the category but cannot use this channel. */
  blockedRoles: string[];
  notes: string[];
}

export interface CategoryAuditSummary {
  categoryName: string;
  categoryId: string;
  childCount: number;
  outOfSyncCount: number;
  accessIssues: number;
  /** Roles with View Channel allow on the category. */
  accessRoles: string[];
}

export interface GuildAuditReport {
  categories: CategoryAuditSummary[];
  issues: ChannelAuditIssue[];
  syncedCount: number;
  outOfSyncCount: number;
}

/**
 * Syncs channel permission overwrites with its parent category
 * (same as Discord UI: Edit Channel → Permissions → Sync Now).
 */
export async function syncChannelWithParent(
  channel: SyncableChannel,
  force = false,
): Promise<'synced' | 'skipped'> {
  if (!channel.parentId) return 'skipped';
  if (!force && channel.permissionsLocked) return 'skipped';
  await channel.lockPermissions();
  return 'synced';
}

export async function syncCategoryChannels(category: CategoryChannel): Promise<SyncResult> {
  const result: SyncResult = { synced: [], skipped: [], failed: [] };

  for (const channel of category.children.cache.values()) {
    if (!isSyncable(channel)) {
      result.skipped.push(channel.name);
      continue;
    }
    try {
      const status = await syncChannelWithParent(channel);
      if (status === 'synced') result.synced.push(channel.name);
      else result.skipped.push(channel.name);
    } catch (err) {
      result.failed.push({
        name: channel.name,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return result;
}

export async function syncGuildChannels(guild: Guild, onlyOutOfSync = true): Promise<SyncResult> {
  const result: SyncResult = { synced: [], skipped: [], failed: [] };
  const force = !onlyOutOfSync;

  for (const channel of guild.channels.cache.values()) {
    if (!isSyncable(channel) || !channel.parentId) {
      continue;
    }
    if (onlyOutOfSync && channel.permissionsLocked) {
      result.skipped.push(channel.name);
      continue;
    }
    try {
      const status = await syncChannelWithParent(channel, force);
      if (status === 'synced') result.synced.push(channel.name);
      else result.skipped.push(channel.name);
    } catch (err) {
      result.failed.push({
        name: channel.name,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return result;
}

function roleHasViewAllow(channel: GuildChannel, roleId: string): boolean {
  const overwrite = channel.permissionOverwrites.cache.get(roleId);
  if (!overwrite) return false;
  return overwrite.allow.has(PermissionFlagsBits.ViewChannel);
}

function roleIsDeniedView(channel: GuildChannel, roleId: string): boolean {
  const overwrite = channel.permissionOverwrites.cache.get(roleId);
  if (!overwrite) return false;
  return overwrite.deny.has(PermissionFlagsBits.ViewChannel);
}

function roleCanUseChannel(channel: GuildChannel, role: Role): boolean {
  if (roleIsDeniedView(channel, role.id)) return false;

  const perms = channel.permissionsFor(role);
  if (!perms?.has(PermissionFlagsBits.ViewChannel)) return false;

  if (channel.type === ChannelType.GuildVoice || channel.type === ChannelType.GuildStageVoice) {
    return perms.has(PermissionFlagsBits.Connect);
  }

  return true;
}

/** Roles with an explicit View Channel allow on the category (excluding @everyone). */
function categoryAccessRoles(category: CategoryChannel): Role[] {
  const roles: Role[] = [];
  for (const overwrite of category.permissionOverwrites.cache.values()) {
    if (overwrite.type !== OverwriteType.Role) continue;
    if (!overwrite.allow.has(PermissionFlagsBits.ViewChannel)) continue;
    if (overwrite.id === category.guild.id) continue;
    const role = category.guild.roles.cache.get(overwrite.id);
    if (role) roles.push(role);
  }
  return roles;
}

/**
 * Audits categories: channels should inherit category access so role members can use them.
 */
export async function auditGuildChannelAccess(guild: Guild): Promise<GuildAuditReport> {
  await guild.channels.fetch();
  await guild.roles.fetch();

  const categories = guild.channels.cache
    .filter((c) => c.type === ChannelType.GuildCategory)
    .map((c) => c as CategoryChannel)
    .sort((a, b) => a.position - b.position);

  const report: GuildAuditReport = {
    categories: [],
    issues: [],
    syncedCount: 0,
    outOfSyncCount: 0,
  };

  for (const category of categories) {
    const accessRoles = categoryAccessRoles(category);
    const children = [...category.children.cache.values()].filter(isSyncable);
    let outOfSyncCount = 0;
    let accessIssues = 0;

    for (const channel of children) {
      const outOfSync = !channel.permissionsLocked;
      if (outOfSync) {
        outOfSyncCount += 1;
        report.outOfSyncCount += 1;
      } else {
        report.syncedCount += 1;
      }

      const blockedRoles: string[] = [];
      for (const role of accessRoles) {
        if (!roleCanUseChannel(channel, role)) {
          blockedRoles.push(role.name);
        }
      }

      const notes: string[] = [];
      if (outOfSync) notes.push('Not synced with category (permissionsLocked = false)');
      for (const role of accessRoles) {
        if (roleHasViewAllow(category, role.id) && roleIsDeniedView(channel, role.id)) {
          notes.push(`Role @${role.name} is denied View Channel on this channel`);
        }
      }

      if (blockedRoles.length || outOfSync || notes.length) {
        if (blockedRoles.length) accessIssues += 1;
        report.issues.push({
          categoryName: category.name,
          categoryId: category.id,
          channelName: channel.name,
          channelId: channel.id,
          outOfSync,
          blockedRoles,
          notes,
        });
      }
    }

    report.categories.push({
      categoryName: category.name,
      categoryId: category.id,
      childCount: children.length,
      outOfSyncCount,
      accessIssues,
      accessRoles: accessRoles.map((r) => r.name),
    });
  }

  return report;
}

export function formatAuditReport(report: GuildAuditReport, maxIssues = 40): string {
  const lines: string[] = [];
  lines.push(
    `**Audit:** ${report.syncedCount} synced · ${report.outOfSyncCount} out of sync · ${report.issues.length} channel issues`,
  );
  lines.push('');

  for (const cat of report.categories) {
    const status =
      cat.outOfSyncCount === 0 && cat.accessIssues === 0
        ? 'OK'
        : `${cat.outOfSyncCount} unsynced, ${cat.accessIssues} access issues`;
    const roles =
      cat.accessRoles.length > 0 ? cat.accessRoles.map((r) => `@${r}`).join(', ') : '(no role View allows)';
    lines.push(`**${cat.categoryName}** (${cat.childCount} channels) — ${status}`);
    lines.push(`Access roles: ${roles}`);
  }

  const problemIssues = report.issues.filter((i) => i.outOfSync || i.blockedRoles.length > 0);
  if (problemIssues.length) {
    lines.push('');
    lines.push('**Problems:**');
    for (const issue of problemIssues.slice(0, maxIssues)) {
      const bits: string[] = [];
      if (issue.outOfSync) bits.push('out of sync');
      if (issue.blockedRoles.length) bits.push(`blocked: ${issue.blockedRoles.map((r) => `@${r}`).join(', ')}`);
      lines.push(`• #${issue.channelName} ∈ ${issue.categoryName} — ${bits.join('; ')}`);
      for (const note of issue.notes) lines.push(`  ↳ ${note}`);
    }
    if (problemIssues.length > maxIssues) {
      lines.push(`…and ${problemIssues.length - maxIssues} more`);
    }
  } else {
    lines.push('');
    lines.push('No access/sync problems found.');
  }

  return lines.join('\n').slice(0, 3900);
}

export function formatSyncResult(result: SyncResult): string {
  const lines: string[] = [];
  lines.push(`Synced: **${result.synced.length}**`);
  if (result.synced.length) lines.push(result.synced.map((n) => `• ${n}`).join('\n'));
  lines.push(`Skipped (already OK / no category): **${result.skipped.length}**`);
  if (result.failed.length) {
    lines.push(`Failed: **${result.failed.length}**`);
    lines.push(result.failed.map((f) => `• ${f.name}: ${f.error}`).join('\n'));
  }
  return lines.join('\n');
}
