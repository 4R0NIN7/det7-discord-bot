import {
  type ChatInputCommandInteraction,
  type Client,
  type Collection,
  type SlashCommandBuilder,
  type SlashCommandOptionsOnlyBuilder,
  type SlashCommandSubcommandsOnlyBuilder,
} from 'discord.js';

export interface Command {
  data:
    | SlashCommandBuilder
    | SlashCommandSubcommandsOnlyBuilder
    | SlashCommandOptionsOnlyBuilder
    | Omit<SlashCommandBuilder, 'addSubcommand' | 'addSubcommandGroup'>;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
}

export type CommandCollection = Collection<string, Command>;

export function getCommands(client: Client): CommandCollection {
  return (client as Client & { commands: CommandCollection }).commands;
}
