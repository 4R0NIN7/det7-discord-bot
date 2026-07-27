import {
  ChannelType,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { getGuildConfig, setGuildConfig } from '../lib/guild-config-store.js';
import type { Command } from '../types.js';

export const configCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('config')
    .setDescription('Konfiguracja bota dla tego serwera')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub
        .setName('log-channel')
        .setDescription('Ustaw kanał logów bota')
        .addChannelOption((opt) =>
          opt
            .setName('kanał')
            .setDescription('Kanał na logi (zostaw pusty żeby wyłączyć)')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('panel-channel')
        .setDescription('Ustaw kanał, na którym /selfrole panel może być użyty')
        .addChannelOption((opt) =>
          opt
            .setName('kanał')
            .setDescription('Kanał na panel (zostaw pusty żeby wyłączyć ograniczenie)')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName('show').setDescription('Pokaż aktualną konfigurację bota'),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guild) {
      await interaction.reply({ content: 'Ta komenda działa tylko na serwerze.', ephemeral: true });
      return;
    }

    const guildId = interaction.guild.id;
    const sub = interaction.options.getSubcommand();

    if (sub === 'log-channel') {
      const channel = interaction.options.getChannel('kanał');
      const cfg = await getGuildConfig(guildId);
      cfg.logChannelId = channel?.id ?? undefined;
      await setGuildConfig(guildId, cfg);

      await interaction.reply({
        content: channel
          ? `Kanał logów ustawiony na ${channel}.`
          : 'Kanał logów wyłączony.',
        ephemeral: true,
      });
      return;
    }

    if (sub === 'panel-channel') {
      const channel = interaction.options.getChannel('kanał');
      const cfg = await getGuildConfig(guildId);
      cfg.selfrolePanelChannelId = channel?.id ?? undefined;
      await setGuildConfig(guildId, cfg);

      await interaction.reply({
        content: channel
          ? `Panel self-ról ograniczony do ${channel}.`
          : 'Ograniczenie kanału panelu wyłączone — panel można wysłać wszędzie.',
        ephemeral: true,
      });
      return;
    }

    if (sub === 'show') {
      const cfg = await getGuildConfig(guildId);
      const lines = [
        `**Kanał logów:** ${cfg.logChannelId ? `<#${cfg.logChannelId}>` : 'nie ustawiony'}`,
        `**Kanał panelu self-ról:** ${cfg.selfrolePanelChannelId ? `<#${cfg.selfrolePanelChannelId}>` : 'brak ograniczenia'}`,
      ];
      await interaction.reply({ content: lines.join('\n'), ephemeral: true });
    }
  },
};
