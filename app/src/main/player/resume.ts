import { getDb } from '../db';
import { getLatestPosition } from '../db/dao';
import { play } from '../mpd/control';
import { getMpd } from '../mpd';

/**
 * Resume playback of the most recently played item.
 * Called automatically on app startup.
 *
 * For multi-track media (MP3-Ordner), restores both the track index and position within that track.
 * If no previous position exists, silently returns (no-op).
 * If the last playback state was 'stopped', do not resume (user explicitly stopped).
 * If the position can be loaded but play fails, logs the error.
 */
export async function resumeLast(): Promise<void> {
  const db = getDb();
  const last = getLatestPosition(db);
  if (!last) return;

  // Do not resume if playback was explicitly stopped
  if (last.last_status === 'stopped') return;

  try {
    // Start playback from the media unit
    await play(last.media_path, last.position_seconds);

    // For multi-track media, jump to the correct track if track_index > 0
    if (last.track_index > 0) {
      const mpd = await getMpd();
      await mpd.send(`play ${last.track_index}`);
      // After jumping to the correct track, restore position within that track
      await mpd.send(`seekcur ${Math.floor(last.position_seconds)}`);
    }
  } catch (err) {
    console.error('[resume] could not resume', last.media_path, err);
  }
}
