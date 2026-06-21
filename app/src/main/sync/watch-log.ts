import { watch, existsSync, statSync, openSync, readSync, closeSync } from 'fs';
import type { BrowserWindow } from 'electron';
import type { SyncStatus } from '@shared/ipc-contract';

const LOG_PATH =
  process.env['HOERMOND_SYNC_LOG'] ?? '/var/lib/mediaplayer/sync/sync.log';

/**
 * Monitor the Pi's sync log file for status updates.
 * Parses JSON events and pushes them to the renderer via 'sync:status' event.
 *
 * The sync log is a line-delimited JSON file written by the Pi's rsync process.
 * Each line is a SyncStatus event { phase, ts, message? }.
 *
 * This connection is passive — it reads and forwards events without interfering
 * with the Pi's sync process.
 *
 * @param getWindow callback to get the current BrowserWindow
 * @param onEvent optional internal callback to process each event (e.g., for aggregation)
 * @returns cleanup function to close the file watcher
 */
export function startSyncLogBridge(
  getWindow: () => BrowserWindow | null,
  onEvent?: (ev: SyncStatus) => void,
): () => void {
  // Exit early if log file doesn't exist yet
  if (!existsSync(LOG_PATH)) {
    return () => {};
  }

  // Start reading from the end of the file
  let offset = statSync(LOG_PATH).size;

  /**
   * Read new content from log file and parse JSON events.
   */
  const readNew = (): void => {
    try {
      const size = statSync(LOG_PATH).size;
      if (size <= offset) return;

      const fd = openSync(LOG_PATH, 'r');
      const buf = Buffer.alloc(size - offset);
      readSync(fd, buf, 0, buf.length, offset);
      closeSync(fd);
      offset = size;

      // Parse line-delimited JSON
      for (const line of buf.toString('utf8').split('\n')) {
        if (!line.trim()) continue;
        try {
          const ev = JSON.parse(line) as SyncStatus;
          // Forward to renderer
          getWindow()?.webContents.send('sync:status', ev);
          // Optionally notify internal listener (e.g., aggregator)
          onEvent?.(ev);
        } catch {
          // Skip unparseable/incomplete lines
        }
      }
    } catch (err) {
      console.error('[sync-bridge] read failed:', err);
    }
  };

  // Watch for file changes
  const watcher = watch(LOG_PATH, { persistent: false }, readNew);
  return () => watcher.close();
}
