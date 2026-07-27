import { REST, Routes } from 'discord.js';
import { config } from './config.js';
import { getCommandJson } from './commands/index.js';

const rest = new REST({ version: '10' }).setToken(config.token);
const body = getCommandJson();

console.log(`Registering ${body.length} commands…`);

if (config.guildId) {
  await rest.put(Routes.applicationGuildCommands(config.clientId, config.guildId), { body });
  console.log(`OK — guild commands (${config.guildId})`);
} else {
  await rest.put(Routes.applicationCommands(config.clientId), { body });
  console.log('OK — global commands (may take a few minutes to appear)');
}
