import { getMpd } from '../mpd';
import { getDb } from '../db';
import { getAllPositions } from '../db/dao';
import { sortLibrary } from './sort';
import type { MediaItem, LibraryListResponse } from '@shared/ipc-contract';

/**
 * Query MPD for all available media and merge with playback positions from SQLite.
 *
 * Process:
 * 1. Query MPD's listallinfo to get all files in /media
 * 2. Group files by unit (audiobook: author/title, music: artist/album)
 * 3. Calculate unit duration from individual track durations
 * 4. Look up playback positions from SQLite
 * 5. Calculate progress percentage and status
 * 6. Sort using sortLibrary() rules
 *
 * @returns LibraryListResponse with recentlyPlayed and all items
 * @throws Error if MPD query fails
 */
export async function listLibrary(): Promise<LibraryListResponse> {
  const mpd = await getMpd();
  const files = await mpd.send('listallinfo');

  // Group files by unit (audiobook or music album)
  const units = new Map<
    string,
    { durations: number; type: 'audiobook' | 'music'; title: string; artist?: string }
  >();

  for (const f of files) {
    const file = f['file'];
    if (!file) continue;

    // Determine media type from top-level directory
    const top = file.split('/')[0];
    const type: 'audiobook' | 'music' = top === 'audiobooks' ? 'audiobook' : 'music';

    // Unit path:
    // - Audiobooks: group by directory structure (up to 3 path segments)
    // - Music: group by AlbumArtist + Album tags (handles flat file structures)
    const parts = file.split('/');
    let unitPath: string;
    if (type === 'music') {
      const albumArtist = f['AlbumArtist'] ?? f['Artist'];
      const album = f['Album'];
      if (albumArtist && album) {
        unitPath = `music/${albumArtist}/${album}`;
      } else {
        // No proper tags: use file path directly (single file = own tile)
        unitPath = file;
      }
    } else {
      unitPath = parts.slice(0, Math.min(3, parts.length - 1)).join('/') || parts[0];
      // Files directly in the top-level dir (e.g. audiobooks/track.mp3) would get
      // unitPath = "audiobooks" — a confusing catch-all tile. Treat each as its own unit.
      if (!unitPath.includes('/')) {
        unitPath = file;
      }
    }

    // Accumulate durations
    const dur = f['Time'] ? parseInt(f['Time'], 10) : 0;
    const entry = units.get(unitPath);
    if (entry) {
      entry.durations += dur;
    } else {
      const title = f['Album']
        ?? (parts.length > 2 ? parts[parts.length - 2] : null)
        ?? f['Title']
        ?? parts[parts.length - 1]?.replace(/\.[^.]+$/, '')
        ?? unitPath;

      units.set(unitPath, {
        durations: dur,
        type,
        title,
        artist: f['AlbumArtist'] ?? f['Artist'],
      });
    }
  }

  // Load playback positions
  const db = getDb();
  const positions = new Map(getAllPositions(db).map((p) => [p.media_path, p]));

  // Build MediaItem array
  const items: MediaItem[] = [];
  for (const [unitPath, u] of units) {
    const pos = positions.get(unitPath);
    const duration = u.durations || undefined;

    // Calculate progress percentage
    let progressPercent = 0;
    if (pos && duration && duration > 0) {
      progressPercent = Math.min(100, Math.round((pos.position_seconds / duration) * 100));
    }

    // Status is derived from progress
    const status: MediaItem['status'] =
      progressPercent >= 100 ? 'done' : progressPercent > 0 ? 'in_progress' : 'new';

    items.push({
      path: unitPath,
      type: u.type,
      title: u.title,
      artist: u.artist,
      duration,
      coverPath: undefined,
      progressPercent,
      lastPlayed: pos?.last_played,
      status,
    });
  }

  return sortLibrary(items);
}
