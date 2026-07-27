import { describe, expect, test } from 'bun:test';
import { formatSyncResult, type SyncResult } from '../src/lib/channel-sync.js';

describe('formatSyncResult', () => {
  test('formats empty result', () => {
    const result: SyncResult = { synced: [], skipped: [], failed: [] };
    const text = formatSyncResult(result);
    expect(text).toContain('Synced: **0**');
    expect(text).toContain('Skipped (already OK / no category): **0**');
  });

  test('includes synced channel names', () => {
    const result: SyncResult = {
      synced: ['general', 'voice-1'],
      skipped: ['archived'],
      failed: [],
    };
    const text = formatSyncResult(result);
    expect(text).toContain('Synced: **2**');
    expect(text).toContain('• general');
    expect(text).toContain('• voice-1');
    expect(text).toContain('Skipped (already OK / no category): **1**');
  });

  test('includes failures', () => {
    const result: SyncResult = {
      synced: [],
      skipped: [],
      failed: [{ name: 'broken', error: 'Missing Access' }],
    };
    const text = formatSyncResult(result);
    expect(text).toContain('Failed: **1**');
    expect(text).toContain('• broken: Missing Access');
  });
});
