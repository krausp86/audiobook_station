import { describe, it, expect } from 'vitest';
import { sortLibrary } from './sort';
import type { MediaItem } from '@shared/ipc-contract';

/**
 * Helper to create a MediaItem with defaults.
 */
const make = (over: Partial<MediaItem>): MediaItem => ({
  path: over.path ?? 'x',
  type: 'audiobook',
  title: 'X',
  progressPercent: 0,
  status: 'new',
  ...over,
});

describe('sortLibrary (E17)', () => {
  it('puts 0% < progress < 100% into recentlyPlayed, rest into all', () => {
    const r = sortLibrary([
      make({ path: 'a', title: 'A', progressPercent: 0, status: 'new' }),
      make({ path: 'b', title: 'B', progressPercent: 50, status: 'in_progress' }),
      make({ path: 'c', title: 'C', progressPercent: 100, status: 'done' }),
    ]);
    expect(r.recentlyPlayed.map((m) => m.path)).toEqual(['b']);
    expect(r.all.map((m) => m.path).sort()).toEqual(['a', 'c']);
  });

  it('sorts recentlyPlayed by lastPlayed descending (most recent first)', () => {
    const r = sortLibrary([
      make({ path: 'old', progressPercent: 10, lastPlayed: '2026-06-01T10:00:00Z' }),
      make({ path: 'new', progressPercent: 10, lastPlayed: '2026-06-10T10:00:00Z' }),
    ]);
    expect(r.recentlyPlayed.map((m) => m.path)).toEqual(['new', 'old']);
  });

  it('sorts all alphabetically by title (de, case-insensitive)', () => {
    const r = sortLibrary([
      make({ path: '1', title: 'Zebra', progressPercent: 0 }),
      make({ path: '2', title: 'apfel', progressPercent: 0 }),
      make({ path: '3', title: 'Ähre', progressPercent: 100 }),
    ]);
    expect(r.all.map((m) => m.title)).toEqual(['Ähre', 'apfel', 'Zebra']);
  });

  it('treats 100% as done -> all, never recentlyPlayed', () => {
    const r = sortLibrary([make({ path: 'd', progressPercent: 100, status: 'done' })]);
    expect(r.recentlyPlayed).toHaveLength(0);
    expect(r.all).toHaveLength(1);
  });

  it('treats 0% as new -> all, never recentlyPlayed', () => {
    const r = sortLibrary([make({ path: 'e', progressPercent: 0, status: 'new' })]);
    expect(r.recentlyPlayed).toHaveLength(0);
    expect(r.all).toHaveLength(1);
  });

  it('handles missing lastPlayed as oldest in recentlyPlayed', () => {
    const r = sortLibrary([
      make({ path: 'has', progressPercent: 10, lastPlayed: '2026-06-10T10:00:00Z' }),
      make({ path: 'none', progressPercent: 10 }),
    ]);
    expect(r.recentlyPlayed[0].path).toBe('has');
    expect(r.recentlyPlayed[1].path).toBe('none');
  });
});
