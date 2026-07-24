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
    .setTitle('Wybierz swoje rangi')
    .setDescription(
      entries.length === 0
        ? 'Brak skonfigurowanych rang. Admin może dodać je komendą `/selfrole add`.'
        : [
            'Użyj menu poniżej, żeby **przełączyć** rangi (toggle).',
            'Wybrane rangi: masz → zostaną odpięte; nie masz → zostaną dodane.',
            'Pozostałe self-rangi zostają bez zmian.',
            '',
            entries
              .map((e) => {
                const role = guild.roles.cache.get(e.roleId);
                const name = role?.toString() ?? `\`${e.label}\` (brak na serwerze)`;
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
          .setPlaceholder('Wybierz rangi…')
          .setMinValues(1)
          .setMaxValues(options.length)
          .addOptions(options),
      ),
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(SELF_ROLE_CLEAR_ID)
          .setLabel('Odepnij wszystkie self-rangi')
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
