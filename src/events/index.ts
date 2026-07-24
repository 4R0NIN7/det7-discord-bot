import {
  Events,
  type Client,
  type Interaction,
  type StringSelectMenuInteraction,
  type ButtonInteraction,
} from 'discord.js';
import { getGuildSelfRoles } from '../lib/self-roles-store.js';
import { botCanManageRole, SELF_ROLE_CLEAR_ID, SELF_ROLE_SELECT_ID } from '../lib/self-roles-ui.js';
import type { CommandCollection } from '../types.js';

async function handleSelfRoleSelect(interaction: StringSelectMenuInteraction): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({ content: 'Działa tylko na serwerze.', ephemeral: true });
    return;
  }

  const guild = interaction.guild;
  const member = await guild.members.fetch(interaction.user.id);
  const me = guild.members.me;
  const data = await getGuildSelfRoles(guild.id);
  const configuredIds = new Set(data.roles.map((r) => r.roleId));

  const toAdd: string[] = [];
  const toRemove: string[] = [];
  const failed: string[] = [];
  const ignored: string[] = [];

  for (const roleId of interaction.values) {
    if (!configuredIds.has(roleId)) {
      ignored.push(roleId);
      continue;
    }

    const role = guild.roles.cache.get(roleId);
    if (!role || !me || !botCanManageRole(me.roles.highest, role)) {
      failed.push(roleId);
      continue;
    }

    if (member.roles.cache.has(roleId)) toRemove.push(roleId);
    else toAdd.push(roleId);
  }

  try {
    if (toAdd.length) await member.roles.add(toAdd, 'Self-role panel');
    if (toRemove.length) await member.roles.remove(toRemove, 'Self-role panel');
  } catch {
    await interaction.reply({
      content: 'Nie udało się zmienić rang. Sprawdź hierarchię ról bota i uprawnienie Manage Roles.',
      ephemeral: true,
    });
    return;
  }

  const parts: string[] = [];
  if (toAdd.length) parts.push(`Dodano: ${toAdd.map((id) => `<@&${id}>`).join(', ')}`);
  if (toRemove.length) parts.push(`Usunięto: ${toRemove.map((id) => `<@&${id}>`).join(', ')}`);
  if (failed.length) parts.push(`Pominięto (bot nie zarządza): ${failed.map((id) => `<@&${id}>`).join(', ')}`);
  if (ignored.length) parts.push(`Pominięto (nie jest self-rolą): ${ignored.map((id) => `<@&${id}>`).join(', ')}`);
  if (parts.length === 0) parts.push('Bez zmian.');

  await interaction.reply({ content: parts.join('\n'), ephemeral: true });
}

async function handleSelfRoleClear(interaction: ButtonInteraction): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({ content: 'Działa tylko na serwerze.', ephemeral: true });
    return;
  }

  const guild = interaction.guild;
  const member = await guild.members.fetch(interaction.user.id);
  const me = guild.members.me;
  const data = await getGuildSelfRoles(guild.id);
  const removable = data.roles
    .map((r) => r.roleId)
    .filter((id) => member.roles.cache.has(id))
    .filter((id) => {
      const role = guild.roles.cache.get(id);
      return Boolean(role && me && botCanManageRole(me.roles.highest, role));
    });

  if (removable.length === 0) {
    await interaction.reply({ content: 'Nie masz żadnych self-ról do odpięcia.', ephemeral: true });
    return;
  }

  try {
    await member.roles.remove(removable, 'Self-role clear');
  } catch {
    await interaction.reply({
      content: 'Nie udało się odpiąć rang.',
      ephemeral: true,
    });
    return;
  }

  await interaction.reply({
    content: `Odpięto: ${removable.map((id) => `<@&${id}>`).join(', ')}`,
    ephemeral: true,
  });
}

export function registerEvents(client: Client): void {
  client.once(Events.ClientReady, (readyClient) => {
    console.log(`Zalogowano jako ${readyClient.user.tag}`);
  });

  client.on(Events.InteractionCreate, async (interaction: Interaction) => {
    try {
      if (interaction.isChatInputCommand()) {
        const commands = (client as Client & { commands: CommandCollection }).commands;
        const command = commands.get(interaction.commandName);
        if (!command) return;
        await command.execute(interaction);
        return;
      }

      if (interaction.isStringSelectMenu() && interaction.customId === SELF_ROLE_SELECT_ID) {
        await handleSelfRoleSelect(interaction);
        return;
      }

      if (interaction.isButton() && interaction.customId === SELF_ROLE_CLEAR_ID) {
        await handleSelfRoleClear(interaction);
      }
    } catch (err) {
      console.error('Interaction error:', err);
      const payload = { content: 'Wystąpił błąd przy obsłudze interakcji.', ephemeral: true };
      if (interaction.isRepliable()) {
        if (interaction.replied || interaction.deferred) await interaction.followUp(payload);
        else await interaction.reply(payload);
      }
    }
  });
}
