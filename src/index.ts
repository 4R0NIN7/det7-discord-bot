import { Client, GatewayIntentBits, Partials } from 'discord.js';
import { config } from './config.js';
import { loadCommands } from './commands/index.js';
import { registerEvents } from './events/index.js';

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
  partials: [Partials.GuildMember],
});

loadCommands(client);
registerEvents(client);

await client.login(config.token);
