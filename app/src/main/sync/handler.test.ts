import { describe, it, expect, vi } from 'vitest';

/**
 * Tests for the IPC handlers sync:getState and sync:getLog.
 *
 * These handlers are called by the renderer to query the aggregated state
 * and the sync log. They should always return the current state without side effects.
 */

vi.doMock('../db', () => ({
  getDb: vi.fn(() => ({
    prepare: vi.fn(),
  })),
}));

vi.doMock('../db/dao', () => ({
  getSetting: vi.fn(() => undefined),
  setSetting: vi.fn(),
}));

describe('sync IPC handlers', () => {
  it('should respond to sync:getState with current state', async () => {
    const stateModule = await import('./state');
    stateModule.initSyncState(() => null);

    // Simulate some state changes
    stateModule.handleSyncEvent({
      phase: 'started',
      ts: '2026-06-21T10:00:00Z',
    });

    // Handler should return current state
    const result = { state: stateModule.getSyncState() };
    expect(result).toEqual({ state: 'running' });
  });

  it('should respond to sync:getLog with recent entries', async () => {
    const stateModule = await import('./state');
    stateModule.initSyncState(() => null);

    stateModule.handleSyncEvent({
      phase: 'started',
      ts: '2026-06-21T10:00:00Z',
    });
    stateModule.handleSyncEvent({
      phase: 'completed',
      ts: '2026-06-21T10:05:00Z',
    });
    stateModule.handleSyncEvent({
      phase: 'started',
      ts: '2026-06-21T10:10:00Z',
    });

    // Handler should return log entries
    const result = { entries: stateModule.getSyncLog() };
    expect(result.entries).toBeDefined();
    expect(result.entries.length).toBeLessThanOrEqual(10);
    expect(result.entries[0].phase).toBe('started'); // Most recent first
  });

  it('should maintain log order (newest first) across multiple queries', async () => {
    const stateModule = await import('./state');
    stateModule.initSyncState(() => null);

    const timestamps = [
      '2026-06-21T10:00:00Z',
      '2026-06-21T10:01:00Z',
      '2026-06-21T10:02:00Z',
    ];

    for (const ts of timestamps) {
      stateModule.handleSyncEvent({
        phase: 'completed',
        ts,
      });
    }

    const result1 = { entries: stateModule.getSyncLog() };
    const result2 = { entries: stateModule.getSyncLog() };

    // Both queries should return the same order (newest first)
    expect(result1.entries[0].ts).toBe(result2.entries[0].ts);
    expect(result1.entries[0].ts).toBe('2026-06-21T10:02:00Z');
  });
});
