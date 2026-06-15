import type { MediaItem, LibraryListResponse } from '@shared/ipc-contract';

/**
 * Sort and organize library items into recently-played and all sections.
 *
 * Sorting rules:
 * - recentlyPlayed: items with 0% < progress < 100%, sorted by lastPlayed descending
 * - all: remaining items (0% or 100%), sorted alphabetically by title (German collation)
 *
 * @param items unordered MediaItem array
 * @returns organized LibraryListResponse
 */
export function sortLibrary(items: MediaItem[]): LibraryListResponse {
  const recentlyPlayed: MediaItem[] = [];
  const all: MediaItem[] = [];

  for (const item of items) {
    const p = item.progressPercent;
    if (p > 0 && p < 100) {
      recentlyPlayed.push(item);
    } else {
      all.push(item);
    }
  }

  // Sort recentlyPlayed by lastPlayed descending (most recent first)
  recentlyPlayed.sort((a, b) => {
    const ta = a.lastPlayed ?? '';
    const tb = b.lastPlayed ?? '';
    return tb.localeCompare(ta);
  });

  // Sort all alphabetically by title (German, case-insensitive)
  all.sort((a, b) => a.title.localeCompare(b.title, 'de', { sensitivity: 'base' }));

  return { recentlyPlayed, all };
}
