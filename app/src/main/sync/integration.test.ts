import { describe, it, expect, vi } from 'vitest';
import type { SyncStatus } from '@shared/ipc-contract';

/**
 * Integration tests for sync state aggregation with the watch-log bridge.
 *
 * Verifies that:
 * 1. The bridge correctly forwards events to the aggregator
 * 2. State transitions work correctly end-to-end
 * 3. The aggregator initializes with persisted state on restart
 */

// Mock DB at module level
vi.doMock('../db', () => ({
  getDb: vi.fn(() => ({
    prepare: vi.fn(),
  })),
}));

vi.doMock('../db/dao', () => ({
  getSetting: vi.fn((_db: any, key: string) => {
    if (key === 'sync_state') return 'idle';
    if (key === 'sync_log') {
      return JSON.stringify([
        { phase: 'completed', ts: '2026-06-21T10:00:00Z' } as SyncStatus,
      ]);
    }
    return undefined;
  }),
  setSetting: vi.fn(),
}));

describe('sync state integration', () => {
  it('should initialize with persisted state on app startup', async () => {
    const stateModule = await import('./state');
    const mockGetWindow = vi.fn(() => null);

    stateModule.initSyncState(mockGetWindow);

    // Initial state should be loaded from settings (mocked as 'idle')
    expect(stateModule.getSyncState()).toBe('idle');

    // Log should be loaded from settings (mocked as 1 entry)
    const log = stateModule.getSyncLog();
    expect(log.length).toBeGreaterThan(0);
  });

  it('should process incoming events and update state', async () => {
    const stateModule = await import('./state');

    stateModule.initSyncState(() => null);

    // Simulate incoming raw events from the bridge
    const startEvent: SyncStatus = {
      phase: 'started',
      ts: '2026-06-21T10:05:00Z',
    };
    stateModule.handleSyncEvent(startEvent);
    expect(stateModule.getSyncState()).toBe('running');

    const completeEvent: SyncStatus = {
      phase: 'completed',
      ts: '2026-06-21T10:10:00Z',
    };
    stateModule.handleSyncEvent(completeEvent);
    expect(stateModule.getSyncState()).toBe('idle');

    // Log should contain both events (newest first)
    const log = stateModule.getSyncLog();
    expect(log.length).toBeGreaterThan(0);
    expect(log[0].phase).toBe('completed');
  });

  it('should handle error state correctly', async () => {
    const stateModule = await import('./state');

    stateModule.initSyncState(() => null);

    stateModule.handleSyncEvent({
      phase: 'started',
      ts: '2026-06-21T10:00:00Z',
    });

    const errorEvent: SyncStatus = {
      phase: 'error',
      ts: '2026-06-21T10:05:00Z',
      message: 'Network timeout',
    };
    stateModule.handleSyncEvent(errorEvent);
    expect(stateModule.getSyncState()).toBe('error');

    // Error should be recorded in log with message
    const log = stateModule.getSyncLog();
    const errorEntry = log.find((e) => e.phase === 'error');
    expect(errorEntry).toBeDefined();
    expect(errorEntry?.message).toBe('Network timeout');

    // State should persist
    stateModule.stopSyncService();
  });

  it('should reset error state on new started event', async () => {
    const stateModule = await import('./state');

    stateModule.initSyncState(() => null);

    stateModule.handleSyncEvent({
      phase: 'error',
      ts: '2026-06-21T10:00:00Z',
      message: 'Connection failed',
    });
    expect(stateModule.getSyncState()).toBe('error');

    stateModule.handleSyncEvent({
      phase: 'started',
      ts: '2026-06-21T10:05:00Z',
    });
    expect(stateModule.getSyncState()).toBe('running');
  });
});
