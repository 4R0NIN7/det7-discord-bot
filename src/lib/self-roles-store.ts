import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(rootDir, 'data');
const storePath = path.join(dataDir, 'self-roles.json');

export interface SelfRoleEntry {
  roleId: string;
  label: string;
  description?: string;
  emoji?: string;
}

export interface GuildSelfRoles {
  roles: SelfRoleEntry[];
  /** Message id of the last published role panel (optional). */
  panelMessageId?: string;
  panelChannelId?: string;
}

type Store = Record<string, GuildSelfRoles>;

async function ensureStore(): Promise<void> {
  await mkdir(dataDir, { recursive: true });
  try {
    await readFile(storePath, 'utf8');
  } catch {
    await writeFile(storePath, '{}', 'utf8');
  }
}

async function readStore(): Promise<Store> {
  await ensureStore();
  const raw = await readFile(storePath, 'utf8');
  return JSON.parse(raw) as Store;
}

async function writeStore(store: Store): Promise<void> {
  await ensureStore();
  await writeFile(storePath, JSON.stringify(store, null, 2), 'utf8');
}

export async function getGuildSelfRoles(guildId: string): Promise<GuildSelfRoles> {
  const store = await readStore();
  return store[guildId] ?? { roles: [] };
}

export async function setGuildSelfRoles(guildId: string, data: GuildSelfRoles): Promise<void> {
  const store = await readStore();
  store[guildId] = data;
  await writeStore(store);
}

export async function addSelfRole(guildId: string, entry: SelfRoleEntry): Promise<GuildSelfRoles> {
  const data = await getGuildSelfRoles(guildId);
  const without = data.roles.filter((r) => r.roleId !== entry.roleId);
  data.roles = [...without, entry];
  await setGuildSelfRoles(guildId, data);
  return data;
}

export async function removeSelfRole(guildId: string, roleId: string): Promise<GuildSelfRoles> {
  const data = await getGuildSelfRoles(guildId);
  data.roles = data.roles.filter((r) => r.roleId !== roleId);
  await setGuildSelfRoles(guildId, data);
  return data;
}
