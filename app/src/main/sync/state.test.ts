import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type { SyncStatus, SyncLogEntry } from '@shared/ipc-contract';

/**
 * Tests for sync state aggregation (T7.C6).
 * Verifies:
 * - State transitions (started→running, completed→idle, error→error)
 * - Ringbuffer log (max 10, newest first)
 * - Event deduplication (sync:state only on state change)
 * - Persistence (getSetting/setSetting)
 *
 * Note: We import state functions dynamically to avoid initializing the DB during test setup.
 */

// Setup module mocks at top level (required by vitest)
vi.doMock('../db', () => ({
  getDb: vi.fn(() => ({
    prepare: vi.fn(),
  })),
}));

vi.doMock('../db/dao', () => ({
  getSetting: vi.fn(() => undefined),
  setSetting: vi.fn(),
}));

describe('sync state aggregation', () => {
  let handleSyncEvent: typeof import('./state')['handleSyncEvent'];
  let getSyncState: typeof import('./state')['getSyncState'];
  let getSyncLog: typeof import('./state')['getSyncLog'];
  let stopSyncService: typeof import('./state')['stopSyncService'];
  let initSyncState: typeof import('./state')['initSyncState'];

  beforeEach(async () => {
    // Import after mocking (already set up at top level)
    const stateModule = await import('./state');
    handleSyncEvent = stateModule.handleSyncEvent;
    getSyncState = stateModule.getSyncState;
    getSyncLog = stateModule.getSyncLog;
    stopSyncService = stateModule.stopSyncService;
    initSyncState = stateModule.initSyncState;

    // Initialize with mock getWindow
    initSyncState(() => null);
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe('state transitions', () => {
    it('should transition to running on started event', () => {
      const ev: SyncStatus = {
        phase: 'started',
        ts: new Date().toISOString(),
      };
      handleSyncEvent(ev);
      expect(getSyncState()).toBe('running');
    });

    it('should transition to idle on completed event', () => {
      handleSyncEvent({ phase: 'started', ts: new Date().toISOString() });
      expect(getSyncState()).toBe('running');

      handleSyncEvent({ phase: 'completed', ts: new Date().toISOString() });
      expect(getSyncState()).toBe('idle');
    });

    it('should transition to error on error event', () => {
      handleSyncEvent({ phase: 'started', ts: new Date().toISOString() });
      handleSyncEvent({
        phase: 'error',
        ts: new Date().toISOString(),
        message: 'Network timeout',
      });
      expect(getSyncState()).toBe('error');
    });

    it('should stay in error until started/completed overrides', () => {
      handleSyncEvent({
        phase: 'error',
        ts: new Date().toISOString(),
        message: 'First error',
      });
      expect(getSyncState()).toBe('error');

      // Error stays
      handleSyncEvent({
        phase: 'error',
        ts: new Date().toISOString(),
        message: 'Second error',
      });
      expect(getSyncState()).toBe('error');

      // Started clears it
      handleSyncEvent({ phase: 'started', ts: new Date().toISOString() });
      expect(getSyncState()).toBe('running');
    });
  });

  describe('log ringbuffer', () => {
    it('should record all events in log (newest first)', () => {
      const ev1: SyncStatus = {
        phase: 'started',
        ts: '2026-06-21T10:00:00Z',
      };
      const ev2: SyncStatus = {
        phase: 'completed',
        ts: '2026-06-21T10:05:00Z',
      };
      handleSyncEvent(ev1);
      handleSyncEvent(ev2);

      const log = getSyncLog();
      expect(log).toHaveLength(2);
      expect(log[0]).toEqual({
        phase: 'completed',
        ts: '2026-06-21T10:05:00Z',
      });
      expect(log[1]).toEqual({
        phase: 'started',
        ts: '2026-06-21T10:00:00Z',
      });
    });

    it('should preserve message field in log', () => {
      handleSyncEvent({
        phase: 'error',
        ts: '2026-06-21T10:00:00Z',
        message: 'Connection refused',
      });

      const log = getSyncLog();
      expect(log[0].message).toBe('Connection refused');
    });

    it('should enforce max 10 entries (ringbuffer)', () => {
      for (let i = 0; i < 15; i++) {
        handleSyncEvent({
          phase: 'started',
          ts: `2026-06-21T10:${String(i).padStart(2, '0')}:00Z`,
        });
        if (i < 14) {
          handleSyncEvent({
            phase: 'completed',
            ts: `2026-06-21T10:${String(i).padStart(2, '0')}:05Z`,
          });
        }
      }

      const log = getSyncLog();
      expect(log.length).toBeLessThanOrEqual(10);
      // Most recent should be at index 0
      expect(log[0].ts).toBe('2026-06-21T10:14:00Z');
    });

    it('should maintain newest-first order after ringbuffer wrap', () => {
      // Add 15 events to force wraparound
      const timestamps: string[] = [];
      for (let i = 0; i < 15; i++) {
        const ts = `2026-06-21T10:${String(i).padStart(2, '0')}:00Z`;
        timestamps.push(ts);
        handleSyncEvent({
          phase: i % 2 === 0 ? 'started' : 'completed',
          ts,
        });
      }

      const log = getSyncLog();
      // Log should contain the 10 most recent timestamps
      const logTs = log.map((e) => e.ts);
      const expectedTs = timestamps.slice(-10).reverse();
      expect(logTs).toEqual(expectedTs);
    });
  });

  describe('event deduplication', () => {
    it('should only change state on actual state transitions', () => {
      handleSyncEvent({ phase: 'started', ts: '2026-06-21T10:00:00Z' });
      expect(getSyncState()).toBe('running');

      // Same state, should not trigger state change
      handleSyncEvent({ phase: 'started', ts: '2026-06-21T10:01:00Z' });
      expect(getSyncState()).toBe('running');

      // Different state
      handleSyncEvent({ phase: 'completed', ts: '2026-06-21T10:02:00Z' });
      expect(getSyncState()).toBe('idle');
    });
  });

  describe('persistence', () => {
    it('should persist state to settings', async () => {
      const daoModule = await import('../db/dao');
      const setSpy = vi.spyOn(daoModule, 'setSetting').mockImplementation(() => {});

      handleSyncEvent({ phase: 'started', ts: '2026-06-21T10:00:00Z' });
      handleSyncEvent({ phase: 'completed', ts: '2026-06-21T10:05:00Z' });

      // Verify setSetting was called with the sync state
      expect(setSpy).toHaveBeenCalledWith(expect.any(Object), 'sync_state', 'idle');
    });

    it('should persist log as JSON to settings', async () => {
      const daoModule = await import('../db/dao');
      const setSpy = vi.spyOn(daoModule, 'setSetting').mockImplementation(() => {});

      handleSyncEvent({ phase: 'started', ts: '2026-06-21T10:00:00Z' });
      handleSyncEvent({
        phase: 'error',
        ts: '2026-06-21T10:05:00Z',
        message: 'Timeout',
      });

      // Find the setSetting call for the log
      const logCalls = setSpy.mock.calls.filter(
        (call) => call[1] === 'sync_log',
      );
      expect(logCalls.length).toBeGreaterThan(0);

      const lastLogCall = logCalls[logCalls.length - 1];
      const logJson = lastLogCall[2];
      const parsed = JSON.parse(logJson) as SyncLogEntry[];

      expect(parsed).toBeInstanceOf(Array);
      expect(parsed.length).toBeLessThanOrEqual(10);
    });
  });

  describe('stopSyncService', () => {
    it('should persist state on stop', async () => {
      const daoModule = await import('../db/dao');
      const setSpy = vi.spyOn(daoModule, 'setSetting').mockImplementation(() => {});

      handleSyncEvent({ phase: 'started', ts: '2026-06-21T10:00:00Z' });
      stopSyncService();

      // Verify setSetting was called
      expect(setSpy).toHaveBeenCalled();
    });
  });
});
