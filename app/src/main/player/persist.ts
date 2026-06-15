import { getDb } from '../db';
import { upsertPosition } from '../db/dao';
import { getState } from '../mpd/control';

const SAVE_INTERVAL_MS = 10_000;

/**
 * Save the current playback position to SQLite.
 * Called internally on interval and explicitly from pause/stop handlers.
 *
 * Process:
 * 1. Query current player state from MPD
 * 2. Extract unit path from the current file path
 * 3. Insert or update position in playback_position table
 */
async function saveNowInternal(): Promise<void> {
  try {
    const st = await getState();
    if (st.status !== 'playing' || !st.currentPath) return;

    // Extract unit path (same logic as in listLibrary)
    const parts = st.currentPath.split('/');
    const unitPath = parts.slice(0, Math.min(3, parts.length - 1)).join('/') || parts[0];

    const type = unitPath.startsWith('audiobooks') ? 'audiobook' : 'music';
    const db = getDb();

    // Ensure the media item exists in the catalog
    db.prepare(
      `INSERT OR IGNORE INTO media (path, type, title, added_at) VALUES (@path, @type, @title, @ts)`,
    ).run({
      path: unitPath,
      type,
      title: parts[parts.length - 2] ?? unitPath,
      ts: new Date().toISOString(),
    });

    // Upsert position
    upsertPosition(db, unitPath, 0, st.position);
  } catch (err) {
    console.error('[persist] save failed:', err);
  }
}

/**
 * Synchronously save the current playback position (used by pause/stop handlers).
 */
export async function saveNow(): Promise<void> {
  return saveNowInternal();
}

/**
 * Start periodic playback position saving (every 10 seconds while playing).
 * @returns cleanup function to stop the interval
 */
export function startPositionPersistence(): () => void {
  const timer = setInterval(() => {
    void saveNowInternal();
  }, SAVE_INTERVAL_MS);
  return () => clearInterval(timer);
}
