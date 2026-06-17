import { spawn } from 'child_process';
import type { MpdClient } from './client';
import type { Chapter } from '@shared/chapter';

const MEDIA_ROOT = '/media';

/**
 * Cache for chapters by media path to avoid repeated ffprobe calls.
 * Invalidated when playlist changes (database or file list updates).
 */
const chaptersCache = new Map<string, Chapter[]>();

/**
 * Invalidate the entire chapters cache.
 * Called when the playlist changes (database or file updates detected via idle loop).
 */
export function invalidateChaptersCache(): void {
  chaptersCache.clear();
}

/**
 * Detect the media type and extract chapters.
 *
 * Strategy per media type:
 * - MP3-Ordner (directory with multiple files): use MPD playlistinfo; each file = one chapter
 * - M4B/M4A (single file): use ffprobe to extract embedded chapters
 * - CUE-Sheet: use ffprobe + CUE parser (fallback: seekOffset strategy)
 * - Kapitellos: return empty array (E12)
 *
 * @param currentPath relative path to media (e.g., "audiobooks/Author/Title")
 * @param mpd MPD client instance to query playlist
 * @returns array of chapters; empty if media is kapitellos or type unknown
 */
export async function getChapters(currentPath: string | null, mpd: MpdClient): Promise<Chapter[]> {
  if (!currentPath) return [];

  // Check cache first
  const cached = chaptersCache.get(currentPath);
  if (cached !== undefined) return cached;

  try {
    // Determine media type and extraction strategy
    const result = await detectAndExtractChapters(currentPath, mpd);
    chaptersCache.set(currentPath, result);
    return result;
  } catch (err) {
    console.error(`[chapters] failed to extract chapters for ${currentPath}:`, err);
    return [];
  }
}

/**
 * Detect media type and call appropriate extraction strategy.
 */
async function detectAndExtractChapters(
  currentPath: string,
  mpd: MpdClient,
): Promise<Chapter[]> {
  const lowerPath = currentPath.toLowerCase();

  // M4B/M4A: extract via ffprobe
  if (lowerPath.endsWith('.m4b') || lowerPath.endsWith('.m4a')) {
    return extractM4bChapters(currentPath);
  }

  // CUE-Sheet: extract via ffprobe/CUE parser
  if (lowerPath.endsWith('.cue')) {
    return extractCueChapters(currentPath);
  }

  // MP3-Ordner: use MPD playlistinfo to enumerate tracks
  return extractPlaylistChapters(mpd);
}

/**
 * Extract chapters from M4B/M4A file using ffprobe.
 * ffprobe outputs JSON with chapters in the metadata.
 *
 * @param relativePath relative path (e.g., "audiobooks/Author/Title.m4b")
 * @returns array of chapters
 */
async function extractM4bChapters(relativePath: string): Promise<Chapter[]> {
  const absolutePath = `${MEDIA_ROOT}/${relativePath}`;

  return new Promise((resolve, reject) => {
    const chapters: Chapter[] = [];

    // Spawn ffprobe with array arguments (prevents shell injection)
    const proc = spawn('ffprobe', [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_chapters',
      absolutePath,
    ]);

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    proc.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    proc.on('close', (code: number) => {
      if (code !== 0) {
        // No chapters or ffprobe error — return empty
        return resolve([]);
      }

      try {
        interface FfprobeChapter {
          id: number;
          start_time: string;
          end_time: string;
          tags?: { title?: string };
        }

        interface FfprobeOutput {
          chapters?: FfprobeChapter[];
        }

        const parsed = JSON.parse(stdout) as FfprobeOutput;
        if (!parsed.chapters || parsed.chapters.length === 0) {
          return resolve([]);
        }

        // Build chapters array
        let cumulativeSeconds = 0;
        parsed.chapters.forEach((ch, idx) => {
          const startTime = parseFloat(ch.start_time);
          const endTime = parseFloat(ch.end_time);
          const duration = endTime - startTime;
          const title = ch.tags?.title || `Kapitel ${idx + 1}`;

          chapters.push({
            index: idx,
            title,
            startSeconds: cumulativeSeconds,
            durationSeconds: duration,
            navKind: 'seekOffset',
            seekFile: absolutePath,
            fileOffsetSeconds: startTime,
          });

          cumulativeSeconds += duration;
        });

        resolve(chapters);
      } catch (err) {
        reject(err);
      }
    });

    proc.on('error', (err: Error) => {
      reject(err);
    });
  });
}

/**
 * Extract chapters from CUE-Sheet.
 * For now, returns empty array (CUE parsing is complex and may not be critical for M4).
 * TODO (M5+): implement full CUE-sheet parsing
 *
 * @param relativePath relative path to .cue file
 * @returns empty array (TODO)
 */
async function extractCueChapters(_relativePath: string): Promise<Chapter[]> {
  // Placeholder: CUE-sheet parsing deferred to M5
  // For now, return empty to avoid blocking
  return [];
}

/**
 * Extract chapters from MPD playlist (MP3-Ordner scenario).
 * Each file in the playlist becomes one chapter, with cumulative times.
 *
 * @param mpd MPD client to query playlist
 * @returns array of chapters (one per playlist entry) with cumulative times
 */
