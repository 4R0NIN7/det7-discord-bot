import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(rootDir, 'data');
const storePath = path.join(dataDir, 'guild-config.json');

export interface GuildConfig {
  logChannelId?: string;
  selfrolePanelChannelId?: string;
}

type Store = Record<string, GuildConfig>;

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

export async function getGuildConfig(guildId: string): Promise<GuildConfig> {
  const store = await readStore();
  return store[guildId] ?? {};
}

export async function setGuildConfig(guildId: string, config: GuildConfig): Promise<void> {
  const store = await readStore();
  store[guildId] = config;
  await writeStore(store);
}
