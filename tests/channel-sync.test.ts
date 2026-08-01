import { describe, expect, mock, test } from 'bun:test';
import {
  ChannelType,
  Collection,
  OverwriteType,
  PermissionFlagsBits,
  PermissionsBitField,
  type CategoryChannel,
  type Guild,
  type GuildBasedChannel,
  type Role,
  type TextChannel,
} from 'discord.js';
import {
  auditGuildChannelAccess,
  formatAuditReport,
  formatSyncResult,
  syncCategoryChannels,
  syncChannelWithParent,
  syncGuildChannels,
  type GuildAuditReport,
  type SyncResult,
} from '../src/lib/channel-sync.js';

describe('formatSyncResult', () => {
  test('formats empty result', () => {
    const result: SyncResult = { synced: [], skipped: [], failed: [] };
    const text = formatSyncResult(result);
    expect(text).toContain('Synced: **0**');
    expect(text).toContain('Skipped (already OK / no category): **0**');
  });

  test('includes synced channel names', () => {
    const result: SyncResult = {
      synced: ['general', 'voice-1'],
      skipped: ['archived'],
      failed: [],
    };
    const text = formatSyncResult(result);
    expect(text).toContain('Synced: **2**');
    expect(text).toContain('• general');
    expect(text).toContain('• voice-1');
    expect(text).toContain('Skipped (already OK / no category): **1**');
  });

  test('includes failures', () => {
    const result: SyncResult = {
      synced: [],
      skipped: [],
      failed: [{ name: 'broken', error: 'Missing Access' }],
    };
    const text = formatSyncResult(result);
    expect(text).toContain('Failed: **1**');
    expect(text).toContain('• broken: Missing Access');
  });
});

describe('formatAuditReport', () => {
  const emptyReport = (): GuildAuditReport => ({
    categories: [],
    issues: [],
    syncedCount: 0,
    outOfSyncCount: 0,
  });

  test('summarizes counts and healthy categories', () => {
    const report: GuildAuditReport = {
      ...emptyReport(),
      syncedCount: 3,
      categories: [
        {
          categoryName: 'General',
          categoryId: 'cat-1',
          childCount: 3,
          outOfSyncCount: 0,
          accessIssues: 0,
          accessRoles: ['Member'],
        },
      ],
    };

    const text = formatAuditReport(report);
    expect(text).toContain('**Audit:** 3 synced · 0 out of sync · 0 channel issues');
    expect(text).toContain('**General** (3 channels) — OK');
    expect(text).toContain('Access roles: @Member');
    expect(text).toContain('No access/sync problems found.');
  });

  test('lists problems with blocked roles and notes', () => {
    const report: GuildAuditReport = {
      syncedCount: 1,
      outOfSyncCount: 1,
      categories: [
        {
          categoryName: 'Games',
          categoryId: 'cat-2',
          childCount: 2,
          outOfSyncCount: 1,
          accessIssues: 1,
          accessRoles: ['CS2'],
        },
      ],
      issues: [
        {
          categoryName: 'Games',
          categoryId: 'cat-2',
          channelName: 'cs2-chat',
          channelId: 'ch-1',
          outOfSync: true,
          blockedRoles: ['CS2'],
          notes: ['Not synced with category (permissionsLocked = false)'],
        },
      ],
    };

    const text = formatAuditReport(report);
    expect(text).toContain('1 unsynced, 1 access issues');
    expect(text).toContain('**Problems:**');
    expect(text).toContain('• #cs2-chat ∈ Games — out of sync; blocked: @CS2');
    expect(text).toContain('↳ Not synced with category (permissionsLocked = false)');
  });

  test('shows placeholder when category has no access roles', () => {
    const report: GuildAuditReport = {
      ...emptyReport(),
      categories: [
        {
          categoryName: 'Staff',
          categoryId: 'cat-3',
          childCount: 0,
          outOfSyncCount: 0,
          accessIssues: 0,
          accessRoles: [],
        },
      ],
    };

    expect(formatAuditReport(report)).toContain('Access roles: (no role View allows)');
  });

  test('truncates long problem lists', () => {
    const issues = Array.from({ length: 5 }, (_, i) => ({
      categoryName: 'Cat',
      categoryId: 'c',
      channelName: `ch-${i}`,
      channelId: `id-${i}`,
      outOfSync: true,
      blockedRoles: [] as string[],
      notes: [] as string[],
    }));

    const report: GuildAuditReport = {
      syncedCount: 0,
      outOfSyncCount: 5,
      categories: [],
      issues,
    };

    const text = formatAuditReport(report, 2);
    expect(text).toContain('• #ch-0 ∈ Cat — out of sync');
    expect(text).toContain('• #ch-1 ∈ Cat — out of sync');
    expect(text).not.toContain('• #ch-2 ∈ Cat');
    expect(text).toContain('…and 3 more');
  });
});

