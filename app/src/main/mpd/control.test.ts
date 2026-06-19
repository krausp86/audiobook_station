import { describe, it, expect, vi, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';
import type { Chapter } from '@shared/chapter';

// Module-level mutable state; vi.mock factories close over these at call time.
let _sendCalls: string[] = [];
let _sendImpl: (cmd: string) => Promise<Record<string, string>[]> = async () => [];
let _chaptersResult: Chapter[] = [];
let _maxVolume = 85; // Mock max volume (default)

vi.mock('./index', () => ({
  getMpd: () =>
    Promise.resolve({
      send: async (cmd: string) => {
        _sendCalls.push(cmd);
        return _sendImpl(cmd);
      },
    }),
}));

vi.mock('./chapters', async (importOriginal) => {
  const real = await importOriginal<typeof import('./chapters')>();
  return {
    ...real,
    getChapters: async () => _chaptersResult,
  };
});

vi.mock('../db', () => ({
  getDb: () => ({}) as Database.Database,
}));

vi.mock('../db/dao', () => ({
  getMaxVolume: () => _maxVolume,
}));

import { setVolume, seekRelative, seek } from './control';

// ---------------------------------------------------------------------------
// setVolume
// ---------------------------------------------------------------------------
describe('setVolume', () => {
  beforeEach(() => {
    _sendCalls = [];
    _sendImpl = async () => [];
  });

  it('clamps volume above max_volume', async () => {
    _maxVolume = 85; // default
    await setVolume(150);
    expect(_sendCalls).toContain('setvol 85');
  });

  it('clamps volume below 0 to 0', async () => {
    await setVolume(-10);
    expect(_sendCalls).toContain('setvol 0');
  });

  it('passes valid volume within max_volume', async () => {
    _maxVolume = 100;
    _sendCalls = [];
    await setVolume(75);
    expect(_sendCalls).toContain('setvol 75');
  });

  it('floors fractional volume', async () => {
    _maxVolume = 100;
    _sendCalls = [];
    await setVolume(73.9);
    expect(_sendCalls).toContain('setvol 73');
  });

  it('clamps to max_volume (E14 serverseitig)', async () => {
    _maxVolume = 70;
    _sendCalls = [];
    await setVolume(90);
    expect(_sendCalls).toContain('setvol 70');
  });

  it('respects max_volume below request', async () => {
    _maxVolume = 60;
    _sendCalls = [];
    await setVolume(50);
    expect(_sendCalls).toContain('setvol 50');
  });
});

// ---------------------------------------------------------------------------
// seekRelative
// ---------------------------------------------------------------------------
describe('seekRelative', () => {
  beforeEach(() => {
    _sendCalls = [];
    _chaptersResult = [];
    _sendImpl = async (cmd) => {
      if (cmd === 'status') return [{ elapsed: '100', duration: '600' }];
      return [];
    };
  });

  it('seeks forward within track bounds', async () => {
    await seekRelative(50);
    expect(_sendCalls).toContain('seekcur 150');
  });

  it('seeks backward within track bounds', async () => {
    await seekRelative(-30);
    expect(_sendCalls).toContain('seekcur 70');
  });

  it('clamps forward seek past track end to track duration', async () => {
    _sendImpl = async (cmd) => {
      if (cmd === 'status') return [{ elapsed: '580', duration: '600' }];
      return [];
    };
    await seekRelative(50);
    expect(_sendCalls).toContain('seekcur 600');
  });

  it('clamps backward seek before track start to 0', async () => {
    _sendImpl = async (cmd) => {
      if (cmd === 'status') return [{ elapsed: '20', duration: '600' }];
      return [];
    };
    await seekRelative(-50);
    expect(_sendCalls).toContain('seekcur 0');
  });

  it('does not call currentsong (no chapter roundtrip on hot path)', async () => {
    await seekRelative(10);
    expect(_sendCalls).not.toContain('currentsong');
  });
});

// ---------------------------------------------------------------------------
// seek — MP3-Ordner (playlistPos): global position → correct track + offset
// ---------------------------------------------------------------------------
describe('seek — MP3-Ordner (playlistPos)', () => {
  const chapters: Chapter[] = [
    { index: 0, title: 'Track 1', startSeconds: 0, durationSeconds: 300, navKind: 'playlistPos', playlistPos: 0 },
    { index: 1, title: 'Track 2', startSeconds: 300, durationSeconds: 400, navKind: 'playlistPos', playlistPos: 1 },
    { index: 2, title: 'Track 3', startSeconds: 700, durationSeconds: 500, navKind: 'playlistPos', playlistPos: 2 },
  ];

  beforeEach(() => {
    _sendCalls = [];
    _chaptersResult = chapters;
    _sendImpl = async (cmd) => {
      if (cmd === 'currentsong') return [{ file: 'audiobooks/book/01.mp3' }];
      return [];
    };
  });

  it('jumps to correct track and track-relative offset for mid-track position', async () => {
    await seek(350); // global 350 → track 1 (300–700 s), offset 50 s
    expect(_sendCalls).toContain('play 1');
    expect(_sendCalls).toContain('seekcur 50');
  });

  it('jumps to correct track at exact track boundary', async () => {
    await seek(700); // global 700 → track 2 (start), offset 0 s
    expect(_sendCalls).toContain('play 2');
    expect(_sendCalls).toContain('seekcur 0');
  });

  it('seeks to start of first track for position 0', async () => {
    await seek(0);
    expect(_sendCalls).toContain('play 0');
    expect(_sendCalls).toContain('seekcur 0');
  });

  it('clamps negative position to track 0 offset 0', async () => {
    await seek(-50);
    expect(_sendCalls).toContain('play 0');
    expect(_sendCalls).toContain('seekcur 0');
  });
});

// ---------------------------------------------------------------------------
// seek — M4B / no chapters: falls through to track-relative seekcur
// ---------------------------------------------------------------------------
describe('seek — no chapters (M4B / seekOffset fallback)', () => {
  beforeEach(() => {
    _sendCalls = [];
    _chaptersResult = [];
    _sendImpl = async (cmd) => {
      if (cmd === 'currentsong') return [{ file: 'audiobooks/book.m4b' }];
      return [];
    };
  });

  it('sends seekcur with track-relative position', async () => {
    await seek(350);
    expect(_sendCalls).toContain('seekcur 350');
  });

  it('sends seekcur 0 for position 0', async () => {
    await seek(0);
    expect(_sendCalls).toContain('seekcur 0');
  });

  it('floors fractional seek position', async () => {
    await seek(350.9);
    expect(_sendCalls).toContain('seekcur 350');
  });
});
