import {
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type GuildTextBasedChannel,
  type TextChannel,
  type NewsChannel,
} from 'discord.js';
import { logAction } from '../lib/bot-logger.js';
import type { Command } from '../types.js';

const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;
const BATCH_SIZE = 100;
const MAX_ALL_BATCHES = 500; // safety cap (~50k messages)

function canBulkDelete(channel: GuildTextBasedChannel): channel is TextChannel | NewsChannel {
  return channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement;
}

async function purgeMessages(
  channel: TextChannel | NewsChannel,
  opts: { amount?: number; all?: boolean },
): Promise<{ deleted: number; skippedOld: number; exhausted: boolean }> {
  let remaining = opts.all ? Number.POSITIVE_INFINITY : (opts.amount ?? 0);
  let deleted = 0;
  let skippedOld = 0;
  let batches = 0;

  while (remaining > 0 && batches < MAX_ALL_BATCHES) {
    batches += 1;
    const fetchLimit = Math.min(Number.isFinite(remaining) ? remaining : BATCH_SIZE, BATCH_SIZE);
    const fetched = await channel.messages.fetch({ limit: fetchLimit });
    if (fetched.size === 0) {
      return { deleted, skippedOld, exhausted: true };
    }

    const now = Date.now();
    const recent = fetched.filter((msg) => now - msg.createdTimestamp < TWO_WEEKS_MS);
    const old = fetched.filter((msg) => now - msg.createdTimestamp >= TWO_WEEKS_MS);

    if (recent.size === 1) {
      await recent.first()!.delete();
      deleted += 1;
    } else if (recent.size > 1) {
      const result = await channel.bulkDelete(recent, true);
      deleted += result.size;
    }

    if (opts.all) {
      // Individually delete older messages (bulkDelete cannot)
      for (const msg of old.values()) {
        try {
          await msg.delete();
          deleted += 1;
        } catch {
          skippedOld += 1;
        }
        await new Promise((r) => setTimeout(r, 350));
      }
    } else {
      skippedOld += old.size;
      if (recent.size === 0) break;
    }

    if (Number.isFinite(remaining)) {
      remaining -= fetched.size;
    }

    if (remaining > 0 || opts.all) await new Promise((r) => setTimeout(r, 1000));
  }

  return { deleted, skippedOld, exhausted: false };
}

export const clearCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Clear messages from a text channel')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addSubcommand((sub) =>
      sub
        .setName('amount')
        .setDescription('Delete a specific number of recent messages')
        .addIntegerOption((opt) =>
          opt
            .setName('count')
            .setDescription('How many messages to delete (1–1000)')
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(1000),
        )
        .addChannelOption((opt) =>
          opt
            .setName('channel')
            .setDescription('Channel to clear (defaults to current)')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('all')
        .setDescription('Delete all messages in a channel')
        .addBooleanOption((opt) =>
          opt
            .setName('confirm')
            .setDescription('Must be true to wipe the whole channel')
            .setRequired(true),
        )
        .addChannelOption((opt) =>
          opt
            .setName('channel')
            .setDescription('Channel to wipe (defaults to current)')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(false),
        ),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guild) {
      await interaction.reply({ content: 'This command can only be used in a server.', flags: MessageFlags.Ephemeral });
      return;
    }

    const guildMember = await interaction.guild.members.fetch(interaction.user.id);
    if (!guildMember.permissions.has(PermissionFlagsBits.ManageMessages)) {
      await interaction.reply({
        content: 'You need **Manage Messages** to use this command.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const sub = interaction.options.getSubcommand();
    const target = interaction.options.getChannel('channel') ?? interaction.channel;

    if (sub === 'all' && !interaction.options.getBoolean('confirm', true)) {
      await interaction.reply({
        content: 'Set `confirm: True` to wipe the entire channel.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (!target || !('id' in target)) {
      await interaction.reply({ content: 'Channel not found.', flags: MessageFlags.Ephemeral });
      return;
    }

    const channel = await interaction.guild.channels.fetch(target.id);
    if (!channel || !channel.isTextBased() || channel.isDMBased() || !canBulkDelete(channel)) {
      await interaction.reply({
        content: 'Only text / announcement channels can be cleared.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const me = interaction.guild.members.me;
    if (!me?.permissionsIn(channel).has([PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ViewChannel])) {
      await interaction.reply({
        content: 'The bot needs **Manage Messages** and **View Channel** in that channel.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      const result =
        sub === 'all'
          ? await purgeMessages(channel, { all: true })
          : await purgeMessages(channel, {
              amount: interaction.options.getInteger('count', true),
            });

      const parts = [`Deleted **${result.deleted}** messages from ${channel}.`];
      if (result.skippedOld > 0) {
        parts.push(
          sub === 'all'
            ? `Could not delete **${result.skippedOld}** messages (missing permissions or already gone).`
            : `Skipped **${result.skippedOld}** messages older than 14 days (use \`/clear all\` to remove those too).`,
        );
      }
      if (sub === 'all' && !result.exhausted) {
        parts.push('Stopped early due to safety limit. Run `/clear all` again if messages remain.');
      }

      await logAction(interaction.client, interaction.guild.id, {
        title: sub === 'all' ? 'Channel wiped' : 'Channel cleared',
        description: `${interaction.user} deleted **${result.deleted}** messages from ${channel}.`,
        color: 0xed4245,
        userId: interaction.user.id,
      });

      await interaction.editReply(parts.join('\n'));
    } catch (err) {
      console.error('Clear command error:', err);
      await interaction.editReply('Failed to clear the channel. Check the bot permissions.');
    }
  },
};