async function extractPlaylistChapters(mpd: MpdClient): Promise<Chapter[]> {
  try {
    // Query the current playlist
    const playlistInfo = await mpd.send('playlistinfo');
    if (!playlistInfo || playlistInfo.length === 0) {
      return [];
    }

    const chapters: Chapter[] = [];
    let cumulativeSeconds = 0;

    playlistInfo.forEach((entry, idx) => {
      const title = entry['Title'] || entry['file'] || `Spur ${idx + 1}`;
      const durationStr = entry['duration'] ?? entry['Time'];
      const duration = durationStr ? Math.round(parseFloat(durationStr)) : 0;

      chapters.push({
        index: idx,
        title,
        startSeconds: cumulativeSeconds,
        durationSeconds: duration,
        navKind: 'playlistPos',
        playlistPos: idx,
      });

      cumulativeSeconds += duration;
    });

    return chapters;
  } catch (err) {
    console.error('[chapters] playlistinfo failed:', err);
    return [];
  }
}

/**
 * Find the current chapter index based on playback position.
 *
 * @param chapters array of chapters
 * @param positionSeconds current playback position (relative to entire medium)
 * @returns index into chapters array, or null if no chapters or position before first chapter
 */
export function chapterIndexForPosition(
  chapters: Chapter[],
  positionSeconds: number,
): number | null {
  if (chapters.length === 0) return null;

  // Find the chapter containing this position
  for (let i = chapters.length - 1; i >= 0; i--) {
    if (positionSeconds >= chapters[i].startSeconds) {
      return i;
    }
  }

  // Before first chapter (shouldn't happen, but be safe)
  return null;
}

/**
 * Navigate to the next chapter in the playlist.
 * If at the last chapter, this is a no-op.
 *
 * @param chapters array of chapters
 * @param currentIndex current chapter index
 * @param mpd MPD client to execute navigation
 * @returns true if navigation occurred, false if already at end
 */
export async function chapterNext(
  chapters: Chapter[],
  currentIndex: number | null,
  mpd: MpdClient,
): Promise<boolean> {
  if (chapters.length === 0) return false;

  const idx = currentIndex === null ? 0 : currentIndex + 1;
  if (idx >= chapters.length) return false;

  const chapter = chapters[idx];
  return navigateToChapter(chapter, mpd);
}

/**
 * Navigate to the previous chapter in the playlist.
 * If at the first chapter, this is a no-op.
 *
 * @param chapters array of chapters
 * @param currentIndex current chapter index
 * @param mpd MPD client to execute navigation
 * @returns true if navigation occurred, false if already at start
 */
export async function chapterPrev(
  chapters: Chapter[],
  currentIndex: number | null,
  mpd: MpdClient,
): Promise<boolean> {
  if (chapters.length === 0) return false;

  const idx = currentIndex === null ? 0 : currentIndex - 1;
  if (idx < 0) return false;

  const chapter = chapters[idx];
  return navigateToChapter(chapter, mpd);
}

/**
 * Navigate directly to a specific chapter.
 *
 * @param chapters array of chapters
 * @param index chapter index (0-based)
 * @param mpd MPD client to execute navigation
 * @returns true if navigation succeeded, false if index out of bounds
 */
export async function chapterGoto(
  chapters: Chapter[],
  index: number,
  mpd: MpdClient,
): Promise<boolean> {
  if (index < 0 || index >= chapters.length) return false;
  return navigateToChapter(chapters[index], mpd);
}

/**
 * Execute navigation to a specific chapter using the navKind strategy.
 *
 * @param chapter the chapter to navigate to
 * @param mpd MPD client to execute commands
 * @returns true if navigation succeeded, false on error
 */
async function navigateToChapter(chapter: Chapter, mpd: MpdClient): Promise<boolean> {
  try {
    if (chapter.navKind === 'playlistPos') {
      // Jump to the playlist position
      if (chapter.playlistPos === undefined) return false;
      await mpd.send(`play ${chapter.playlistPos}`);
    } else if (chapter.navKind === 'seekOffset') {
      // Seek within a file. Verify the correct file is loaded; if not, load it first.
      if (chapter.seekFile === undefined || chapter.fileOffsetSeconds === undefined) {
        return false;
      }

      // Check if the correct file is currently loaded
      const [song] = (await mpd.send('currentsong')) ?? [];
      const currentFile = song?.['file'];

      // chapter.seekFile is absolute (MEDIA_ROOT/...), MPD song.file is relative.
      // Strip the MEDIA_ROOT prefix to get the relative path for comparison.
      const prefix = MEDIA_ROOT + '/';
      const seekFileRelative = chapter.seekFile.startsWith(prefix)
        ? chapter.seekFile.slice(prefix.length)
        : chapter.seekFile;
      const fileIsLoaded = currentFile && currentFile === seekFileRelative;

      if (!fileIsLoaded) {
        // Load the file first
        await mpd.send('clear');
        const escaped = seekFileRelative.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        await mpd.send(`add "${escaped}"`);
        await mpd.send('play');
      }

      // Now seek to the chapter offset
      await mpd.send(`seekcur ${Math.floor(chapter.fileOffsetSeconds)}`);
    } else {
      return false;
    }
    return true;
  } catch (err) {
    console.error('[chapters] navigateToChapter failed:', err);
    return false;
  }
}