function overwrite(
  id: string,
  type: OverwriteType,
  allow = 0n,
  deny = 0n,
) {
  return {
    id,
    type,
    allow: new PermissionsBitField(allow),
    deny: new PermissionsBitField(deny),
  };
}

function mockRole(id: string, name: string): Role {
  return {
    id,
    name,
  } as Role;
}

function mockTextChannel(opts: {
  id: string;
  name: string;
  parentId: string | null;
  permissionsLocked: boolean;
  overwrites?: ReturnType<typeof overwrite>[];
  roleAccess?: Record<string, { view: boolean; connect?: boolean }>;
  lockPermissions?: () => Promise<void>;
}): TextChannel {
  const overwriteCache = new Collection(
    (opts.overwrites ?? []).map((o) => [o.id, o]),
  );

  return {
    id: opts.id,
    name: opts.name,
    type: ChannelType.GuildText,
    parentId: opts.parentId,
    permissionsLocked: opts.permissionsLocked,
    permissionOverwrites: { cache: overwriteCache },
    lockPermissions: opts.lockPermissions ?? mock(async () => undefined),
    permissionsFor(role: Role) {
      const access = opts.roleAccess?.[role.id];
      if (!access?.view) return null;
      let bits = PermissionFlagsBits.ViewChannel;
      if (access.connect !== false) bits |= PermissionFlagsBits.Connect;
      return new PermissionsBitField(bits);
    },
  } as unknown as TextChannel;
}

function mockCategory(opts: {
  id: string;
  name: string;
  position?: number;
  guildId: string;
  guild: Guild;
  overwrites?: ReturnType<typeof overwrite>[];
  children?: GuildBasedChannel[];
}): CategoryChannel {
  const overwriteCache = new Collection(
    (opts.overwrites ?? []).map((o) => [o.id, o]),
  );
  const childrenCache = new Collection(
    (opts.children ?? []).map((c) => [c.id, c]),
  );

  return {
    id: opts.id,
    name: opts.name,
    type: ChannelType.GuildCategory,
    position: opts.position ?? 0,
    guild: opts.guild,
    permissionOverwrites: { cache: overwriteCache },
    children: { cache: childrenCache },
  } as unknown as CategoryChannel;
}

describe('syncChannelWithParent', () => {
  test('skips channels without a parent', async () => {
    const channel = mockTextChannel({
      id: '1',
      name: 'orphan',
      parentId: null,
      permissionsLocked: false,
    });
    expect(await syncChannelWithParent(channel)).toBe('skipped');
  });

  test('skips already locked channels', async () => {
    const lockPermissions = mock(async () => undefined);
    const channel = mockTextChannel({
      id: '1',
      name: 'synced',
      parentId: 'cat',
      permissionsLocked: true,
      lockPermissions,
    });
    expect(await syncChannelWithParent(channel)).toBe('skipped');
    expect(lockPermissions).not.toHaveBeenCalled();
  });

  test('locks permissions when out of sync', async () => {
    const lockPermissions = mock(async () => undefined);
    const channel = mockTextChannel({
      id: '1',
      name: 'general',
      parentId: 'cat',
      permissionsLocked: false,
      lockPermissions,
    });
    expect(await syncChannelWithParent(channel)).toBe('synced');
    expect(lockPermissions).toHaveBeenCalledTimes(1);
  });
});

describe('syncCategoryChannels', () => {
  test('syncs out-of-sync children and skips locked ones', async () => {
    const guild = { id: 'guild-1' } as Guild;
    const synced = mockTextChannel({
      id: 'a',
      name: 'ok',
      parentId: 'cat',
      permissionsLocked: true,
    });
    const needsSync = mockTextChannel({
      id: 'b',
      name: 'drift',
      parentId: 'cat',
      permissionsLocked: false,
    });
    const category = mockCategory({
      id: 'cat',
      name: 'General',
      guildId: guild.id,
      guild,
      children: [synced, needsSync],
    });

    const result = await syncCategoryChannels(category);
    expect(result.synced).toEqual(['drift']);
    expect(result.skipped).toEqual(['ok']);
    expect(result.failed).toEqual([]);
  });

  test('records failures from lockPermissions', async () => {
    const guild = { id: 'guild-1' } as Guild;
    const broken = mockTextChannel({
      id: 'x',
      name: 'broken',
      parentId: 'cat',
      permissionsLocked: false,
      lockPermissions: mock(async () => {
        throw new Error('Missing Access');
      }),
    });
    const category = mockCategory({
      id: 'cat',
      name: 'General',
      guildId: guild.id,
      guild,
      children: [broken],
    });

    const result = await syncCategoryChannels(category);
    expect(result.failed).toEqual([{ name: 'broken', error: 'Missing Access' }]);
  });
});

