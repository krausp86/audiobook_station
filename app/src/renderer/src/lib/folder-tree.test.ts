import { describe, it, expect } from 'vitest';
import {
  entriesForLevel,
  parentDirOf,
  rootDirFor,
  dirName,
  isLevelEmpty,
} from './folder-tree';
import type { MediaItem } from '@shared/ipc-contract';

function unit(path: string): MediaItem {
  return {
    path,
    type: path.startsWith('audiobooks/') ? 'audiobook' : 'music',
    title: path.split('/').pop() ?? path,
    progressPercent: 0,
    status: 'new',
  } as MediaItem;
}

/** Der Bestand aus dev/media, so wie ihn das Ordnermodell gruppiert. */
const BESTAND = [
  'audiobooks/Benjamin Bluemchen/Im Zoo',
  'audiobooks/Einzelhoerbuch.m4b',
  'audiobooks/Lange Reihe/Der Schatz',
  'audiobooks/WasIstWas/Dinosaurier',
  'audiobooks/WasIstWas/Sonnensystem.m4b',
  'audiobooks/WasIstWas/Weltraum',
].map(unit);

describe('rootDirFor / dirName', () => {
  it('maps the media type to its root folder', () => {
    expect(rootDirFor('audiobook')).toBe('audiobooks');
    expect(rootDirFor('music')).toBe('music');
  });

  it('returns the last segment as display name', () => {
    expect(dirName('audiobooks/WasIstWas')).toBe('WasIstWas');
    expect(dirName('audiobooks')).toBe('audiobooks');
  });
});

describe('parentDirOf', () => {
  it('returns null at the root of a type — back leads to S1 there', () => {
    expect(parentDirOf('audiobooks', 'audiobook')).toBeNull();
    expect(parentDirOf('music', 'music')).toBeNull();
  });

  it('returns the parent one level down', () => {
    expect(parentDirOf('audiobooks/WasIstWas', 'audiobook')).toBe('audiobooks');
  });

  it('returns the parent from deeper levels', () => {
    expect(parentDirOf('audiobooks/A/B/C', 'audiobook')).toBe('audiobooks/A/B');
  });

  it('returns null for a directory outside the type root', () => {
    expect(parentDirOf('music/Etwas', 'audiobook')).toBeNull();
  });
});

describe('entriesForLevel — Wurzelebene', () => {
  const level = entriesForLevel(BESTAND, 'audiobooks');

  it('lists navigation folders, not the units inside them', () => {
    expect(level.folders.map((f) => f.name)).toEqual([
      'Benjamin Bluemchen',
      'Lange Reihe',
      'WasIstWas',
    ]);
  });

  it('counts the units below each folder', () => {
    expect(level.folders.find((f) => f.name === 'WasIstWas')?.unitCount).toBe(3);
    expect(level.folders.find((f) => f.name === 'Lange Reihe')?.unitCount).toBe(1);
  });

  it('lists only units that sit directly in this directory', () => {
    expect(level.units.map((u) => u.path)).toEqual(['audiobooks/Einzelhoerbuch.m4b']);
  });

  it('sorts folders alphabetically with German collation', () => {
    const mixed = ['audiobooks/Zebra/x', 'audiobooks/Äpfel/x', 'audiobooks/Beere/x'].map(unit);
    expect(entriesForLevel(mixed, 'audiobooks').folders.map((f) => f.name)).toEqual([
      'Äpfel',
      'Beere',
      'Zebra',
    ]);
  });
});

describe('entriesForLevel — eine Ebene tiefer', () => {
  const level = entriesForLevel(BESTAND, 'audiobooks/WasIstWas');

  it('shows the units of that folder', () => {
    expect(level.units.map((u) => u.path)).toEqual([
      'audiobooks/WasIstWas/Dinosaurier',
      'audiobooks/WasIstWas/Sonnensystem.m4b',
      'audiobooks/WasIstWas/Weltraum',
    ]);
  });

  it('has no further folders here', () => {
    expect(level.folders).toEqual([]);
  });

  it('does not leak units from sibling folders', () => {
    expect(level.units.some((u) => u.path.includes('Benjamin'))).toBe(false);
  });
});

describe('entriesForLevel — Randfaelle', () => {
  it('preserves the incoming unit order (sortLibrary has already sorted)', () => {
    const items = ['audiobooks/zzz', 'audiobooks/aaa'].map(unit);
    expect(entriesForLevel(items, 'audiobooks').units.map((u) => u.path)).toEqual([
      'audiobooks/zzz',
      'audiobooks/aaa',
    ]);
  });

  it('returns nothing for an unknown directory', () => {
    const level = entriesForLevel(BESTAND, 'audiobooks/GibtEsNicht');
    expect(isLevelEmpty(level)).toBe(true);
  });

  it('does not match a directory whose name is a prefix of another', () => {
    const items = ['audiobooks/Reihe/a', 'audiobooks/ReiheZwei/b'].map(unit);
    const level = entriesForLevel(items, 'audiobooks/Reihe');
    expect(level.units.map((u) => u.path)).toEqual(['audiobooks/Reihe/a']);
    expect(level.folders).toEqual([]);
  });

  it('reports a level with only folders as non-empty', () => {
    expect(isLevelEmpty(entriesForLevel(BESTAND, 'audiobooks'))).toBe(false);
  });
});
