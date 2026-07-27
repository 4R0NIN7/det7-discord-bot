import type { Client } from 'discord.js';
import { getGuildSelfRoles } from './self-roles-store.js';
import { buildSelfRolePanel } from './self-roles-ui.js';

export async function refreshPanel(client: Client, guildId: string): Promise<boolean> {
  const data = await getGuildSelfRoles(guildId);
  if (!data.panelChannelId || !data.panelMessageId) return false;

  try {
    const channel = await client.channels.fetch(data.panelChannelId);
    if (!channel || !channel.isTextBased() || channel.isDMBased()) return false;

    const message = await channel.messages.fetch(data.panelMessageId);
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return false;

    const payload = buildSelfRolePanel(guild, data.roles);
    await message.edit(payload);
    return true;
  } catch {
    return false;
  }
}
