import { describe, expect, test } from 'bun:test';
import { getCommandJson } from '../src/commands/index.js';

describe('commands', () => {
  test('registers all expected slash commands', () => {
    const commands = getCommandJson();
    const names = commands.map((c) => c.name).sort();

    expect(names).toEqual(['channel', 'clear', 'config', 'selfrole', 'sync-channels']);
  });

  test('clear command has amount and all subcommands', () => {
    const clear = getCommandJson().find((c) => c.name === 'clear');
    expect(clear).toBeDefined();

    const subNames = clear!.options?.map((o) => o.name).sort();
    expect(subNames).toEqual(['all', 'amount']);
  });

  test('sync-channels has audit subcommand', () => {
    const sync = getCommandJson().find((c) => c.name === 'sync-channels');
    const subNames = sync?.options?.map((o) => o.name).sort();
    expect(subNames).toEqual(['all', 'audit', 'category']);
  });

  test('sync-channels all has optional force flag', () => {
    const sync = getCommandJson().find((c) => c.name === 'sync-channels');
    const all = sync?.options?.find((o) => o.name === 'all');
    const force = all?.options?.find((o) => o.name === 'force');
    expect(force).toBeDefined();
    expect(force?.required).toBe(false);
  });

  test('channel create exists with expected options', () => {
    const channel = getCommandJson().find((c) => c.name === 'channel');
    const create = channel?.options?.find((o) => o.name === 'create');
    expect(create).toBeDefined();

    const optNames = create?.options?.map((o) => o.name).sort();
    expect(optNames).toEqual(['category', 'name', 'topic', 'type']);

    const type = create?.options?.find((o) => o.name === 'type');
    const choices = type?.choices?.map((c) => c.value).sort();
    expect(choices).toEqual(['announcement', 'forum', 'stage', 'text', 'voice']);
  });
});
