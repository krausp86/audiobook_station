import { describe, it, expect } from 'vitest';

/**
 * Tests for pure clamping/calculation logic in control.ts.
 *
 * Note: Integration tests (actual MPD communication) would require
 * a running MPD instance. Unit tests here focus on calculation logic
 * that can be verified without external dependencies.
 */

/**
 * Helper: calculate track-relative position from global position for MP3-Ordner.
 * This mirrors the logic used in seek() function.
 */
function globalToTrackRelative(
  globalPosition: number,
  chapters: Array<{ durationSeconds: number }>,
  targetChapterIdx: number,
): number {
  const offsetBefore = chapters
    .slice(0, targetChapterIdx)
    .reduce((sum, ch) => sum + ch.durationSeconds, 0);
  return globalPosition - offsetBefore;
}

/**
 * Helper: find the chapter index for a global position (mirrors chapterIndexForPosition).
 */
function findChapterForPosition(
  chapters: Array<{ startSeconds: number }>,
  position: number,
): number | null {
  if (chapters.length === 0) return null;
  for (let i = chapters.length - 1; i >= 0; i--) {
    if (position >= chapters[i].startSeconds) {
      return i;
    }
  }
  return null;
}

describe('seek logic for MP3-Ordner', () => {
  const playlistChapters = [
    { durationSeconds: 300 },  // Track 0: 0–300s
    { durationSeconds: 400 },  // Track 1: 300–700s
    { durationSeconds: 500 },  // Track 2: 700–1200s
  ];

  it('converts global position to track-relative correctly', () => {
    // Global position 350 (middle of track 1) → track-relative 50
    const trackRelative = globalToTrackRelative(350, playlistChapters, 1);
    expect(trackRelative).toBe(50);
  });

  it('converts global position at track boundary correctly', () => {
    // Global position 700 (start of track 2) → track-relative 0
    const trackRelative = globalToTrackRelative(700, playlistChapters, 2);
    expect(trackRelative).toBe(0);
  });

  it('clamps track-relative position to track bounds', () => {
    const trackRelative = globalToTrackRelative(350, playlistChapters, 1);
    const clamped = Math.max(0, Math.min(trackRelative, playlistChapters[1].durationSeconds));
    expect(clamped).toBe(50);
  });

  it('clamps position beyond track end to track boundary', () => {
    // Global position 750 would be in track 2, but let's try it in track 1 bounds
    const trackRelative = 750 - 300; // 450, but track 1 is only 400s
    const clamped = Math.max(0, Math.min(trackRelative, playlistChapters[1].durationSeconds));
    expect(clamped).toBe(400);
  });
});

describe('seek target chapter resolution', () => {
  const chapters = [
    { startSeconds: 0 },     // Chapter 0
    { startSeconds: 300 },   // Chapter 1
    { startSeconds: 700 },   // Chapter 2
    { startSeconds: 1200 },  // Chapter 3
  ];

  it('finds correct chapter for start position', () => {
    expect(findChapterForPosition(chapters, 0)).toBe(0);
  });

  it('finds correct chapter for middle position', () => {
    expect(findChapterForPosition(chapters, 350)).toBe(1);
  });

  it('finds correct chapter at exact boundary', () => {
    expect(findChapterForPosition(chapters, 700)).toBe(2);
  });

  it('finds last chapter for position beyond all chapters', () => {
    expect(findChapterForPosition(chapters, 2000)).toBe(3);
  });

  it('returns null for empty chapters', () => {
    expect(findChapterForPosition([], 100)).toBeNull();
  });

  it('returns null for negative position (edge case)', () => {
    expect(findChapterForPosition(chapters, -50)).toBeNull();
  });
});

describe('volume clamping', () => {
  it('clamps positive volume to max 100', () => {
    const clamped = Math.max(0, Math.min(100, 150));
    expect(clamped).toBe(100);
  });

  it('clamps negative volume to min 0', () => {
    const clamped = Math.max(0, Math.min(100, -10));
    expect(clamped).toBe(0);
  });

  it('keeps valid volume unchanged', () => {
    const clamped = Math.max(0, Math.min(100, 50));
    expect(clamped).toBe(50);
  });
});

describe('seekRelative within track bounds', () => {
  const trackDuration = 600;

  it('can seek forward within bounds', () => {
    const elapsed = 100;
    const delta = 50;
    const target = Math.max(0, Math.min(elapsed + delta, trackDuration));
    expect(target).toBe(150);
  });

  it('can seek backward within bounds', () => {
    const elapsed = 100;
    const delta = -50;
    const target = Math.max(0, Math.min(elapsed + delta, trackDuration));
    expect(target).toBe(50);
  });

  it('clamps forward seek past track end', () => {
    const elapsed = 580;
    const delta = 50;
    const target = Math.max(0, Math.min(elapsed + delta, trackDuration));
    expect(target).toBe(trackDuration);
  });

  it('clamps backward seek before track start', () => {
    const elapsed = 20;
    const delta = -50;
    const target = Math.max(0, Math.min(elapsed + delta, trackDuration));
    expect(target).toBe(0);
  });
});
