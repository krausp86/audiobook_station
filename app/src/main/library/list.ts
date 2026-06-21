import { getMpd } from '../mpd';
import { getDb } from '../db';
import { getAllPositions } from '../db/dao';
import { sortLibrary } from './sort';
import { resolveCover } from '../cover';
import type { MediaItem, LibraryListResponse, CoverPhase } from '@shared/ipc-contract';
import type { BrowserWindow } from 'electron';
import { stat } from 'fs/promises';
import { join, resolve } from 'path';

/**
 * Synchronously resolve a cover without network access (local + cache only).
 * This is a fast path for library listing — avoids blocking on HTTP fetches.
 *
 * Checks:
 * 1. Embedded cover (from metadata cache, requires prior extraction)
 * 2. File in directory (cover.jpg, folder.jpg, etc.)
 * 3. Cache (SHA-1 of path + extension)
 *
 * @param item Media item to resolve cover for
 * @returns Local filesystem path to cover, or null if none found
 */
async function resolveCoverSync(item: MediaItem): Promise<string | null> {
  try {
    const mediaRoot = process.env.HOERMOND_MEDIA_ROOT ?? '/mnt/hoermond';
    const absolutePath = resolve(mediaRoot, item.path);

    // Check if path is a directory
    let searchDir: string;
    try {
      const stat_ = await stat(absolutePath);
      searchDir = stat_.isDirectory() ? absolutePath : absolutePath.substring(0, absolutePath.lastIndexOf('/'));
    } catch {
      return null;
    }

    // Look for file-based covers (cover.jpg, folder.jpg, etc.)
    const fileNames = ['cover.jpg', 'folder.jpg', 'cover.png', 'folder.png'];
    for (const fileName of fileNames) {
      try {
        const fullPath = join(searchDir, fileName);
        await stat(fullPath);
        return fullPath;
      } catch {
        // File not found, try next
      }
    }

    // Check cache (SHA-1 of path + extension)
    const cacheDir = process.env.HOERMOND_COVER_CACHE ?? '/mnt/hoermond/.cache/covers/';
    const { createHash } = await import('crypto');
    const hash = createHash('sha1').update(item.path).digest('hex');
    const cachePath = join(cacheDir, `${hash}.jpg`);
    try {
      await stat(cachePath);
      return cachePath;
    } catch {
      return null;
    }
  } catch (err) {
    console.warn(`[library-list] error in resolveCoverSync for ${item.path}:`, err);
    return null;
  }
}

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
 * 7. Fill coverPath from sync fast path (local + cache only)
 * 8. If getWindow provided, start background cover fetches for missing covers
 *
 * @param getWindow Optional callback to get BrowserWindow for sending cover:status events
 * @returns LibraryListResponse with recentlyPlayed and all items
 * @throws Error if MPD query fails
 */
export async function listLibrary(
  getWindow?: () => BrowserWindow | null,
): Promise<LibraryListResponse> {
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

  const result = sortLibrary(items);

  // Fast path: resolve covers in parallel (local + cache only, no network)
  const allItems = [...result.recentlyPlayed, ...result.all];
  const coverResults = await Promise.all(allItems.map((item) => resolveCoverSync(item)));
  for (let i = 0; i < allItems.length; i++) {
    if (coverResults[i]) {
      allItems[i].coverPath = coverResults[i] ?? undefined;
    }
  }

  // Background fetches: if getWindow provided, start fetching missing covers
  // Fire-and-forget: don't await, listLibrary returns immediately
  if (getWindow) {
    void startBackgroundCoverFetches(result, getWindow);
  }

  return result;
}

/**
 * Start background cover fetches for items that don't have a coverPath yet.
 * Sends cover:status events as fetches progress.
 *
 * Uses a module-level tracker to avoid duplicate fetches:
 * - fetchInProgress: Map<path, Promise> — prevents concurrent fetches
 * - failedFetches: Set<path> — tracks items that already failed
 *
 * @param result Library list result (recentlyPlayed + all items)
 * @param getWindow Callback to get BrowserWindow for sending events
 */
function startBackgroundCoverFetches(
  result: LibraryListResponse,
  getWindow: () => BrowserWindow | null,
): void {
  const allItems = [...result.recentlyPlayed, ...result.all];

  for (const item of allItems) {
    // Skip items that already have a cover or previously failed
    if (item.coverPath || failedFetches.has(item.path)) {
      continue;
    }

    // Skip if fetch already in progress
    if (fetchInProgress.has(item.path)) {
      continue;
    }

    // Mark as pending and start fetch
    sendCoverStatusEvent(getWindow, item.path, 'pending');

    // Fire-and-forget promise for this cover fetch
    const promise: Promise<string | null> = (async () => {
      try {
        const coverPath = await resolveCover(item);
        if (coverPath) {
          sendCoverStatusEvent(getWindow, item.path, 'ready', coverPath);
        } else {
          failedFetches.add(item.path);
          sendCoverStatusEvent(getWindow, item.path, 'failed');
        }
      } catch (err) {
        console.warn(`[library-list] background fetch failed for ${item.path}:`, err);
        failedFetches.add(item.path);
        sendCoverStatusEvent(getWindow, item.path, 'failed');
      } finally {
        fetchInProgress.delete(item.path);
      }
      return null;
    })();

    fetchInProgress.set(item.path, promise);
  }
}

/**
 * Send a cover:status event to the renderer.
 *
 * @param getWindow Callback to get BrowserWindow
 * @param path Media item path
 * @param phase Cover status phase (pending/ready/failed)
 * @param coverPath Optional cover file path (for ready phase)
 */
function sendCoverStatusEvent(
  getWindow: () => BrowserWindow | null,
  path: string,
  phase: CoverPhase,
  coverPath?: string,
): void {
  try {
    const window = getWindow();
    if (!window) return;
    window.webContents.send('cover:status', {
      path,
      phase,
      ...(coverPath && { coverPath }),
    });
  } catch (err) {
    console.warn('[library-list] failed to send cover:status event:', err);
  }
}

// Module-level trackers for idempotent background fetches
const fetchInProgress = new Map<string, Promise<string | null>>();
const failedFetches = new Set<string>();

/**
 * Reset the failed fetches set.
 * Called when the library is rescanned — allows retrying previously failed covers.
 */
export function resetCoverFetchState(): void {
  failedFetches.clear();
}
