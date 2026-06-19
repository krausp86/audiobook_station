import { getDb } from '../db';
import { getLatestPosition } from '../db/dao';
import { play } from '../mpd/control';
import { getMpd } from '../mpd';

/**
 * Restore the last played item on app startup.
 *
 * Behavior by last_status:
 * - 'playing': load media, seek to position, START playback (was actively playing)
 * - 'paused':  load media, seek to position, PAUSE immediately (user paused intentionally)
 * - 'stopped': do nothing (user explicitly stopped)
 *
 * For multi-track media (MP3-Ordner), restores both the track index and position within that track.
 */
export async function resumeLast(): Promise<void> {
  const db = getDb();
  const last = getLatestPosition(db);
  if (!last) return;

  // Ensure repeat/single are off — MPD may restore them from its state file
  const mpdInit = await getMpd();
  await mpdInit.send('repeat 0');
  await mpdInit.send('single 0');

  if (last.last_status === 'stopped') return;

  try {
    await play(last.media_path, last.position_seconds);

    if (last.track_index > 0) {
      const mpd = await getMpd();
      await mpd.send(`play ${last.track_index}`);
      await mpd.send(`seekcur ${Math.floor(last.position_seconds)}`);
    }

    // If the user had paused, pause immediately after loading
    if (last.last_status === 'paused') {
      const mpd = await getMpd();
      await mpd.send('pause 1');
    }
  } catch (err) {
    console.error('[resume] could not resume', last.media_path, err);
  }
}
