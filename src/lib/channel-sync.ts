import {
  ChannelType,
  type CategoryChannel,
  type Guild,
  type GuildBasedChannel,
  type TextChannel,
  type VoiceChannel,
  type ForumChannel,
  type NewsChannel,
  type StageChannel,
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

/**
 * Syncs channel permission overwrites with its parent category
 * (same as Discord UI: Edit Channel → Permissions → Sync Now).
 */
export async function syncChannelWithParent(channel: SyncableChannel): Promise<'synced' | 'skipped'> {
  if (!channel.parentId) return 'skipped';
  if (channel.permissionsLocked) return 'skipped';
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

  for (const channel of guild.channels.cache.values()) {
    if (!isSyncable(channel) || !channel.parentId) {
      continue;
    }
    if (onlyOutOfSync && channel.permissionsLocked) {
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

export function formatSyncResult(result: SyncResult): string {
  const lines: string[] = [];
  lines.push(`Zsynchronizowano: **${result.synced.length}**`);
  if (result.synced.length) lines.push(result.synced.map((n) => `• ${n}`).join('\n'));
  lines.push(`Pominięto (już OK / brak kategorii): **${result.skipped.length}**`);
  if (result.failed.length) {
    lines.push(`Błędy: **${result.failed.length}**`);
    lines.push(result.failed.map((f) => `• ${f.name}: ${f.error}`).join('\n'));
  }
  return lines.join('\n');
}
