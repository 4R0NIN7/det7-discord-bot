import { describe, expect, test } from 'bun:test';
import { getCommandJson } from '../src/commands/index.js';

describe('commands', () => {
  test('registers all expected slash commands', () => {
    const commands = getCommandJson();
    const names = commands.map((c) => c.name).sort();

    expect(names).toEqual(['clear', 'config', 'selfrole', 'sync-channels']);
  });

  test('clear command has amount and all subcommands', () => {
    const clear = getCommandJson().find((c) => c.name === 'clear');
    expect(clear).toBeDefined();

    const subNames = clear!.options?.map((o) => o.name).sort();
    expect(subNames).toEqual(['all', 'amount']);
  });
});
