import {
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { getGuildConfig, setGuildConfig } from '../lib/guild-config-store.js';
import type { Command } from '../types.js';

export const configCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('config')
    .setDescription('Bot configuration for this server')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub
        .setName('log-channel')
        .setDescription('Set the bot log channel')
        .addChannelOption((opt) =>
          opt
            .setName('channel')
            .setDescription('Log channel (leave empty to disable)')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('panel-channel')
        .setDescription('Restrict /selfrole panel to a specific channel')
        .addChannelOption((opt) =>
          opt
            .setName('channel')
            .setDescription('Panel channel (leave empty to remove the restriction)')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName('show').setDescription('Show the current bot configuration'),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guild) {
      await interaction.reply({ content: 'This command can only be used in a server.', flags: MessageFlags.Ephemeral });
      return;
    }

    const guildId = interaction.guild.id;
    const sub = interaction.options.getSubcommand();

    if (sub === 'log-channel') {
      const channel = interaction.options.getChannel('channel');
      const cfg = await getGuildConfig(guildId);
      cfg.logChannelId = channel?.id ?? undefined;
      await setGuildConfig(guildId, cfg);

      await interaction.reply({
        content: channel
          ? `Log channel set to ${channel}.`
          : 'Log channel disabled.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (sub === 'panel-channel') {
      const channel = interaction.options.getChannel('channel');
      const cfg = await getGuildConfig(guildId);
      cfg.selfrolePanelChannelId = channel?.id ?? undefined;
      await setGuildConfig(guildId, cfg);

      await interaction.reply({
        content: channel
          ? `Self-role panel restricted to ${channel}.`
          : 'Panel channel restriction removed — panel can be posted anywhere.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (sub === 'show') {
      const cfg = await getGuildConfig(guildId);
      const lines = [
        `**Log channel:** ${cfg.logChannelId ? `<#${cfg.logChannelId}>` : 'not set'}`,
        `**Self-role panel channel:** ${cfg.selfrolePanelChannelId ? `<#${cfg.selfrolePanelChannelId}>` : 'no restriction'}`,
      ];
      await interaction.reply({ content: lines.join('\n'), flags: MessageFlags.Ephemeral });
    }
  },
};
