import { Socket } from 'net';
import type { BrowserWindow } from 'electron';
import { getState } from './control';
import { invalidateChaptersCache } from './chapters';

const MPD_HOST = process.env['HOERMOND_MPD_HOST'] ?? '127.0.0.1';
const MPD_PORT = Number(process.env['HOERMOND_MPD_PORT'] ?? 6600);

/**
 * Start the MPD idle loop for real-time player state updates.
 *
 * This opens a dedicated connection to MPD's idle subsystem.
 * When any of (player, mixer, playlist, database, update) changes,
 * MPD wakes the idle command and we push the new state to the renderer.
 *
 * The idle connection is separate from the main command connection,
 * allowing long-lived idle blocking without blocking regular commands.
 *
 * @param getWindow callback to get the current BrowserWindow
 * @returns cleanup function to stop the idle loop
 */
export function startIdleLoop(getWindow: () => BrowserWindow | null): () => void {
  let stopped = false;
  let sock: Socket | null = null;
  let backoff = 500;

  /**
   * Query current player state and send to renderer.
   */
  const pushState = async (): Promise<void> => {
    try {
      const state = await getState();
      getWindow()?.webContents.send('player:state', state);
    } catch (err) {
      console.error('[idle] pushState failed:', err);
    }
  };

  /**
   * Attempt to connect to MPD idle subsystem. Retries with exponential backoff on failure.
   */
  const connect = (): void => {
    if (stopped) return;
    const s = new Socket();
    sock = s;
    s.setEncoding('utf8');
    let buffer = '';
    let greeted = false;

    s.connect(MPD_PORT, MPD_HOST, () => {
      backoff = 500;
    });

    s.on('data', (chunk: string) => {
      buffer += chunk;
      if (!greeted) {
        if (buffer.includes('OK MPD')) {
          greeted = true;
          buffer = '';
          void pushState();
          s.write('idle player mixer playlist database update\n');
        }
        return;
      }
      if (buffer.includes('OK\n')) {
        const changed = /changed: /.test(buffer);
        const changedDatabase = /changed: (database|update)/.test(buffer);
        const changedPlaylist = /changed: playlist/.test(buffer);
        buffer = '';
        if (changed) {
          void pushState();
        }
        if (changedDatabase || changedPlaylist) {
          invalidateChaptersCache();
        }
        if (changedDatabase) {
          getWindow()?.webContents.send('library:updated', { ts: Date.now() });
        }
        if (!stopped) s.write('idle player mixer playlist database update\n');
      }
    });

    const onClose = (): void => {
      if (stopped) return;
      sock = null;
      backoff = Math.min(backoff * 2, 10000);
      setTimeout(connect, backoff);
    };
    s.on('error', () => s.destroy());
    s.on('close', onClose);
  };

  connect();

  return () => {
    stopped = true;
    sock?.destroy();
    sock = null;
  };
}
