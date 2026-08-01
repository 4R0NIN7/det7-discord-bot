import {
  ActivityType,
  Events,
  MessageFlags,
  type Client,
  type Interaction,
  type StringSelectMenuInteraction,
  type ButtonInteraction,
} from 'discord.js';
import { getGuildSelfRoles } from '../lib/self-roles-store.js';
import { botCanManageRole, SELF_ROLE_CLEAR_ID, SELF_ROLE_SELECT_ID } from '../lib/self-roles-ui.js';
import { logAction } from '../lib/bot-logger.js';
import type { CommandCollection } from '../types.js';

async function handleSelfRoleSelect(interaction: StringSelectMenuInteraction): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({ content: 'This only works in a server.', flags: MessageFlags.Ephemeral });
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
      content: 'Failed to update roles. Check the bot role hierarchy and Manage Roles permission.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const parts: string[] = [];
  if (toAdd.length) parts.push(`Added: ${toAdd.map((id) => `<@&${id}>`).join(', ')}`);
  if (toRemove.length) parts.push(`Removed: ${toRemove.map((id) => `<@&${id}>`).join(', ')}`);
  if (failed.length) parts.push(`Skipped (bot cannot manage): ${failed.map((id) => `<@&${id}>`).join(', ')}`);
  if (ignored.length) parts.push(`Skipped (not a self-role): ${ignored.map((id) => `<@&${id}>`).join(', ')}`);
  if (parts.length === 0) parts.push('No changes.');

  if (toAdd.length || toRemove.length) {
    const logParts: string[] = [];
    if (toAdd.length) logParts.push(`+${toAdd.map((id) => `<@&${id}>`).join(', ')}`);
    if (toRemove.length) logParts.push(`-${toRemove.map((id) => `<@&${id}>`).join(', ')}`);
    await logAction(interaction.client, guild.id, {
      title: 'Self-role toggle',
      description: `${interaction.user} changed roles: ${logParts.join(' | ')}`,
      color: 0xfee75c,
      userId: interaction.user.id,
    });
  }

  await interaction.reply({ content: parts.join('\n'), flags: MessageFlags.Ephemeral });
}

async function handleSelfRoleClear(interaction: ButtonInteraction): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({ content: 'This only works in a server.', flags: MessageFlags.Ephemeral });
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
    await interaction.reply({ content: 'You have no self-roles to remove.', flags: MessageFlags.Ephemeral });
    return;
  }

  try {
    await member.roles.remove(removable, 'Self-role clear');
  } catch {
    await interaction.reply({
      content: 'Failed to remove roles.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await logAction(interaction.client, guild.id, {
    title: 'Self-role clear',
    description: `${interaction.user} removed all self-roles: ${removable.map((id) => `<@&${id}>`).join(', ')}`,
    color: 0xfee75c,
    userId: interaction.user.id,
  });

  await interaction.reply({
    content: `Removed: ${removable.map((id) => `<@&${id}>`).join(', ')}`,
    flags: MessageFlags.Ephemeral,
  });
}

export function registerEvents(client: Client): void {
  client.once(Events.ClientReady, (readyClient) => {
    readyClient.user.setPresence({
      status: 'online',
      activities: [
        {
          type: ActivityType.Custom,
          name: 'Custom Status',
          state: 'Assigning ranks… blaming lag for the rest',
        },
      ],
    });
    console.log(`Logged in as ${readyClient.user.tag}`);
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
      const payload = {
        content: 'Something went wrong while handling that interaction.',
        flags: [MessageFlags.Ephemeral] as const,
      };
      if (interaction.isRepliable()) {
        if (interaction.replied || interaction.deferred) await interaction.followUp(payload);
        else await interaction.reply(payload);
      }
    }
  });
}
