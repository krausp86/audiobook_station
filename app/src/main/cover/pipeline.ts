import { readdir, writeFile, stat, rename } from 'fs/promises';
import { basename, extname, join, resolve } from 'path';
import { createHash } from 'crypto';

/**
 * Item passed to the cover pipeline.
 * Represents a playable media unit in the library.
 */
export interface CoverItem {
  path: string;        // Unit path, e.g., "audiobooks/Autor/Titel"
  type: 'audiobook' | 'music';
  title: string;
  artist?: string;
}

/**
 * Cover pipeline — resolves cover art for a media item through a 4-stage pipeline:
 * 1. Embedded cover (ID3/M4B/FLAC metadata via music-metadata)
 * 2. File in directory (cover.jpg, folder.jpg, etc.)
 * 3. Cache hit (SHA-1 of item.path)
 * 4. Online fetch (MusicBrainz Cover Art Archive, Last.fm)
 *
 * Returns the local filesystem path to the cover image or null on failure/offline.
 * Failures are logged but never thrown (E2/E3 — silent fallback for the child).
 *
 * @param item Media item to resolve cover for
 * @returns Local filesystem path to cover image, or null if none found
 */
export async function resolveCover(item: CoverItem): Promise<string | null> {
  try {
    // Stage 1: Embedded cover from metadata
    const embeddedPath = await resolveEmbeddedCover(item);
    if (embeddedPath) {
      return embeddedPath;
    }

    // Stage 2: File in directory (cover.jpg, folder.jpg, etc.)
    const filePath = await resolveFileCover(item);
    if (filePath) {
      return filePath;
    }

    // Stage 3: Cache hit
    const cachePath = await resolveCacheCover(item);
    if (cachePath) {
      return cachePath;
    }

    // Stage 4: Online fetch (with concurrency guard)
    const onlinePath = await resolveOnlineCover(item);
    return onlinePath;
  } catch (err) {
    console.warn(`[cover-pipeline] error resolving cover for ${item.path}:`, err);
    return null;
  }
}

/**
 * Stage 1: Extract embedded cover from audio file metadata.
 * For folder-based media (MP3 directories), checks the first file in the folder.
 *
 * Writes the image to cache atomically (*.tmp → rename).
 *
 * @returns Local cache path if found and cached, null otherwise
 */
async function resolveEmbeddedCover(item: CoverItem): Promise<string | null> {
  try {
    const mediaRoot = process.env.HOERMOND_MEDIA_ROOT ?? '/mnt/hoermond';
    const absolutePath = resolve(mediaRoot, item.path);

    // Determine if this is a file or directory
    const stat_ = await stat(absolutePath);

    let audioFilePath = absolutePath;
    if (stat_.isDirectory()) {
      // Folder-based media: use the first audio file
      const files = await readdir(absolutePath);
      const audioExts = ['.mp3', '.m4b', '.m4a', '.flac', '.ogg', '.wav'];
      const audioFile = files.find((f) => audioExts.includes(extname(f).toLowerCase()));
      if (!audioFile) {
        return null;
      }
      audioFilePath = join(absolutePath, audioFile);
    }

    // Parse metadata using music-metadata (lazy import to avoid CommonJS issues)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mm = await import('music-metadata') as any;
    const meta = await mm.parseFile(audioFilePath, { skipCovers: false });
    const pic = meta.common?.picture?.[0];

    if (!pic?.data) {
      return null;
    }

    // Determine MIME type and file extension
    const mimeType = pic.format ?? 'image/jpeg';
    const ext = mimeTypeToExt(mimeType);

    // Write to cache atomically
    const cacheDir = process.env.HOERMOND_COVER_CACHE ?? '/mnt/hoermond/.cache/covers/';
    const cacheFileName = getCacheFileName(item.path, ext);
    const cachePath = join(cacheDir, cacheFileName);
    const tmpPath = cachePath + '.tmp';

    await writeFile(tmpPath, pic.data);
    await rename(tmpPath, cachePath);

    return cachePath;
  } catch (err) {
    // Silent: metadata parsing can fail for many benign reasons
    return null;
  }
}

/**
 * Stage 2: Look for a file in the media directory.
 * Checks for cover.jpg, folder.jpg, cover.png, folder.png in order.
 *
 * @returns Absolute path to the file if found, null otherwise
 */
