import { getDb } from '../db';
import { getLatestPosition } from '../db/dao';
import { play } from '../mpd/control';

/**
 * Resume playback of the most recently played item.
 * Called automatically on app startup.
 *
 * If no previous position exists, silently returns (no-op).
 * If the position can be loaded but play fails, logs the error.
 */
export async function resumeLast(): Promise<void> {
  const db = getDb();
  const last = getLatestPosition(db);
  if (!last) return;
  try {
    await play(last.media_path, last.position_seconds);
  } catch (err) {
    console.error('[resume] could not resume', last.media_path, err);
  }
}
