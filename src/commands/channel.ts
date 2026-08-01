import {
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { syncChannelWithParent } from '../lib/channel-sync.js';
import { logAction } from '../lib/bot-logger.js';
import type { Command } from '../types.js';

export const channelCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('channel')
    .setDescription('Create and manage channels with permission sync')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addSubcommand((sub) =>
      sub
        .setName('create')
        .setDescription('Create a channel under a category and sync its permissions')
        .addStringOption((opt) =>
          opt.setName('name').setDescription('Channel name').setRequired(true),
        )
        .addChannelOption((opt) =>
          opt
            .setName('category')
            .setDescription('Parent category (permissions will be inherited)')
            .addChannelTypes(ChannelType.GuildCategory)
            .setRequired(true),
        )
        .addStringOption((opt) =>
          opt
            .setName('type')
            .setDescription('Channel type')
            .setRequired(false)
            .addChoices(
              { name: 'Text', value: 'text' },
              { name: 'Voice', value: 'voice' },
              { name: 'Announcement', value: 'announcement' },
              { name: 'Forum', value: 'forum' },
              { name: 'Stage', value: 'stage' },
            ),
        )
        .addStringOption((opt) =>
          opt
            .setName('topic')
            .setDescription('Optional topic (text / announcement channels)')
            .setRequired(false),
        ),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guild) {
      await interaction.reply({ content: 'This command can only be used in a server.', flags: MessageFlags.Ephemeral });
      return;
    }

    const me = interaction.guild.members.me;
    if (!me?.permissions.has(PermissionFlagsBits.ManageChannels)) {
      await interaction.reply({
        content: 'The bot needs **Manage Channels** to create channels.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const sub = interaction.options.getSubcommand();
    if (sub !== 'create') return;

    const name = interaction.options.getString('name', true);
    const categoryOpt = interaction.options.getChannel('category', true);
    const type = interaction.options.getString('type') ?? 'text';
    const topic = interaction.options.getString('topic') ?? undefined;

    const category = await interaction.guild.channels.fetch(categoryOpt.id);
    if (!category || category.type !== ChannelType.GuildCategory) {
      await interaction.reply({ content: 'Category not found.', flags: MessageFlags.Ephemeral });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const typeMap = {
      text: ChannelType.GuildText,
      voice: ChannelType.GuildVoice,
      announcement: ChannelType.GuildAnnouncement,
      forum: ChannelType.GuildForum,
      stage: ChannelType.GuildStageVoice,
    } as const;

    const channelType = typeMap[type as keyof typeof typeMap] ?? ChannelType.GuildText;

    try {
      const created = await interaction.guild.channels.create({
        name,
        type: channelType,
        parent: category.id,
        topic: channelType === ChannelType.GuildText || channelType === ChannelType.GuildAnnouncement
          ? topic
          : undefined,
        reason: `Created by ${interaction.user.tag} via /channel create`,
      });

      // Ensure permissions match the category (Discord usually inherits on create, but force sync)
      if ('lockPermissions' in created) {
        await syncChannelWithParent(created);
      }

      await logAction(interaction.client, interaction.guild.id, {
        title: 'Channel created',
        description: `${interaction.user} created ${created} under **${category.name}** (permissions synced).`,
        color: 0x57f287,
        userId: interaction.user.id,
      });

      await interaction.editReply(
        `Created ${created} in **${category.name}** with category permissions synced.`,
      );
    } catch (err) {
      console.error('Channel create error:', err);
      await interaction.editReply(
        `Failed to create channel: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  },
};
