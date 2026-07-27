import type { Client } from 'discord.js';
import { Collection } from 'discord.js';
import { configCommand } from '../commands/config.js';
import { selfroleCommand } from '../commands/selfrole.js';
import { syncChannelsCommand } from '../commands/sync-channels.js';
import type { Command, CommandCollection } from '../types.js';

const commandList: Command[] = [configCommand, selfroleCommand, syncChannelsCommand];

export function loadCommands(client: Client): CommandCollection {
  const commands = new Collection<string, Command>();
  for (const command of commandList) {
    commands.set(command.data.name, command);
  }
  (client as Client & { commands: CommandCollection }).commands = commands;
  return commands;
}

export function getCommandJson() {
  return commandList.map((c) => c.data.toJSON());
}
