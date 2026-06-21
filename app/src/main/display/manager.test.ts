import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { writeFile } from 'fs/promises';
import type { BrowserWindow, WebContents } from 'electron';
import {
  initDisplayManager,
  onPlayerStateChange,
  onTouch,
  stopDisplayManager,
} from './manager';

// Mock fs/promises
vi.mock('fs/promises');

const mockWriteFile = vi.mocked(writeFile);

describe('Display Manager', () => {
  let mockWindow: Partial<BrowserWindow> & { webContents: Partial<WebContents> };

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();
    mockWriteFile.mockResolvedValue(undefined);
    vi.useFakeTimers();

    // Create a mock window with webContents.send
    mockWindow = {
      webContents: {
        send: vi.fn(),
      } as unknown as WebContents,
    } as Partial<BrowserWindow> & { webContents: Partial<WebContents> };

    // Initialize with the mock window getter
    initDisplayManager(() => mockWindow as unknown as BrowserWindow);
  });

  afterEach(() => {
    stopDisplayManager();
    vi.useRealTimers();
  });

  describe('initDisplayManager', () => {
    it('should initialize without error', () => {
      expect(() => {
        initDisplayManager(() => mockWindow as BrowserWindow);
      }).not.toThrow();
    });

    it('should handle null window gracefully', () => {
      initDisplayManager(() => null);
      expect(() => {
        onPlayerStateChange('paused');
      }).not.toThrow();
    });
  });

  describe('onPlayerStateChange', () => {
    it('should disable inactivity timer when playing', () => {
      onPlayerStateChange('playing');

      // Timer should not fire even after 10 minutes
      vi.advanceTimersByTime(10 * 60 * 1000);
      expect(mockWriteFile).not.toHaveBeenCalledWith(
        '/sys/class/backlight/10-0045/bl_power',
        '1',
      );
    });

    it('should start inactivity timer when paused', async () => {
      onPlayerStateChange('paused');

      // Timer should not fire yet
      vi.advanceTimersByTime(4 * 60 * 1000);
      expect(mockWriteFile).not.toHaveBeenCalled();

      // But should fire after 5 minutes
      vi.advanceTimersByTime(1 * 60 * 1000);
      await vi.runAllTimersAsync();
      expect(mockWriteFile).toHaveBeenCalledWith(
        '/sys/class/backlight/10-0045/bl_power',
        '1',
      );
    });

    it('should start inactivity timer when stopped', async () => {
      onPlayerStateChange('stopped');

      // Timer should fire after 5 minutes
      vi.advanceTimersByTime(5 * 60 * 1000);
      await vi.runAllTimersAsync();
      expect(mockWriteFile).toHaveBeenCalledWith(
        '/sys/class/backlight/10-0045/bl_power',
        '1',
      );
    });
  });

  describe('onTouch', () => {
    it('should turn display on if off', async () => {
      onPlayerStateChange('paused');
      vi.advanceTimersByTime(5 * 60 * 1000); // Turn off
      await vi.runAllTimersAsync();

      vi.clearAllMocks();
      onTouch();
      await vi.runAllTimersAsync();

      expect(mockWriteFile).toHaveBeenCalledWith(
        '/sys/class/backlight/10-0045/bl_power',
        '0',
      );
      expect(mockWindow.webContents?.send).toHaveBeenCalledWith('display:state', { on: true });
    });

    it('should reset inactivity timer if display is on', async () => {
      onPlayerStateChange('paused');
      vi.advanceTimersByTime(4 * 60 * 1000);

      vi.clearAllMocks();
      onTouch();
      vi.advanceTimersByTime(4 * 60 * 1000);

      // Should not have turned off yet (timer was reset)
      expect(mockWriteFile).not.toHaveBeenCalled();

      // But should turn off after another minute
      vi.advanceTimersByTime(1 * 60 * 1000);
      await vi.runAllTimersAsync();
      expect(mockWriteFile).toHaveBeenCalledWith(
        '/sys/class/backlight/10-0045/bl_power',
        '1',
      );
    });

    it('should reset inactivity timer after waking display', async () => {
      onPlayerStateChange('paused');
      vi.advanceTimersByTime(5 * 60 * 1000); // Turn off
      await vi.runAllTimersAsync();
      vi.clearAllMocks();

      onTouch(); // Wake display
      vi.advanceTimersByTime(4 * 60 * 1000);

      // Should not have turned off yet (timer was reset)
      expect(mockWriteFile).not.toHaveBeenCalledWith(
        '/sys/class/backlight/10-0045/bl_power',
        '1',
      );

      // But should turn off after the reset timer expires
      vi.advanceTimersByTime(1 * 60 * 1000);
      await vi.runAllTimersAsync();
      expect(mockWriteFile).toHaveBeenCalledWith(
        '/sys/class/backlight/10-0045/bl_power',
        '1',
      );
    });
  });

  describe('stopDisplayManager', () => {
    it('should clear the inactivity timer', () => {
      vi.useFakeTimers();
      onPlayerStateChange('paused');
      stopDisplayManager();

      // Timer should not fire
      vi.advanceTimersByTime(10 * 60 * 1000);
      expect(mockWriteFile).not.toHaveBeenCalled();
      vi.useRealTimers();
    });
  });

  describe('error handling', () => {
    it('should log errors from writeFile and continue', async () => {
      const logSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      mockWriteFile.mockRejectedValueOnce(new Error('Permission denied'));

      onPlayerStateChange('paused');
      vi.advanceTimersByTime(5 * 60 * 1000);
      await vi.runAllTimersAsync();

      expect(logSpy).toHaveBeenCalledWith(
        '[display] displayOff failed:',
        expect.any(Error),
      );
      logSpy.mockRestore();
    });
  });

  describe('ENV overrides', () => {
    it('should use default HOERMOND_BACKLIGHT_PATH', async () => {
      onPlayerStateChange('paused');
      vi.advanceTimersByTime(5 * 60 * 1000);
      await vi.runAllTimersAsync();

      expect(mockWriteFile).toHaveBeenCalledWith(
        '/sys/class/backlight/10-0045/bl_power',
        '1',
      );
    });

    it('should use default HOERMOND_DISPLAY_TIMEOUT', async () => {
      onPlayerStateChange('paused');
      vi.advanceTimersByTime(4 * 60 * 1000);

      // Should not have fired yet (4 minutes)
      expect(mockWriteFile).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1 * 60 * 1000);
      // Should fire at 5 minutes
      await vi.runAllTimersAsync();
      expect(mockWriteFile).toHaveBeenCalledWith(
        '/sys/class/backlight/10-0045/bl_power',
        '1',
      );
    });
  });
});
