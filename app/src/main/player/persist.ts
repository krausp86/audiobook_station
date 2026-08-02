import { getDb } from '../db';
import { upsertPosition } from '../db/dao';
import { getState } from '../mpd/control';
import { getMpd } from '../mpd';
import { unitPathFor, mediaTypeForPath } from '../library/grouping';

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

    const parts = st.currentPath.split('/');
    const type = mediaTypeForPath(st.currentPath);

    // Unit-Pfad über die gemeinsame Regel (library/grouping.ts). Für Musik werden
    // dafür die Tags des laufenden Songs gebraucht, für Hörbücher nicht — deshalb
    // der Roundtrip nur in diesem Zweig.
    let song: Record<string, string> | undefined;
    if (type === 'music') {
      const mpd = await getMpd();
      [song] = (await mpd.send('currentsong')) ?? [];
    }
    const unitPath = unitPathFor(st.currentPath, song ?? {});

    // Titel-Ableitung bleibt hier lokal: sie weicht bewusst von der in
    // listLibrary ab (dort gewinnt der Album-Tag, hier der Ordnername) und
    // landet nur per INSERT OR IGNORE in `media.title`. Siehe Kommentar unten.
    let displayTitle: string;
    if (type === 'music') {
      displayTitle =
        unitPath.startsWith('music/') && unitPath !== st.currentPath
          ? (song?.['Album'] ?? unitPath)
          : (song?.['Title'] ?? parts[parts.length - 1]?.replace(/\.[^.]+$/, '') ?? unitPath);
    } else {
      displayTitle =
        parts.length > 2
          ? (parts[parts.length - 2] ?? unitPath)
          : (parts[parts.length - 1]?.replace(/\.[^.]+$/, '') ?? unitPath);
    }

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
