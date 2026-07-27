import {
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import {
  addSelfRole,
  getGuildSelfRoles,
  removeSelfRole,
  setGuildSelfRoles,
} from '../lib/self-roles-store.js';
import { botCanManageRole, buildSelfRolePanel } from '../lib/self-roles-ui.js';
import { refreshPanel } from '../lib/panel-refresh.js';
import { logAction } from '../lib/bot-logger.js';
import { getGuildConfig } from '../lib/guild-config-store.js';
import type { Command } from '../types.js';

export const selfroleCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('selfrole')
    .setDescription('Manage roles that members can assign to themselves')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addSubcommand((sub) =>
      sub
        .setName('add')
        .setDescription('Add a role to self-roles')
        .addRoleOption((opt) =>
          opt.setName('role').setDescription('Role to make self-assignable').setRequired(true),
        )
        .addStringOption((opt) =>
          opt.setName('description').setDescription('Short description shown in the panel').setRequired(false),
        )
        .addStringOption((opt) =>
          opt.setName('emoji').setDescription('Emoji for the select option (unicode or custom)').setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('remove')
        .setDescription('Remove a role from self-roles')
        .addRoleOption((opt) =>
          opt.setName('role').setDescription('Role to remove').setRequired(true),
        ),
    )
    .addSubcommand((sub) => sub.setName('list').setDescription('List configured self-roles'))
    .addSubcommand((sub) =>
      sub.setName('panel').setDescription('Post the self-role selection panel in this channel'),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guild || !interaction.member) {
      await interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
      return;
    }

    const guild = interaction.guild;
    const me = guild.members.me;
    const sub = interaction.options.getSubcommand();

    if (sub === 'add') {
      const picked = interaction.options.getRole('role', true);
      const role = await guild.roles.fetch(picked.id);
      const description = interaction.options.getString('description') ?? undefined;
      const emoji = interaction.options.getString('emoji') ?? undefined;

      if (!role) {
        await interaction.reply({ content: 'Role not found.', ephemeral: true });
        return;
      }

      if (role.managed) {
        await interaction.reply({
          content: 'This role cannot be assigned manually (managed / integration).',
          ephemeral: true,
        });
        return;
      }

      if (role.id === guild.id) {
        await interaction.reply({ content: 'You cannot add @everyone.', ephemeral: true });
        return;
      }

      if (!me || !botCanManageRole(me.roles.highest, role)) {
        await interaction.reply({
          content:
            'The bot cannot manage this role. Move the bot role **above** the target role in the role list.',
          ephemeral: true,
        });
        return;
      }

      await addSelfRole(guild.id, {
        roleId: role.id,
        label: role.name,
        description,
        emoji,
      });

      await refreshPanel(interaction.client, guild.id);

      await logAction(interaction.client, guild.id, {
        title: 'Self-role added',
        description: `${interaction.user} added ${role} to self-roles.`,
        color: 0x57f287,
        userId: interaction.user.id,
      });

      await interaction.reply({
        content: `Added ${role} to self-roles. The panel was refreshed automatically.`,
        ephemeral: true,
      });
      return;
    }

    if (sub === 'remove') {
      const role = interaction.options.getRole('role', true);
      await removeSelfRole(guild.id, role.id);

      await refreshPanel(interaction.client, guild.id);

      await logAction(interaction.client, guild.id, {
        title: 'Self-role removed',
        description: `${interaction.user} removed <@&${role.id}> from self-roles.`,
        color: 0xed4245,
        userId: interaction.user.id,
      });

      await interaction.reply({
        content: `Removed <@&${role.id}> from self-roles. The panel was refreshed automatically.`,
        ephemeral: true,
      });
      return;
    }

    if (sub === 'list') {
      const data = await getGuildSelfRoles(guild.id);
      if (data.roles.length === 0) {
        await interaction.reply({ content: 'No self-roles configured.', ephemeral: true });
        return;
      }
      const lines = data.roles.map((r) => {
        const mention = `<@&${r.roleId}>`;
        const desc = r.description ? ` — ${r.description}` : '';
        return `• ${mention}${desc}`;
      });
      await interaction.reply({ content: lines.join('\n'), ephemeral: true });
      return;
    }

    if (sub === 'panel') {
      if (!interaction.channel || !interaction.channel.isTextBased() || interaction.channel.isDMBased()) {
        await interaction.reply({ content: 'The panel can only be posted in a text channel.', ephemeral: true });
        return;
      }

      const cfg = await getGuildConfig(guild.id);
      if (cfg.selfrolePanelChannelId && interaction.channelId !== cfg.selfrolePanelChannelId) {
        await interaction.reply({
          content: `The self-role panel can only be posted in <#${cfg.selfrolePanelChannelId}>. Change this with \`/config panel-channel\`.`,
          ephemeral: true,
        });
        return;
      }

      const data = await getGuildSelfRoles(guild.id);
      const payload = buildSelfRolePanel(guild, data.roles);
      const message = await interaction.channel.send(payload);

      data.panelMessageId = message.id;
      data.panelChannelId = message.channelId;
      await setGuildSelfRoles(guild.id, data);

      await logAction(interaction.client, guild.id, {
        title: 'Self-role panel posted',
        description: `${interaction.user} posted the panel in <#${message.channelId}>.`,
        color: 0x5865f2,
        userId: interaction.user.id,
      });

      await interaction.reply({ content: 'Self-role panel posted.', ephemeral: true });
    }
  },
};
