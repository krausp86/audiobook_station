import type { BrowserWindow } from 'electron';
import { getBtAdapter } from './adapter';

const POLL_INTERVAL = 5000;

/**
 * Start a background listener for Bluetooth connection changes.
 *
 * Polls the adapter status every 5s and emits `bt:connection` events
 * to the renderer only when the connected device actually changes.
 *
 * @param getWindow Callback to retrieve the current BrowserWindow
 * @returns Cleanup function to stop the listener
 */
export function startBtListener(
  getWindow: () => BrowserWindow | null,
): () => void {
  let stopped = false;
  let lastConnectedMac: string | null = null;

  const check = async (): Promise<void> => {
    if (stopped) return;
    try {
      const status = await getBtAdapter().getStatus();
      const currentMac = status.connected?.mac ?? null;

      if (currentMac !== lastConnectedMac) {
        lastConnectedMac = currentMac;
        getWindow()?.webContents.send('bt:connection', {
          device: status.connected ?? null,
          event: status.connected ? 'connected' : 'disconnected',
        });
      }
    } catch (err) {
      console.error('[bt-listen] check failed:', err);
    }
    if (!stopped) {
      setTimeout(() => void check(), POLL_INTERVAL);
    }
  };

  // Initialize from current state, then start polling
  void getBtAdapter().getStatus().then((s) => {
    lastConnectedMac = s.connected?.mac ?? null;
    setTimeout(() => void check(), POLL_INTERVAL);
  }).catch(() => {
    setTimeout(() => void check(), POLL_INTERVAL);
  });

  return () => { stopped = true; };
}