async function resolveFileCover(item: CoverItem): Promise<string | null> {
  try {
    const mediaRoot = process.env.HOERMOND_MEDIA_ROOT ?? '/mnt/hoermond';
    const absolutePath = resolve(mediaRoot, item.path);

    // Check if path is a directory
    const stat_ = await stat(absolutePath);
    const searchDir = stat_.isDirectory() ? absolutePath : basename(absolutePath);

    if (!stat_.isDirectory() && basename(searchDir) === item.path) {
      // If item.path is a file, search in its directory
      const dirPath = absolutePath.replace(/[^/]*$/, '');
      const fileNames = ['cover.jpg', 'folder.jpg', 'cover.png', 'folder.png'];

      for (const fileName of fileNames) {
        try {
          const fullPath = join(dirPath, fileName);
          await stat(fullPath);
          return fullPath;
        } catch {
          // File not found, try next
        }
      }
      return null;
    }

    // item.path is a directory
    const fileNames = ['cover.jpg', 'folder.jpg', 'cover.png', 'folder.png'];
    for (const fileName of fileNames) {
      try {
        const fullPath = join(absolutePath, fileName);
        await stat(fullPath);
        return fullPath;
      } catch {
        // File not found, try next
      }
    }

    return null;
  } catch (err) {
    // Path doesn't exist or other error
    return null;
  }
}

/**
 * Stage 3: Check if a cover has already been cached.
 * Cache file name is SHA-1(item.path) + .jpg.
 *
 * @returns Cache path if file exists, null otherwise
 */
async function resolveCacheCover(item: CoverItem): Promise<string | null> {
  try {
    const cacheDir = process.env.HOERMOND_COVER_CACHE ?? '/mnt/hoermond/.cache/covers/';
    const cacheFileName = getCacheFileName(item.path, 'jpg');
    const cachePath = join(cacheDir, cacheFileName);

    await stat(cachePath);
    return cachePath;
  } catch (err) {
    // Cache file doesn't exist
    return null;
  }
}

/**
 * Stage 4: Fetch cover from online sources.
 * Tries MusicBrainz Cover Art Archive, then Last.fm.
 * Uses concurrency guard to prevent duplicate fetches.
 *
 * @returns Cache path if successfully fetched and cached, null on failure or offline
 */
async function resolveOnlineCover(item: CoverItem): Promise<string | null> {
  const key = item.path;

  // Check concurrency guard
  if (fetchInProgress.has(key)) {
    // Fetch already running, wait for it
    try {
      const result = await fetchInProgress.get(key)!;
      return result;
    } catch {
      return null;
    }
  }

  // Start new fetch
  const promise = (async () => {
    try {
      // Try MusicBrainz first
      const mbResult = await fetchFromMusicBrainz(item);
      if (mbResult) {
        return mbResult;
      }

      // Fall back to Last.fm
      const lfResult = await fetchFromLastfm(item);
      return lfResult;
    } finally {
      fetchInProgress.delete(key);
    }
  })();

  fetchInProgress.set(key, promise);
  return promise;
}

/**
 * Fetch cover from MusicBrainz Cover Art Archive.
 * Searches for a release by artist + album/title, then fetches the front cover.
 *
 * @returns Cache path if successful, null otherwise
 */
async function fetchFromMusicBrainz(item: CoverItem): Promise<string | null> {
  try {
    if (!item.artist) {
      return null;
    }

    // Search for release on MusicBrainz
    const query = encodeURIComponent(`${item.artist} ${item.title}`);
    const searchUrl = `https://musicbrainz.org/ws/2/release/?query=${query}&fmt=json`;

    const searchResponse = await fetchWithTimeout(searchUrl, {
      headers: { 'User-Agent': 'Hoermond/1.0 (krausp86@gmail.com)' },
    });

    if (!searchResponse.ok) {
      return null;
    }

    const searchData = await searchResponse.json() as { releases?: Array<{ id?: string }> };
    const releaseId = searchData.releases?.[0]?.id;

    if (!releaseId) {
      return null;
    }

    // Fetch cover from Cover Art Archive
    const coverUrl = `https://coverartarchive.org/release/${releaseId}/front`;
    const coverResponse = await fetchWithTimeout(coverUrl, {
      headers: { 'User-Agent': 'Hoermond/1.0 (krausp86@gmail.com)' },
    });

    if (!coverResponse.ok) {
      return null;
    }

    const imageBuffer = await coverResponse.arrayBuffer();
    return cacheCoverImage(item, Buffer.from(imageBuffer));
  } catch (err) {
    console.warn('[cover-pipeline] MusicBrainz fetch failed:', err);
    return null;
  }
}

