import { getDb } from '../db';
import { upsertPosition } from '../db/dao';
import { getState } from '../mpd/control';
import { getMpd } from '../mpd';
import { unitPathFor, mediaTypeForPath, displayTitleFor } from '../library/grouping';
import { getDirectoryIndex } from '../library/directory-index';

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

    const type = mediaTypeForPath(st.currentPath);
    const unitPath = unitPathFor(st.currentPath, await getDirectoryIndex());

    // Der `Title`-Tag wird nur für Einzelsongs gebraucht — bei einer Ordner-Einheit
    // gewinnt ohnehin der Ordnername. Den Roundtrip also nur dann.
    let titleTag: string | undefined;
    if (unitPath === st.currentPath) {
      const mpdForTags = await getMpd();
      const [song] = (await mpdForTags.send('currentsong')) ?? [];
      titleTag = song?.['Title'];
    }
    const displayTitle = displayTitleFor(unitPath, titleTag);

    const db = getDb();

    // Ensure the media item exists in the catalog
    db.prepare(
      `INSERT OR IGNORE INTO media (path, type, title, added_at) VALUES (@path, @type, @title, @ts)`,
    ).run({
      path: unitPath,
      type,
      title: displayTitle,
      ts: new Date().toISOString(),
    });

    // Get current track index and track-relative position from MPD for multi-track media (e.g., MP3-Ordner)
    // Note: st.position is now GLOBAL for MP3-Ordner, but we need to store TRACK-RELATIVE position
    // in the database so resume.ts can correctly restore with seekcur.
    const mpd = await getMpd();
    const [status] = await mpd.send('status');
    const st2 = status ?? {};
    const trackIndex = st2['song'] ? parseInt(st2['song'], 10) : 0;
    const trackRelativePosition = st2['elapsed'] ? Math.round(parseFloat(st2['elapsed'])) : 0;

    // Upsert position with track-relative position and track index
    upsertPosition(db, unitPath, trackIndex, trackRelativePosition, st.status);
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
