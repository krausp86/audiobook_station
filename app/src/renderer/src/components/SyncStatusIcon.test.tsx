import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { SyncState, SyncLogEntry } from '@shared/ipc-contract';

// Mock the i18n context
vi.mock('../i18n/I18nContext', () => ({
  useT: () => (key: string) => key,
}));

import SyncStatusIcon from './SyncStatusIcon';

/**
 * Test suite for SyncStatusIcon component.
 * Tests rendering of sync status (idle/running/error) and error overlay.
 */

const mockInvoke = vi.fn();
const mockOn = vi.fn();

describe('SyncStatusIcon', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInvoke.mockResolvedValue({ state: 'idle', entries: [] });
    mockOn.mockReturnValue(vi.fn()); // Returns unsubscribe function

    // @ts-expect-error - mocking window.hoermond
    window.hoermond = {
      invoke: mockInvoke,
      on: mockOn,
    };
  });

  describe('Initialization', () => {
    it('should load initial sync state on mount', async () => {
      render(<SyncStatusIcon />);

      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith('sync:getState', undefined);
      });
    });

    it('should subscribe to sync:state events', async () => {
      render(<SyncStatusIcon />);

      await waitFor(() => {
        expect(mockOn).toHaveBeenCalledWith(
          'sync:state',
          expect.any(Function),
        );
      });
    });

    it('should unsubscribe on unmount', async () => {
      const unsubscribe = vi.fn();
      mockOn.mockReturnValue(unsubscribe);

      const { unmount } = render(<SyncStatusIcon />);

      await waitFor(() => {
        expect(mockOn).toHaveBeenCalled();
      });

      unmount();

      expect(unsubscribe).toHaveBeenCalled();
    });
  });

  describe('State rendering - Idle', () => {
    it('should render idle state with correct aria label', async () => {
      mockInvoke.mockResolvedValue({ state: 'idle' } as {
        state: SyncState;
      });
      render(<SyncStatusIcon />);

      const icon = await screen.findByRole('button', {
        name: 'sync.icon.idle',
      });
      expect(icon).toBeInTheDocument();
    });

    it('should render checkmark SVG for idle state', async () => {
      mockInvoke.mockResolvedValue({ state: 'idle' } as {
        state: SyncState;
      });
      const { container } = render(<SyncStatusIcon />);

      await waitFor(() => {
        const svg = container.querySelector(
          '.sync-status-icon--idle svg polyline',
        );
        expect(svg).toBeInTheDocument();
      });
    });
  });

  describe('State rendering - Running', () => {
    it('should render running state with correct aria label', async () => {
      mockInvoke.mockResolvedValue({ state: 'running' } as {
        state: SyncState;
      });
      render(<SyncStatusIcon />);

      const icon = await screen.findByRole('button', {
        name: 'sync.icon.running',
      });
      expect(icon).toBeInTheDocument();
    });

    it('should render spinning refresh icon for running state', async () => {
      mockInvoke.mockResolvedValue({ state: 'running' } as {
        state: SyncState;
      });
      const { container } = render(<SyncStatusIcon />);

      await waitFor(() => {
        const spinningIcon = container.querySelector(
          '.sync-status-icon-svg--spinning',
        );
        expect(spinningIcon).toBeInTheDocument();
      });
    });
  });

  describe('State rendering - Error', () => {
    it('should render error state with correct aria label', async () => {
      mockInvoke.mockResolvedValue({ state: 'error' } as {
        state: SyncState;
      });
      render(<SyncStatusIcon />);

      const icon = await screen.findByRole('button', {
        name: 'sync.icon.error',
      });
      expect(icon).toBeInTheDocument();
    });

    it('should load error log on error state', async () => {
      mockInvoke.mockResolvedValue({ state: 'error' } as {
        state: SyncState;
      });
      render(<SyncStatusIcon />);

      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith('sync:getLog', undefined);
      });
    });

    it('should render warning triangle SVG for error state', async () => {
      mockInvoke.mockResolvedValue({ state: 'error' } as {
        state: SyncState;
      });
      const { container } = render(<SyncStatusIcon />);

      await waitFor(() => {
        const warningIcon = container.querySelector(
          '.sync-status-icon--error svg path',
        );
        expect(warningIcon).toBeInTheDocument();
      });
    });
  });

  describe('State transitions', () => {
    it('should handle state change events', async () => {
      let stateCallback: ((e: { state: SyncState }) => void) | null = null;
      mockOn.mockImplementation((event, callback) => {
        if (event === 'sync:state') {
          stateCallback = callback as (e: { state: SyncState }) => void;
        }
        return vi.fn();
      });

      mockInvoke.mockResolvedValue({ state: 'idle' } as {
        state: SyncState;
      });
      render(<SyncStatusIcon />);

      await waitFor(() => {
        expect(mockOn).toHaveBeenCalledWith('sync:state', expect.any(Function));
      });

      // Simulate state transition to error
      if (stateCallback) {
        stateCallback({ state: 'error' });
        // After state change to error, sync:getLog should be called
        expect(mockInvoke).toHaveBeenCalledWith('sync:getLog', undefined);
      }
    });

    it('should reload error log when transitioning to error state', async () => {
      let stateCallback: ((e: { state: SyncState }) => void) | null = null;
      mockOn.mockImplementation((event, callback) => {
        if (event === 'sync:state') {
          stateCallback = callback as (e: { state: SyncState }) => void;
        }
        return vi.fn();
      });

      mockInvoke.mockResolvedValue({ state: 'running' } as {
        state: SyncState;
      });
      render(<SyncStatusIcon />);

      // Clear the mock to track new calls
      mockInvoke.mockClear();

      if (stateCallback) {
        stateCallback({ state: 'error' });

        await waitFor(() => {
          expect(mockInvoke).toHaveBeenCalledWith('sync:getLog', undefined);
        });
      }
    });
  });

  describe('Error overlay', () => {
    it('should not show overlay by default', async () => {
      mockInvoke.mockResolvedValue({ state: 'idle' } as {
        state: SyncState;
      });
      const { container } = render(<SyncStatusIcon />);

      await waitFor(() => {
        expect(
          container.querySelector('.sync-details-scrim'),
        ).not.toBeInTheDocument();
      });
    });

    it('should render overlay when tapping error state', async () => {
      mockInvoke.mockResolvedValue({
        state: 'error',
        entries: [],
      });
      const { container } = render(<SyncStatusIcon />);

      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith('sync:getState', undefined);
      });

      const button = screen.getByRole('button', {
        name: 'sync.icon.error',
      });
      button.click();

      await waitFor(() => {
        expect(
          container.querySelector('.sync-details-scrim'),
        ).toBeInTheDocument();
      });
    });

    it('should display error message in overlay', async () => {
      const errorEntry: SyncLogEntry = {
        phase: 'error',
        ts: '2026-06-21T10:30:00Z',
        message: 'Network timeout',
      };

      mockInvoke.mockImplementation((cmd) => {
        if (cmd === 'sync:getState') {
          return Promise.resolve({ state: 'error' });
        }
        if (cmd === 'sync:getLog') {
          return Promise.resolve({ entries: [errorEntry] });
        }
        return Promise.resolve(null);
      });

      const { container } = render(<SyncStatusIcon />);

      await waitFor(() => {
        expect(container.textContent).toContain('Network timeout');
      });
    });

    it('should close overlay on button click', async () => {
      mockInvoke.mockResolvedValue({
        state: 'error',
        entries: [],
      });
      const { container } = render(<SyncStatusIcon />);

      const button = screen.getByRole('button', {
        name: 'sync.icon.error',
      });
      button.click();

      await waitFor(() => {
        expect(
          container.querySelector('.sync-details-scrim'),
        ).toBeInTheDocument();
      });

      const closeButton = screen.getByRole('button', {
        name: 'sync.details.close',
      });
      closeButton.click();

      await waitFor(() => {
        expect(
          container.querySelector('.sync-details-scrim.is-closing'),
        ).toBeInTheDocument();
      });
    });

    it('should close overlay on scrim click', async () => {
      mockInvoke.mockResolvedValue({
        state: 'error',
        entries: [],
      });
      const { container } = render(<SyncStatusIcon />);

      const button = screen.getByRole('button', {
        name: 'sync.icon.error',
      });
      button.click();

      await waitFor(() => {
        const scrim = container.querySelector('.sync-details-scrim');
        expect(scrim).toBeInTheDocument();

        scrim?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      await waitFor(() => {
        expect(
          container.querySelector('.sync-details-scrim.is-closing'),
        ).toBeInTheDocument();
      });
    });
  });

  describe('Accessibility', () => {
    it('should have proper dialog attributes in overlay', async () => {
      mockInvoke.mockResolvedValue({
        state: 'error',
        entries: [],
      });
      const { container } = render(<SyncStatusIcon />);

      const button = screen.getByRole('button', {
        name: 'sync.icon.error',
      });
      button.click();

      await waitFor(() => {
        const dialog = container.querySelector(
          '.sync-details-card[role="dialog"]',
        );
        expect(dialog).toBeInTheDocument();
        expect(dialog).toHaveAttribute('aria-label', 'sync.details.title');
      });
    });
  });
});
