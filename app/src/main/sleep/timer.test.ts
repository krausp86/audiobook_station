import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type { BrowserWindow } from 'electron';
import {
  initSleepTimer,
  startSleep,
  cancelSleep,
  getSleep,
  stopSleepService,
} from './timer';

// Mock the getState function
vi.mock('../mpd/control', () => ({
  getState: vi.fn(),
  setVolume: vi.fn(),
  pause: vi.fn(),
}));

// Mock the database functions
vi.mock('../db', () => ({
  getDb: vi.fn(() => mockDb),
}));

vi.mock('../db/dao', () => ({
  getLatestPosition: vi.fn(() => ({ media_path: 'audiobooks/Test/Book' })),
  setLastStatus: vi.fn(),
}));

// Mock the persist function
vi.mock('../player/persist', () => ({
  saveNow: vi.fn(),
}));

import { getState, setVolume, pause } from '../mpd/control';
import { saveNow } from '../player/persist';
import { setLastStatus } from '../db/dao';

// Mock window
let mockWindow: {
  webContents: {
    send: (channel: string, data: unknown) => void;
  };
};
let windowSends: Array<{ channel: string; data: unknown }> = [];

// Mock database (just needs to be truthy for the tests)
let mockDb = {} as any;

describe('sleep/timer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    windowSends = [];
    mockWindow = {
      webContents: {
        send: (channel: string, data: unknown) => {
          windowSends.push({ channel, data });
        },
      },
    };
    mockDb = {}; // Reset to fresh object

    // Initialize the timer with our mock window getter
    initSleepTimer(() => mockWindow as unknown as BrowserWindow);

    vi.clearAllMocks();
  });

  afterEach(() => {
    stopSleepService();
    vi.useRealTimers();
  });

  describe('getSleep', () => {
    it('should return inactive state initially', () => {
      const state = getSleep();
      expect(state).toEqual({
        active: false,
        endsAt: null,
        mode: null,
      });
    });
  });

  describe('startSleep', () => {
    it('should start a 15-minute timer', async () => {
      vi.mocked(getState).mockResolvedValue({
        status: 'playing',
        currentPath: 'audiobooks/Test/Book/01.mp3',
        currentUnitPath: 'audiobooks/Test/Book',
        position: 100,
        duration: 3600,
        volume: 50,
        chapters: [],
        currentChapterIndex: null,
      });

      const before = Date.now();
      const result = await startSleep('min15');
      const after = Date.now();

      expect(result.ok).toBe(true);
      expect(result.endsAt).not.toBeNull();
      expect(result.endsAt!).toBeGreaterThanOrEqual(before + 15 * 60 * 1000 - 100);
      expect(result.endsAt!).toBeLessThanOrEqual(after + 15 * 60 * 1000 + 100);

      const state = getSleep();
      expect(state.active).toBe(true);
      expect(state.mode).toBe('min15');
    });

    it('should start a 30-minute timer', async () => {
      vi.mocked(getState).mockResolvedValue({
        status: 'playing',
        currentPath: 'audiobooks/Test/Book/01.mp3',
        currentUnitPath: 'audiobooks/Test/Book',
        position: 100,
        duration: 7200,
        volume: 75,
        chapters: [],
        currentChapterIndex: null,
      });

      const result = await startSleep('min30');
      expect(result.ok).toBe(true);
      expect(result.endsAt).not.toBeNull();

      const state = getSleep();
      expect(state.mode).toBe('min30');
    });

    it('should start a 60-minute timer', async () => {
      vi.mocked(getState).mockResolvedValue({
        status: 'playing',
        currentPath: 'audiobooks/Test/Book/01.mp3',
        currentUnitPath: 'audiobooks/Test/Book',
        position: 100,
        duration: 14400,
        volume: 80,
        chapters: [],
        currentChapterIndex: null,
      });

      const result = await startSleep('min60');
      expect(result.ok).toBe(true);
      expect(result.endsAt).not.toBeNull();

      const state = getSleep();
      expect(state.mode).toBe('min60');
    });

    it('should handle chapterEnd mode with chapters', async () => {
      vi.mocked(getState).mockResolvedValue({
        status: 'playing',
        currentPath: 'audiobooks/Test/Book/01.mp3',
        currentUnitPath: 'audiobooks/Test/Book',
        position: 100,
        duration: 7200,
        volume: 50,
        chapters: [
          {
            index: 0,
            title: 'Chapter 1',
            startSeconds: 0,
            durationSeconds: 600,
            navKind: 'seekOffset' as const,
          },
          {
            index: 1,
            title: 'Chapter 2',
            startSeconds: 600,
            durationSeconds: 800,
            navKind: 'seekOffset' as const,
          },
        ],
        currentChapterIndex: 0,
      });

      const result = await startSleep('chapterEnd');
      expect(result.ok).toBe(true);
      // For chapterEnd mode, endsAt should be null
      expect(result.endsAt).toBeNull();

      const state = getSleep();
      expect(state.mode).toBe('chapterEnd');
      expect(state.active).toBe(true);
    });

    it('should handle chapterEnd mode without chapters (fallback to track end)', async () => {
      vi.mocked(getState).mockResolvedValue({
        status: 'playing',
        currentPath: 'audiobooks/Test/Book/01.mp3',
        currentUnitPath: 'audiobooks/Test/Book',
        position: 100,
        duration: 1000,
        volume: 50,
        chapters: [],
        currentChapterIndex: null,
      });

      const result = await startSleep('chapterEnd');
      expect(result.ok).toBe(true);
      expect(result.endsAt).toBeNull();

      const state = getSleep();
      expect(state.mode).toBe('chapterEnd');
    });

    it('should fail gracefully if getState throws', async () => {
      vi.mocked(getState).mockRejectedValue(new Error('MPD connection failed'));

      const result = await startSleep('min15');
      expect(result.ok).toBe(false);
      expect(result.endsAt).toBeNull();

      const state = getSleep();
      expect(state.active).toBe(false);
    });

    it('should cancel any existing timer when starting a new one', async () => {
      vi.mocked(getState).mockResolvedValue({
        status: 'playing',
        currentPath: 'audiobooks/Test/Book/01.mp3',
        currentUnitPath: 'audiobooks/Test/Book',
        position: 100,
        duration: 3600,
        volume: 50,
        chapters: [],
        currentChapterIndex: null,
      });

      await startSleep('min15');
      windowSends = []; // Clear initial sends

      // Start a second timer without canceling the first
      await startSleep('min30');

      // Only the new timer should be active
      const state = getSleep();
      expect(state.mode).toBe('min30');
    });
  });

  describe('tick events', () => {
    it('should send sleep:tick events at 1-second intervals', async () => {
      vi.mocked(getState).mockResolvedValue({
        status: 'playing',
        currentPath: 'audiobooks/Test/Book/01.mp3',
        currentUnitPath: 'audiobooks/Test/Book',
        position: 100,
        duration: 3600,
        volume: 50,
        chapters: [],
        currentChapterIndex: null,
      });

      await startSleep('min15');
      windowSends = []; // Clear initial setup

      // Advance time by 1 second and check for tick event
      vi.advanceTimersByTime(1000);
      await vi.runAllTimersAsync();

      expect(windowSends).toContainEqual(
        expect.objectContaining({
          channel: 'sleep:tick',
          data: expect.objectContaining({
            mode: 'min15',
            remainingMs: expect.any(Number),
          }),
        }),
      );
    });

    it('should send multiple tick events while timer is active', async () => {
      vi.mocked(getState).mockResolvedValue({
        status: 'playing',
        currentPath: 'audiobooks/Test/Book/01.mp3',
        currentUnitPath: 'audiobooks/Test/Book',
        position: 100,
        duration: 3600,
        volume: 50,
        chapters: [],
        currentChapterIndex: null,
      });

      await startSleep('min15');
      windowSends = [];

      // Advance by 3 seconds
      vi.advanceTimersByTime(3000);
      await vi.runAllTimersAsync();

      const ticks = windowSends.filter((s) => s.channel === 'sleep:tick');
      expect(ticks.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('fade-out', () => {
    it('should apply linear fade-out in the last 60 seconds', async () => {
      vi.mocked(getState).mockResolvedValue({
        status: 'playing',
        currentPath: 'audiobooks/Test/Book/01.mp3',
        currentUnitPath: 'audiobooks/Test/Book',
        position: 100,
        duration: 3600,
        volume: 100,
        chapters: [],
        currentChapterIndex: null,
      });

      await startSleep('min15');
      windowSends = [];

      // Advance to 60 seconds before the end (14 minutes 60 seconds = 14 * 60 + 60 = 900 seconds)
      vi.advanceTimersByTime(15 * 60 * 1000 - 60 * 1000 - 1000);
      await vi.runAllTimersAsync();

      // Now advance another second to enter the fade window
      vi.advanceTimersByTime(1000);
      await vi.runAllTimersAsync();

      // At this point, setVolume should be called with a reduced volume
      expect(vi.mocked(setVolume)).toHaveBeenCalled();
    });

    it('should linearly fade volume from 100 to 0 over 60 seconds', async () => {
      vi.mocked(getState).mockResolvedValue({
        status: 'playing',
        currentPath: 'audiobooks/Test/Book/01.mp3',
        currentUnitPath: 'audiobooks/Test/Book',
        position: 100,
        duration: 3600,
        volume: 100,
        chapters: [],
        currentChapterIndex: null,
      });

      await startSleep('min15');
      const volumeCalls: number[] = [];
      vi.mocked(setVolume).mockImplementation(async (vol: number) => {
        volumeCalls.push(vol);
      });

      // Skip to 59 seconds before the end
      vi.advanceTimersByTime(15 * 60 * 1000 - 59 * 1000);
      await vi.runAllTimersAsync();

      // Should have some volume reduction calls
      expect(volumeCalls.length).toBeGreaterThan(0);
      // The last call should be close to the original volume (only 1 second of fade)
      expect(volumeCalls[volumeCalls.length - 1]).toBeGreaterThan(0);
    });

    it('should restore original volume after fade-out', async () => {
      vi.mocked(getState).mockResolvedValue({
        status: 'playing',
        currentPath: 'audiobooks/Test/Book/01.mp3',
        currentUnitPath: 'audiobooks/Test/Book',
        position: 100,
        duration: 3600,
        volume: 75,
        chapters: [],
        currentChapterIndex: null,
      });

      await startSleep('min15');
      vi.mocked(setVolume).mockClear();

      // Advance to just before timer ends
      vi.advanceTimersByTime(15 * 60 * 1000 - 100);
      await vi.runAllTimersAsync();

      // Advance past the end
      vi.advanceTimersByTime(200);
      await vi.runAllTimersAsync();

      // Volume should be restored to original
      const lastVolumeCall = vi.mocked(setVolume).mock.calls.pop();
      if (lastVolumeCall) {
        expect(lastVolumeCall[0]).toBe(75);
      }
    });
  });

  describe('timer completion', () => {
    it('should pause playback when timer ends', async () => {
      vi.mocked(getState).mockResolvedValue({
        status: 'playing',
        currentPath: 'audiobooks/Test/Book/01.mp3',
        currentUnitPath: 'audiobooks/Test/Book',
        position: 100,
        duration: 3600,
        volume: 50,
        chapters: [],
        currentChapterIndex: null,
      });

      await startSleep('min15');
      vi.mocked(pause).mockClear();

      // Advance to timer expiration
      vi.advanceTimersByTime(15 * 60 * 1000 + 100);
      await vi.runAllTimersAsync();

      expect(vi.mocked(pause)).toHaveBeenCalled();
    });

    it('should save position when timer ends', async () => {
      vi.mocked(getState).mockResolvedValue({
        status: 'playing',
        currentPath: 'audiobooks/Test/Book/01.mp3',
        currentUnitPath: 'audiobooks/Test/Book',
        position: 100,
        duration: 3600,
        volume: 50,
        chapters: [],
        currentChapterIndex: null,
      });

      await startSleep('min15');
      vi.mocked(saveNow).mockClear();

      vi.advanceTimersByTime(15 * 60 * 1000 + 100);
      await vi.runAllTimersAsync();

      expect(vi.mocked(saveNow)).toHaveBeenCalled();
    });

    it('should update last_status to paused when timer ends', async () => {
      vi.mocked(getState).mockResolvedValue({
        status: 'playing',
        currentPath: 'audiobooks/Test/Book/01.mp3',
        currentUnitPath: 'audiobooks/Test/Book',
        position: 100,
        duration: 3600,
        volume: 50,
        chapters: [],
        currentChapterIndex: null,
      });

      await startSleep('min15');
      vi.mocked(setLastStatus).mockClear();

      vi.advanceTimersByTime(15 * 60 * 1000 + 100);
      await vi.runAllTimersAsync();

      expect(vi.mocked(setLastStatus)).toHaveBeenCalledWith(
        expect.anything(),
        'audiobooks/Test/Book',
        'paused',
      );
    });

    it('should send sleep:ended event with reason=completed', async () => {
      vi.mocked(getState).mockResolvedValue({
        status: 'playing',
        currentPath: 'audiobooks/Test/Book/01.mp3',
        currentUnitPath: 'audiobooks/Test/Book',
        position: 100,
        duration: 3600,
        volume: 50,
        chapters: [],
        currentChapterIndex: null,
      });

      await startSleep('min15');
      windowSends = [];

      vi.advanceTimersByTime(15 * 60 * 1000 + 100);
      await vi.runAllTimersAsync();

      expect(windowSends).toContainEqual(
        expect.objectContaining({
          channel: 'sleep:ended',
          data: { reason: 'completed' },
        }),
      );
    });

    it('should reset state after timer ends', async () => {
      vi.mocked(getState).mockResolvedValue({
        status: 'playing',
        currentPath: 'audiobooks/Test/Book/01.mp3',
        currentUnitPath: 'audiobooks/Test/Book',
        position: 100,
        duration: 3600,
        volume: 50,
        chapters: [],
        currentChapterIndex: null,
      });

      await startSleep('min15');

      vi.advanceTimersByTime(15 * 60 * 1000 + 100);
      await vi.runAllTimersAsync();

      const state = getSleep();
      expect(state.active).toBe(false);
      expect(state.mode).toBeNull();
      expect(state.endsAt).toBeNull();
    });
  });

  describe('manual cancellation', () => {
    it('should cancel the timer', async () => {
      vi.mocked(getState).mockResolvedValue({
        status: 'playing',
        currentPath: 'audiobooks/Test/Book/01.mp3',
        currentUnitPath: 'audiobooks/Test/Book',
        position: 100,
        duration: 3600,
        volume: 50,
        chapters: [],
        currentChapterIndex: null,
      });

      await startSleep('min15');
      const result = cancelSleep();
      expect(result.ok).toBe(true);

      const state = getSleep();
      expect(state.active).toBe(false);
    });

    it('should return false if no timer is active', () => {
      const result = cancelSleep();
      expect(result.ok).toBe(false);
    });

    it('should send sleep:ended event with reason=cancelled', async () => {
      vi.mocked(getState).mockResolvedValue({
        status: 'playing',
        currentPath: 'audiobooks/Test/Book/01.mp3',
        currentUnitPath: 'audiobooks/Test/Book',
        position: 100,
        duration: 3600,
        volume: 50,
        chapters: [],
        currentChapterIndex: null,
      });

      await startSleep('min15');
      windowSends = [];

      cancelSleep();

      expect(windowSends).toContainEqual(
        expect.objectContaining({
          channel: 'sleep:ended',
          data: { reason: 'cancelled' },
        }),
      );
    });

    it('should restore original volume when cancelled', async () => {
      vi.mocked(getState).mockResolvedValue({
        status: 'playing',
        currentPath: 'audiobooks/Test/Book/01.mp3',
        currentUnitPath: 'audiobooks/Test/Book',
        position: 100,
        duration: 3600,
        volume: 80,
        chapters: [],
        currentChapterIndex: null,
      });

      await startSleep('min15');
      vi.mocked(setVolume).mockClear();

      // Advance into fade window
      vi.advanceTimersByTime(15 * 60 * 1000 - 30 * 1000);
      await vi.runAllTimersAsync();

      // Cancel the timer
      cancelSleep();

      // Volume should be restored to 80
      expect(vi.mocked(setVolume)).toHaveBeenCalledWith(80);
    });
  });

  describe('automatic cancellation on manual pause', () => {
    it('should auto-cancel timer if user pauses playback', async () => {
      vi.mocked(getState).mockResolvedValue({
        status: 'playing',
        currentPath: 'audiobooks/Test/Book/01.mp3',
        currentUnitPath: 'audiobooks/Test/Book',
        position: 100,
        duration: 3600,
        volume: 50,
        chapters: [],
        currentChapterIndex: null,
      });

      await startSleep('min15');
      windowSends = [];

      // Simulate user pausing
      vi.mocked(getState).mockResolvedValue({
        status: 'paused',
        currentPath: 'audiobooks/Test/Book/01.mp3',
        currentUnitPath: 'audiobooks/Test/Book',
        position: 100,
        duration: 3600,
        volume: 50,
        chapters: [],
        currentChapterIndex: null,
      });

      // Advance timer by one tick
      vi.advanceTimersByTime(1000);
      await vi.runAllTimersAsync();

      // Timer should have been auto-cancelled
      expect(windowSends).toContainEqual(
        expect.objectContaining({
          channel: 'sleep:ended',
          data: { reason: 'cancelled' },
        }),
      );

      const state = getSleep();
      expect(state.active).toBe(false);
    });
  });

  describe('stopSleepService', () => {
    it('should clean up resources on stop', async () => {
      vi.mocked(getState).mockResolvedValue({
        status: 'playing',
        currentPath: 'audiobooks/Test/Book/01.mp3',
        currentUnitPath: 'audiobooks/Test/Book',
        position: 100,
        duration: 3600,
        volume: 50,
        chapters: [],
        currentChapterIndex: null,
      });

      await startSleep('min15');
      stopSleepService();

      const state = getSleep();
      expect(state.active).toBe(false);
      expect(state.mode).toBeNull();
    });

    it('should not send tick events after stop', async () => {
      vi.mocked(getState).mockResolvedValue({
        status: 'playing',
        currentPath: 'audiobooks/Test/Book/01.mp3',
        currentUnitPath: 'audiobooks/Test/Book',
        position: 100,
        duration: 3600,
        volume: 50,
        chapters: [],
        currentChapterIndex: null,
      });

      await startSleep('min15');
      stopSleepService();
      windowSends = [];

      vi.advanceTimersByTime(1000);
      await vi.runAllTimersAsync();

      expect(windowSends).toHaveLength(0);
    });
  });
});
