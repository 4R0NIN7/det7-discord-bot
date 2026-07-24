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
import type { Command } from '../types.js';

export const selfroleCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('selfrole')
    .setDescription('Zarządzaj rangami, które użytkownicy mogą sami sobie nadawać')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addSubcommand((sub) =>
      sub
        .setName('add')
        .setDescription('Dodaj rangę do self-ról')
        .addRoleOption((opt) =>
          opt.setName('ranga').setDescription('Ranga do self-assign').setRequired(true),
        )
        .addStringOption((opt) =>
          opt.setName('opis').setDescription('Krótki opis w panelu').setRequired(false),
        )
        .addStringOption((opt) =>
          opt.setName('emoji').setDescription('Emoji przy opcji (unicode lub custom)').setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('remove')
        .setDescription('Usuń rangę z self-ról')
        .addRoleOption((opt) =>
          opt.setName('ranga').setDescription('Ranga do usunięcia').setRequired(true),
        ),
    )
    .addSubcommand((sub) => sub.setName('list').setDescription('Pokaż listę self-ról'))
    .addSubcommand((sub) =>
      sub
        .setName('panel')
        .setDescription('Wyślij panel wyboru rang na ten kanał'),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guild || !interaction.member) {
      await interaction.reply({ content: 'Ta komenda działa tylko na serwerze.', ephemeral: true });
      return;
    }

    const guild = interaction.guild;
    const me = guild.members.me;
    const sub = interaction.options.getSubcommand();

    if (sub === 'add') {
      const picked = interaction.options.getRole('ranga', true);
      const role = await guild.roles.fetch(picked.id);
      const description = interaction.options.getString('opis') ?? undefined;
      const emoji = interaction.options.getString('emoji') ?? undefined;

      if (!role) {
        await interaction.reply({ content: 'Nie znaleziono rangi.', ephemeral: true });
        return;
      }

      if (role.managed) {
        await interaction.reply({
          content: 'Tej rangi nie da się nadawać ręcznie (managed / integracja).',
          ephemeral: true,
        });
        return;
      }

      if (role.id === guild.id) {
        await interaction.reply({ content: 'Nie można dodać @everyone.', ephemeral: true });
        return;
      }

      if (!me || !botCanManageRole(me.roles.highest, role)) {
        await interaction.reply({
          content:
            'Bot nie może zarządzać tą rangą. Ustaw rangę bota **wyżej** niż targetową rangę na liście ról.',
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

      await interaction.reply({
        content: `Dodano ${role} do self-ról. Odśwież panel komendą \`/selfrole panel\`.`,
        ephemeral: true,
      });
      return;
    }

    if (sub === 'remove') {
      const role = interaction.options.getRole('ranga', true);
      await removeSelfRole(guild.id, role.id);
      await interaction.reply({
        content: `Usunięto ${role} z self-ról.`,
        ephemeral: true,
      });
      return;
    }

    if (sub === 'list') {
      const data = await getGuildSelfRoles(guild.id);
      if (data.roles.length === 0) {
        await interaction.reply({ content: 'Brak self-ról.', ephemeral: true });
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
        await interaction.reply({ content: 'Panel można wysłać tylko na kanale tekstowym.', ephemeral: true });
        return;
      }

      const data = await getGuildSelfRoles(guild.id);
      const payload = buildSelfRolePanel(guild, data.roles);
      const message = await interaction.channel.send(payload);

      data.panelMessageId = message.id;
      data.panelChannelId = message.channelId;
      await setGuildSelfRoles(guild.id, data);

      await interaction.reply({ content: 'Panel self-ról wysłany.', ephemeral: true });
    }
  },
};
