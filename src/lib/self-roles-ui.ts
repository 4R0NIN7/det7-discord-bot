import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
  type Guild,
  type Role,
} from 'discord.js';
import type { SelfRoleEntry } from './self-roles-store.js';

export const SELF_ROLE_SELECT_ID = 'selfrole:select';
export const SELF_ROLE_CLEAR_ID = 'selfrole:clear';

export function buildSelfRolePanel(guild: Guild, entries: SelfRoleEntry[]) {
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('Choose your roles')
    .setDescription(
      entries.length === 0
        ? 'No roles configured yet. An admin can add them with `/selfrole add`.'
        : [
            'Use the menu below to **toggle** roles.',
            'Selected roles: you have them → removed; you don’t → added.',
            'Other self-roles stay unchanged.',
            '',
            entries
              .map((e) => {
                const role = guild.roles.cache.get(e.roleId);
                const name = role?.toString() ?? `\`${e.label}\` (missing on server)`;
                const emoji = e.emoji ? `${e.emoji} ` : '';
                const desc = e.description ? ` — ${e.description}` : '';
                return `${emoji}${name}${desc}`;
              })
              .join('\n'),
          ].join('\n'),
    )
    .setFooter({ text: 'DeepTeam7 • self-roles' });

  const components: ActionRowBuilder<StringSelectMenuBuilder | ButtonBuilder>[] = [];

  if (entries.length > 0) {
    const options = entries.slice(0, 25).map((e) => {
      const role = guild.roles.cache.get(e.roleId);
      return {
        label: (e.label || role?.name || e.roleId).slice(0, 100),
        description: e.description?.slice(0, 100),
        value: e.roleId,
        emoji: e.emoji,
      };
    });

    components.push(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(SELF_ROLE_SELECT_ID)
          .setPlaceholder('Select roles…')
          .setMinValues(1)
          .setMaxValues(options.length)
          .addOptions(options),
      ),
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(SELF_ROLE_CLEAR_ID)
          .setLabel('Remove all self-roles')
          .setStyle(ButtonStyle.Secondary),
      ),
    );
  }

  return { embeds: [embed], components };
}

export function botCanManageRole(botMemberHighest: Role | undefined, target: Role): boolean {
  if (target.managed) return false;
  if (!botMemberHighest) return false;
  return botMemberHighest.comparePositionTo(target) > 0;
}
