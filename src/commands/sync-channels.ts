import {
  ChannelType,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { formatSyncResult, syncCategoryChannels, syncGuildChannels } from '../lib/channel-sync.js';
import type { Command } from '../types.js';

export const syncChannelsCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('sync-channels')
    .setDescription('Synchronizuje uprawnienia kanałów z ich kategorią (jak Sync Now w Discordzie)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addSubcommand((sub) =>
      sub
        .setName('all')
        .setDescription('Synchronizuje wszystkie niesynchronizowane kanały na serwerze')
        .addBooleanOption((opt) =>
          opt
            .setName('force')
            .setDescription('Wymuś sync nawet jeśli Discord uważa kanał za zsynchronizowany')
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('category')
        .setDescription('Synchronizuje kanały w wybranej kategorii')
        .addChannelOption((opt) =>
          opt
            .setName('kategoria')
            .setDescription('Kategoria do synchronizacji')
            .addChannelTypes(ChannelType.GuildCategory)
            .setRequired(true),
        ),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guild) {
      await interaction.reply({ content: 'Ta komenda działa tylko na serwerze.', ephemeral: true });
      return;
    }

    const me = interaction.guild.members.me;
    if (!me?.permissions.has(PermissionFlagsBits.ManageChannels)) {
      await interaction.reply({
        content: 'Bot potrzebuje uprawnienia **Manage Channels**, żeby syncować kanały.',
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    const sub = interaction.options.getSubcommand();

    if (sub === 'all') {
      const force = interaction.options.getBoolean('force') ?? false;
      const result = await syncGuildChannels(interaction.guild, !force);
      await interaction.editReply(formatSyncResult(result));
      return;
    }

    const category = interaction.options.getChannel('kategoria', true);
    const full = await interaction.guild.channels.fetch(category.id);
    if (!full || full.type !== ChannelType.GuildCategory) {
      await interaction.editReply('Nie znaleziono kategorii.');
      return;
    }

    const result = await syncCategoryChannels(full);
    await interaction.editReply(formatSyncResult(result));
  },
};
