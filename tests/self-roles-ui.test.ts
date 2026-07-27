import { describe, expect, test } from 'bun:test';
import type { Role } from 'discord.js';
import { botCanManageRole } from '../src/lib/self-roles-ui.js';

function mockRole(position: number, managed = false): Role {
  return {
    managed,
    position,
    comparePositionTo(other: Role) {
      return position - other.position;
    },
  } as Role;
}

describe('botCanManageRole', () => {
  test('returns false when bot role is missing', () => {
    expect(botCanManageRole(undefined, mockRole(1))).toBe(false);
  });

  test('returns false for managed roles', () => {
    expect(botCanManageRole(mockRole(10), mockRole(5, true))).toBe(false);
  });

  test('returns false when bot role is not higher', () => {
    expect(botCanManageRole(mockRole(3), mockRole(5))).toBe(false);
    expect(botCanManageRole(mockRole(5), mockRole(5))).toBe(false);
  });

  test('returns true when bot role is higher', () => {
    expect(botCanManageRole(mockRole(10), mockRole(3))).toBe(true);
  });
});