/**
 * Fetch cover from Last.fm API.
 * Requires HOERMOND_LASTFM_KEY environment variable.
 *
 * @returns Cache path if successful, null otherwise
 */
async function fetchFromLastfm(item: CoverItem): Promise<string | null> {
  try {
    const apiKey = process.env.HOERMOND_LASTFM_KEY;
    if (!apiKey) {
      return null;
    }

    if (!item.artist) {
      return null;
    }

    const query = encodeURIComponent(`artist=${item.artist}&album=${item.title}`);
    const url = `https://ws.audioscrobbler.com/2.0/?method=album.getinfo&${query}&api_key=${apiKey}&format=json`;

    const response = await fetchWithTimeout(url, {
      headers: { 'User-Agent': 'Hoermond/1.0 (krausp86@gmail.com)' },
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json() as { album?: { image?: Array<{ size?: string; '#text'?: string }> } };
    const coverUrl = data.album?.image
      ?.find((img) => img.size === 'extralarge' || img.size === 'large')
      ?.['#text'];

    if (!coverUrl) {
      return null;
    }

    // Download the image
    const imageResponse = await fetchWithTimeout(coverUrl);
    if (!imageResponse.ok) {
      return null;
    }

    const imageBuffer = await imageResponse.arrayBuffer();
    return cacheCoverImage(item, Buffer.from(imageBuffer));
  } catch (err) {
    console.warn('[cover-pipeline] Last.fm fetch failed:', err);
    return null;
  }
}

/**
 * Write image buffer to cache atomically.
 *
 * @returns Cache path on success, null on error
 */
async function cacheCoverImage(item: CoverItem, imageBuffer: Buffer): Promise<string | null> {
  try {
    const cacheDir = process.env.HOERMOND_COVER_CACHE ?? '/mnt/hoermond/.cache/covers/';
    const cacheFileName = getCacheFileName(item.path, 'jpg');
    const cachePath = join(cacheDir, cacheFileName);
    const tmpPath = cachePath + '.tmp';

    await writeFile(tmpPath, imageBuffer);
    await rename(tmpPath, cachePath);

    return cachePath;
  } catch (err) {
    console.warn('[cover-pipeline] cache write failed:', err);
    return null;
  }
}

/**
 * Fetch with a timeout (default 5s).
 * Uses AbortController to cancel after timeout.
 *
 * @param url URL to fetch
 * @param options Fetch options
 * @param timeoutMs Timeout in milliseconds (default 5000)
 * @returns Promise<Response>
 */
async function fetchWithTimeout(
  url: string,
  options?: RequestInit,
  timeoutMs = 5000,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Generate a deterministic cache file name from item path.
 * Uses SHA-1 hash of the path.
 *
 * @param itemPath Unit path (e.g., "audiobooks/Autor/Titel")
 * @param ext File extension without dot (e.g., "jpg")
 * @returns Cache file name (e.g., "abc123...def.jpg")
 */
function getCacheFileName(itemPath: string, ext: string): string {
  const hash = createHash('sha1').update(itemPath).digest('hex');
  return `${hash}.${ext}`;
}

/**
 * Map MIME type to file extension.
 *
 * @param mimeType MIME type (e.g., "image/jpeg")
 * @returns File extension without dot (e.g., "jpg")
 */
function mimeTypeToExt(mimeType: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
  };
  return map[mimeType] ?? 'jpg';
}

// Concurrency guard: map of path -> fetch promise
const fetchInProgress = new Map<string, Promise<string | null>>();

/**
 * Get the singleton cover pipeline instance.
 * Currently just re-exports resolveCover for simplicity,
 * but structured to allow for future state management (cache stats, etc.).
 *
 * @returns Cover pipeline API
 */
export function getCoverPipeline() {
  return {
    resolveCover,
  };
}