describe('syncGuildChannels', () => {
  test('onlyOutOfSync skips already locked channels', async () => {
    const locked = mockTextChannel({
      id: '1',
      name: 'locked',
      parentId: 'cat',
      permissionsLocked: true,
    });
    const drift = mockTextChannel({
      id: '2',
      name: 'drift',
      parentId: 'cat',
      permissionsLocked: false,
    });
    const guild = {
      channels: {
        cache: new Collection<string, GuildBasedChannel>([
          [locked.id, locked],
          [drift.id, drift],
        ]),
      },
    } as unknown as Guild;

    const result = await syncGuildChannels(guild, true);
    expect(result.synced).toEqual(['drift']);
    expect(result.skipped).toEqual(['locked']);
  });

  test('force mode re-syncs already locked channels', async () => {
    const lockPermissions = mock(async () => undefined);
    const locked = mockTextChannel({
      id: '1',
      name: 'locked',
      parentId: 'cat',
      permissionsLocked: true,
      lockPermissions,
    });
    const guild = {
      channels: {
        cache: new Collection<string, GuildBasedChannel>([[locked.id, locked]]),
      },
    } as unknown as Guild;

    const result = await syncGuildChannels(guild, false);
    expect(result.synced).toEqual(['locked']);
    expect(result.skipped).toEqual([]);
    expect(lockPermissions).toHaveBeenCalledTimes(1);
  });
});

describe('auditGuildChannelAccess', () => {
  test('reports synced channels and blocked access roles', async () => {
    const guildId = 'guild-1';
    const roleId = 'role-cs2';
    const role = mockRole(roleId, 'CS2');

    const rolesCache = new Collection<string, Role>([[roleId, role]]);

    const guild = {
      id: guildId,
      channels: {
        fetch: mock(async () => undefined),
        cache: new Collection<string, GuildBasedChannel>(),
      },
      roles: {
        fetch: mock(async () => undefined),
        cache: rolesCache,
      },
    } as unknown as Guild;

    const okChannel = mockTextChannel({
      id: 'ch-ok',
      name: 'lobby',
      parentId: 'cat-1',
      permissionsLocked: true,
      roleAccess: { [roleId]: { view: true } },
    });
    const blockedChannel = mockTextChannel({
      id: 'ch-bad',
      name: 'secret',
      parentId: 'cat-1',
      permissionsLocked: false,
      overwrites: [
        overwrite(roleId, OverwriteType.Role, 0n, PermissionFlagsBits.ViewChannel),
      ],
      roleAccess: { [roleId]: { view: false } },
    });

    const category = mockCategory({
      id: 'cat-1',
      name: 'Games',
      guildId,
      guild,
      overwrites: [
        overwrite(roleId, OverwriteType.Role, PermissionFlagsBits.ViewChannel),
        overwrite(guildId, OverwriteType.Role, 0n, PermissionFlagsBits.ViewChannel),
      ],
      children: [okChannel, blockedChannel],
    });

    guild.channels.cache.set(category.id, category);

    const report = await auditGuildChannelAccess(guild);

    expect(report.syncedCount).toBe(1);
    expect(report.outOfSyncCount).toBe(1);
    expect(report.categories).toHaveLength(1);
    expect(report.categories[0].accessRoles).toEqual(['CS2']);
    expect(report.categories[0].outOfSyncCount).toBe(1);
    expect(report.categories[0].accessIssues).toBe(1);

    const issue = report.issues.find((i) => i.channelName === 'secret');
    expect(issue).toBeDefined();
    expect(issue!.outOfSync).toBe(true);
    expect(issue!.blockedRoles).toEqual(['CS2']);
    expect(issue!.notes.some((n) => n.includes('@CS2'))).toBe(true);
  });

  test('ignores @everyone View allow when collecting access roles', async () => {
    const guildId = 'guild-1';
    const guild = {
      id: guildId,
      channels: {
        fetch: mock(async () => undefined),
        cache: new Collection<string, GuildBasedChannel>(),
      },
      roles: {
        fetch: mock(async () => undefined),
        cache: new Collection<string, Role>(),
      },
    } as unknown as Guild;

    const child = mockTextChannel({
      id: 'ch-1',
      name: 'public',
      parentId: 'cat-1',
      permissionsLocked: true,
    });
    const category = mockCategory({
      id: 'cat-1',
      name: 'Public',
      guildId,
      guild,
      overwrites: [
        overwrite(guildId, OverwriteType.Role, PermissionFlagsBits.ViewChannel),
      ],
      children: [child],
    });
    guild.channels.cache.set(category.id, category);

    const report = await auditGuildChannelAccess(guild);
    expect(report.categories[0].accessRoles).toEqual([]);
    expect(report.syncedCount).toBe(1);
    expect(report.issues).toEqual([]);
  });
});
