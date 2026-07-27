import { afterEach, describe, expect, test } from 'bun:test';
import {
  addSelfRole,
  getGuildSelfRoles,
  removeSelfRole,
  setGuildSelfRoles,
} from '../src/lib/self-roles-store.js';
import {
  getGuildConfig,
  setGuildConfig,
} from '../src/lib/guild-config-store.js';

const TEST_GUILD = 'test-guild-999';

afterEach(async () => {
  await setGuildSelfRoles(TEST_GUILD, { roles: [] });
  await setGuildConfig(TEST_GUILD, {});
});

describe('self-roles-store', () => {
  test('adds and lists self-roles', async () => {
    await addSelfRole(TEST_GUILD, {
      roleId: 'role-1',
      label: 'Gamer',
      description: 'Gaming role',
      emoji: '🎮',
    });

    const data = await getGuildSelfRoles(TEST_GUILD);
    expect(data.roles).toHaveLength(1);
    expect(data.roles[0]).toEqual({
      roleId: 'role-1',
      label: 'Gamer',
      description: 'Gaming role',
      emoji: '🎮',
    });
  });

  test('updates existing role on re-add', async () => {
    await addSelfRole(TEST_GUILD, { roleId: 'role-1', label: 'Old' });
    await addSelfRole(TEST_GUILD, { roleId: 'role-1', label: 'New', description: 'Updated' });

    const data = await getGuildSelfRoles(TEST_GUILD);
    expect(data.roles).toHaveLength(1);
    expect(data.roles[0].label).toBe('New');
    expect(data.roles[0].description).toBe('Updated');
  });

  test('removes a self-role', async () => {
    await addSelfRole(TEST_GUILD, { roleId: 'role-1', label: 'Gamer' });
    await addSelfRole(TEST_GUILD, { roleId: 'role-2', label: 'Artist' });

    await removeSelfRole(TEST_GUILD, 'role-1');
    const data = await getGuildSelfRoles(TEST_GUILD);

    expect(data.roles).toHaveLength(1);
    expect(data.roles[0].roleId).toBe('role-2');
  });
});

describe('guild-config-store', () => {
  test('stores and reads config', async () => {
    await setGuildConfig(TEST_GUILD, {
      logChannelId: 'log-123',
      selfrolePanelChannelId: 'panel-456',
    });

    const cfg = await getGuildConfig(TEST_GUILD);
    expect(cfg.logChannelId).toBe('log-123');
    expect(cfg.selfrolePanelChannelId).toBe('panel-456');
  });
});
