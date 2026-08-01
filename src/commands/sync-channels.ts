import {
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import {
  auditGuildChannelAccess,
  formatAuditReport,
  formatSyncResult,
  syncCategoryChannels,
  syncGuildChannels,
} from '../lib/channel-sync.js';
import type { Command } from '../types.js';

export const syncChannelsCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('sync-channels')
    .setDescription('Sync channel permissions with their category (like Discord Sync Now)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addSubcommand((sub) =>
      sub
        .setName('all')
        .setDescription('Sync all out-of-sync channels on the server')
        .addBooleanOption((opt) =>
          opt
            .setName('force')
            .setDescription('Force sync even if Discord already considers the channel synced')
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('category')
        .setDescription('Sync channels in a selected category')
        .addChannelOption((opt) =>
          opt
            .setName('category')
            .setDescription('Category to sync')
            .addChannelTypes(ChannelType.GuildCategory)
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('audit')
        .setDescription('Check if category roles can access their child channels'),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guild) {
      await interaction.reply({ content: 'This command can only be used in a server.', flags: MessageFlags.Ephemeral });
      return;
    }

    const me = interaction.guild.members.me;
    if (!me?.permissions.has(PermissionFlagsBits.ManageChannels)) {
      await interaction.reply({
        content: 'The bot needs **Manage Channels** to sync channels.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const sub = interaction.options.getSubcommand();

    if (sub === 'audit') {
      const report = await auditGuildChannelAccess(interaction.guild);
      await interaction.editReply(formatAuditReport(report));
      return;
    }

    if (sub === 'all') {
      const force = interaction.options.getBoolean('force') ?? false;
      const result = await syncGuildChannels(interaction.guild, !force);
      await interaction.editReply(formatSyncResult(result));
      return;
    }

    const category = interaction.options.getChannel('category', true);
    const full = await interaction.guild.channels.fetch(category.id);
    if (!full || full.type !== ChannelType.GuildCategory) {
      await interaction.editReply('Category not found.');
      return;
    }

    const result = await syncCategoryChannels(full);
    await interaction.editReply(formatSyncResult(result));
  },
};
