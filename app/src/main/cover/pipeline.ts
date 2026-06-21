import { readdir, writeFile, stat, rename } from 'fs/promises';
import { extname, join, resolve } from 'path';
import { createHash } from 'crypto';

export interface CoverItem {
  path: string;
  type: 'audiobook' | 'music';
  title: string;
  artist?: string;
}

const COVER_FILES = ['cover.jpg', 'folder.jpg', 'cover.png', 'folder.png'];

function getCacheDir(): string {
  return process.env.HOERMOND_COVER_CACHE ?? '/mnt/hoermond/.cache/covers/';
}

function getMediaRoot(): string {
  return process.env.HOERMOND_MEDIA_ROOT ?? '/mnt/hoermond';
}

function getCacheFileName(itemPath: string): string {
  const hash = createHash('sha1').update(itemPath).digest('hex');
  return `${hash}.jpg`;
}

/**
 * 4-stage cover pipeline: cache → file → embedded → online.
 * Cache is checked first to avoid redundant I/O (fix #5).
 * All stages write to cache with a consistent .jpg extension (fix #4).
 */
export async function resolveCover(item: CoverItem): Promise<string | null> {
  try {
    // Stage 1: Cache hit (cheapest check — single stat)
    const cached = await resolveCacheCover(item);
    if (cached) return cached;

    // Stage 2: File in directory (cover.jpg, folder.jpg, etc.)
    const fileCover = await resolveFileCover(item);
    if (fileCover) return fileCover;

    // Stage 3: Embedded cover from metadata (expensive — parses audio file)
    const embedded = await resolveEmbeddedCover(item);
    if (embedded) return embedded;

    // Stage 4: Online fetch (MusicBrainz, Last.fm)
    return await resolveOnlineCover(item);
  } catch (err) {
    console.warn(`[cover-pipeline] error resolving cover for ${item.path}:`, err);
    return null;
  }
}

async function resolveCacheCover(item: CoverItem): Promise<string | null> {
  try {
    const cachePath = join(getCacheDir(), getCacheFileName(item.path));
    await stat(cachePath);
    return cachePath;
  } catch {
    return null;
  }
}

async function resolveFileCover(item: CoverItem): Promise<string | null> {
  try {
    const absolutePath = resolve(getMediaRoot(), item.path);
    const stat_ = await stat(absolutePath);
    const searchDir = stat_.isDirectory()
      ? absolutePath
      : absolutePath.substring(0, absolutePath.lastIndexOf('/'));

    for (const fileName of COVER_FILES) {
      try {
        const fullPath = join(searchDir, fileName);
        await stat(fullPath);
        return fullPath;
      } catch {
        // not found, try next
      }
    }
    return null;
  } catch {
    return null;
  }
}

async function resolveEmbeddedCover(item: CoverItem): Promise<string | null> {
  try {
    const absolutePath = resolve(getMediaRoot(), item.path);
    const stat_ = await stat(absolutePath);

    let audioFilePath = absolutePath;
    if (stat_.isDirectory()) {
      const files = await readdir(absolutePath);
      const audioExts = ['.mp3', '.m4b', '.m4a', '.flac', '.ogg', '.wav'];
      const audioFile = files.find((f) => audioExts.includes(extname(f).toLowerCase()));
      if (!audioFile) return null;
      audioFilePath = join(absolutePath, audioFile);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mm = await import('music-metadata') as any;
    const meta = await mm.parseFile(audioFilePath, { skipCovers: false });
    const pic = meta.common?.picture?.[0];
    if (!pic?.data) return null;

    return await writeCoverToCache(item, pic.data);
  } catch {
    return null;
  }
}

async function resolveOnlineCover(item: CoverItem): Promise<string | null> {
  const key = item.path;
  if (fetchInProgress.has(key)) {
    try {
      return await fetchInProgress.get(key)!;
    } catch {
      return null;
    }
  }

  const promise = (async () => {
    try {
      const mb = await fetchFromMusicBrainz(item);
      if (mb) return mb;
      return await fetchFromLastfm(item);
    } finally {
      fetchInProgress.delete(key);
    }
  })();

  fetchInProgress.set(key, promise);
  return promise;
}

async function fetchFromMusicBrainz(item: CoverItem): Promise<string | null> {
  try {
    if (!item.artist) return null;

    const query = encodeURIComponent(`${item.artist} ${item.title}`);
    const searchUrl = `https://musicbrainz.org/ws/2/release/?query=${query}&fmt=json`;
    const searchResponse = await fetchWithTimeout(searchUrl, {
      headers: { 'User-Agent': 'Hoermond/1.0 (krausp86@gmail.com)' },
    });
    if (!searchResponse.ok) return null;

    const searchData = await searchResponse.json() as { releases?: Array<{ id?: string }> };
    const releaseId = searchData.releases?.[0]?.id;
    if (!releaseId) return null;

    const coverUrl = `https://coverartarchive.org/release/${releaseId}/front`;
    const coverResponse = await fetchWithTimeout(coverUrl, {
      headers: { 'User-Agent': 'Hoermond/1.0 (krausp86@gmail.com)' },
    });
    if (!coverResponse.ok) return null;

    const imageBuffer = await coverResponse.arrayBuffer();
    return await writeCoverToCache(item, Buffer.from(imageBuffer));
  } catch {
    return null;
  }
}

async function fetchFromLastfm(item: CoverItem): Promise<string | null> {
  try {
    const apiKey = process.env.HOERMOND_LASTFM_KEY;
    if (!apiKey || !item.artist) return null;

    const query = encodeURIComponent(`artist=${item.artist}&album=${item.title}`);
    const url = `https://ws.audioscrobbler.com/2.0/?method=album.getinfo&${query}&api_key=${apiKey}&format=json`;
    const response = await fetchWithTimeout(url, {
      headers: { 'User-Agent': 'Hoermond/1.0 (krausp86@gmail.com)' },
    });
    if (!response.ok) return null;

    const data = await response.json() as { album?: { image?: Array<{ size?: string; '#text'?: string }> } };
    const coverUrl = data.album?.image
      ?.find((img) => img.size === 'extralarge' || img.size === 'large')
      ?.['#text'];
    if (!coverUrl) return null;

    const imageResponse = await fetchWithTimeout(coverUrl);
    if (!imageResponse.ok) return null;

    const imageBuffer = await imageResponse.arrayBuffer();
    return await writeCoverToCache(item, Buffer.from(imageBuffer));
  } catch {
    return null;
  }
}

async function writeCoverToCache(item: CoverItem, data: Buffer): Promise<string | null> {
  try {
    const cachePath = join(getCacheDir(), getCacheFileName(item.path));
    const tmpPath = cachePath + '.tmp';
    await writeFile(tmpPath, data);
    await rename(tmpPath, cachePath);
    return cachePath;
  } catch {
    return null;
  }
}

async function fetchWithTimeout(url: string, options?: RequestInit, timeoutMs = 5000): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

const fetchInProgress = new Map<string, Promise<string | null>>();

export function getCoverPipeline() {
  return { resolveCover };
}
