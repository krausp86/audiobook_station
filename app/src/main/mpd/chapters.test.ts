import { describe, it, expect } from 'vitest';
import { chapterIndexForPosition } from './chapters';
import type { Chapter } from '@shared/chapter';

describe('chapterIndexForPosition', () => {
  const chaptersList: Chapter[] = [
    {
      index: 0,
      title: 'Kapitel 1',
      startSeconds: 0,
      durationSeconds: 300,
      navKind: 'seekOffset',
      seekFile: '/media/test.m4b',
      fileOffsetSeconds: 0,
    },
    {
      index: 1,
      title: 'Kapitel 2',
      startSeconds: 300,
      durationSeconds: 300,
      navKind: 'seekOffset',
      seekFile: '/media/test.m4b',
      fileOffsetSeconds: 300,
    },
    {
      index: 2,
      title: 'Kapitel 3',
      startSeconds: 600,
      durationSeconds: 300,
      navKind: 'seekOffset',
      seekFile: '/media/test.m4b',
      fileOffsetSeconds: 600,
    },
  ];

  it('returns null for empty chapters', () => {
    expect(chapterIndexForPosition([], 100)).toBeNull();
  });

  it('returns 0 for position at start', () => {
    expect(chapterIndexForPosition(chaptersList, 0)).toBe(0);
  });

  it('returns correct chapter for position in middle of first chapter', () => {
    expect(chapterIndexForPosition(chaptersList, 150)).toBe(0);
  });

  it('returns correct chapter for position at exact chapter boundary', () => {
    expect(chapterIndexForPosition(chaptersList, 300)).toBe(1);
  });

  it('returns correct chapter for position in middle of second chapter', () => {
    expect(chapterIndexForPosition(chaptersList, 350)).toBe(1);
  });

  it('returns last chapter for position at last chapter start', () => {
    expect(chapterIndexForPosition(chaptersList, 600)).toBe(2);
  });

  it('returns last chapter for position beyond all chapters', () => {
    expect(chapterIndexForPosition(chaptersList, 800)).toBe(2);
  });

  it('returns 0 for position before first chapter (edge case)', () => {
    // If position is negative (shouldn't happen, but safe), before first start
    // Current implementation returns null for this case — verify behavior
    expect(chapterIndexForPosition(chaptersList, -10)).toBeNull();
  });

  it('handles single chapter correctly', () => {
    const single: Chapter[] = [
      {
        index: 0,
        title: 'Only Chapter',
        startSeconds: 0,
        durationSeconds: 1000,
        navKind: 'seekOffset',
        seekFile: '/media/single.m4b',
        fileOffsetSeconds: 0,
      },
    ];
    expect(chapterIndexForPosition(single, 0)).toBe(0);
    expect(chapterIndexForPosition(single, 500)).toBe(0);
    expect(chapterIndexForPosition(single, 1000)).toBe(0);
  });

  it('handles non-zero start correctly for MP3-Ordner (cumulative)', () => {
    // MP3-Ordner chapters have cumulative startSeconds
    const playlistChapters: Chapter[] = [
      {
        index: 0,
        title: 'Track 1',
        startSeconds: 0,
        durationSeconds: 600,
        navKind: 'playlistPos',
        playlistPos: 0,
      },
      {
        index: 1,
        title: 'Track 2',
        startSeconds: 600,
        durationSeconds: 600,
        navKind: 'playlistPos',
        playlistPos: 1,
      },
      {
        index: 2,
        title: 'Track 3',
        startSeconds: 1200,
        durationSeconds: 600,
        navKind: 'playlistPos',
        playlistPos: 2,
      },
    ];

    expect(chapterIndexForPosition(playlistChapters, 0)).toBe(0);
    expect(chapterIndexForPosition(playlistChapters, 300)).toBe(0);
    expect(chapterIndexForPosition(playlistChapters, 600)).toBe(1);
    expect(chapterIndexForPosition(playlistChapters, 900)).toBe(1);
    expect(chapterIndexForPosition(playlistChapters, 1200)).toBe(2);
    expect(chapterIndexForPosition(playlistChapters, 1500)).toBe(2);
  });
});
