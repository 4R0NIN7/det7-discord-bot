import { EmbedBuilder, type Client, type ColorResolvable } from 'discord.js';
import { getGuildConfig } from './guild-config-store.js';

export async function logAction(
  client: Client,
  guildId: string,
  opts: { title: string; description: string; color?: ColorResolvable; userId?: string },
): Promise<void> {
  const cfg = await getGuildConfig(guildId);
  if (!cfg.logChannelId) return;

  try {
    const channel = await client.channels.fetch(cfg.logChannelId);
    if (!channel || !channel.isTextBased() || channel.isDMBased()) return;

    const embed = new EmbedBuilder()
      .setColor(opts.color ?? 0x5865f2)
      .setTitle(opts.title)
      .setDescription(opts.description)
      .setTimestamp();

    if (opts.userId) embed.setFooter({ text: `User: ${opts.userId}` });

    await channel.send({ embeds: [embed] });
  } catch {
    // silently ignore if log channel is unavailable
  }
}
