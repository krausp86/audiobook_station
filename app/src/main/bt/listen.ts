import { spawn, type ChildProcess } from 'child_process';
import type { BrowserWindow } from 'electron';
import { getBtAdapter } from './adapter';

/**
 * Start a background listener for Bluetooth connection events.
 *
 * Spawns a long-running `bluetoothctl` process in interactive mode and monitors stdout
 * for connection state changes:
 * ```
 * [CHG] Device AA:BB:CC:DD:EE:FF Connected: yes
 * [CHG] Device AA:BB:CC:DD:EE:FF Connected: no
 * ```
 *
 * When a change is detected, queries the full adapter status and emits a `bt:connection` event
 * to the renderer with the connected device (or null if disconnected).
 *
 * Implements automatic reconnect with exponential backoff if the subprocess dies.
 *
 * @param getWindow Callback to retrieve the current BrowserWindow (may return null if window is closed)
 * @returns Cleanup function to stop the listener and kill the subprocess
 */
export function startBtListener(
  getWindow: () => BrowserWindow | null,
): () => void {
  let stopped = false;
  let proc: ChildProcess | null = null;
  let backoff = 500;
  let lastConnectedMac: string | null = null;
  let debounceTimer: NodeJS.Timeout | null = null;

  /**
   * Fetch the current BT status and emit event to renderer if connection state changed.
   * Implements debouncing: only fires event on actual state change.
   * Uses a 150ms debounce to coalesce multiple [CHG] lines per state transition.
   */
  const handleConnectionChange = async (): Promise<void> => {
    try {
      const status = await getBtAdapter().getStatus();
      const currentConnectedMac = status.connected?.mac ?? null;

      // Debounce: only emit if actual change
      if (currentConnectedMac === lastConnectedMac) {
        return;
      }

      lastConnectedMac = currentConnectedMac;

      const win = getWindow();
      if (win) {
        win.webContents.send('bt:connection', {
          device: status.connected ?? null,
          event: status.connected ? 'connected' : 'disconnected',
        });
      }
    } catch (err) {
      console.error('[bt-listen] handleConnectionChange failed:', err);
    }
  };

  /**
   * Attempt to connect to bluetoothctl's event stream.
   * Retries with exponential backoff on connection failure.
   */
  const connect = (): void => {
    if (stopped) return;

    try {
      proc = spawn('bluetoothctl', [], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let buffer = '';

      proc.stdout?.on('data', (chunk: Buffer) => {
        buffer += chunk.toString('utf8');

        // Parse line by line
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? ''; // Keep incomplete line for next chunk

        for (const line of lines) {
          const trimmed = line.trim();

          // Look for connection state changes
          if (/^\[CHG\]\s+Device\s+[0-9A-Fa-f:]+\s+Connected:\s+(yes|no)/.test(trimmed)) {
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => void handleConnectionChange(), 150);
          }
        }
      });

      const onClose = (): void => {
        if (stopped) return;
        proc = null;
        backoff = Math.min(backoff * 2, 10000);
        setTimeout(connect, backoff);
      };

      proc.on('error', (err) => {
        console.error('[bt-listen] spawn error:', err);
        proc?.kill();
      });

      proc.on('close', onClose);

      // Reset backoff on successful connection
      backoff = 500;
    } catch (err) {
      console.error('[bt-listen] connect failed:', err);
      backoff = Math.min(backoff * 2, 10000);
      setTimeout(connect, backoff);
    }
  };

  connect();

  return () => {
    stopped = true;
    if (debounceTimer) clearTimeout(debounceTimer);
    if (proc) {
      proc.kill();
      proc = null;
    }
  };
}
