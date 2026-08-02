import { describe, it, expect, beforeEach, vi } from 'vitest';
import Database from 'better-sqlite3';

// ── Test-DB und MPD-Attrappe ────────────────────────────────────────────────
let testDb: Database.Database;
/** Dateien samt Tags, so wie `listallinfo` sie liefert. */
let mpdEntries: Array<Record<string, string>> = [];
let mpdDirs: string[] = [];

vi.mock('../db', () => ({ getDb: () => testDb }));

vi.mock('../mpd', () => ({
  getMpd: vi.fn(async () => ({
    send: vi.fn(async (cmd: string) => {
      if (cmd === 'listallinfo') {
        return [...mpdDirs.map((d) => ({ directory: d })), ...mpdEntries];
      }
      return [];
    }),
  })),
}));

import { reconcileUnitPaths, RECONCILE_SETTING_KEY } from './reconcile-units';
import { getSetting } from '../db/dao';

function initDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(`CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);`);
  db.exec(`CREATE TABLE media (
    path TEXT PRIMARY KEY, type TEXT NOT NULL CHECK (type IN ('audiobook','music')),
    title TEXT NOT NULL, artist TEXT, duration INTEGER, cover_path TEXT, added_at TEXT NOT NULL);`);
  db.exec(`CREATE TABLE playback_position (
    media_path TEXT PRIMARY KEY REFERENCES media(path) ON DELETE CASCADE,
    track_index INTEGER NOT NULL DEFAULT 0, position_seconds INTEGER NOT NULL DEFAULT 0,
    last_played TEXT NOT NULL,
    last_status TEXT NOT NULL DEFAULT 'paused' CHECK (last_status IN ('playing','paused','stopped')));`);
  return db;
}

function seedPosition(
  path: string,
  opts: { track?: number; pos?: number; ts?: string; status?: string } = {},
): void {
  testDb
    .prepare(`INSERT OR IGNORE INTO media (path, type, title, added_at) VALUES (?,?,?,?)`)
    .run(path, path.startsWith('audiobooks/') ? 'audiobook' : 'music', 'x', '2026-01-01T00:00:00Z');
  testDb
    .prepare(
      `INSERT INTO playback_position (media_path, track_index, position_seconds, last_played, last_status)
       VALUES (?,?,?,?,?)`,
    )
    .run(
      path,
      opts.track ?? 0,
      opts.pos ?? 42,
      opts.ts ?? '2026-01-01T00:00:00Z',
      opts.status ?? 'paused',
    );
}

function positionen(): Array<{ media_path: string; track_index: number; position_seconds: number }> {
  return testDb
    .prepare(
      `SELECT media_path, track_index, position_seconds FROM playback_position ORDER BY media_path`,
    )
    .all() as never;
}

beforeEach(() => {
  testDb = initDb();
  mpdDirs = [
    'audiobooks',
    'audiobooks/WasIstWas',
    'audiobooks/WasIstWas/Dinosaurier',
    'music',
    'music/Sampler',
    'music/Sampler/Kinderhits',
    'music/Ohne Tags',
  ];
  mpdEntries = [
    { file: 'audiobooks/WasIstWas/Dinosaurier/01.mp3' },
    { file: 'audiobooks/WasIstWas/Dinosaurier/02.mp3' },
    // Lose Datei im Navigationsordner — alte Regel machte daraus die
    // Sammelkachel "audiobooks/WasIstWas".
    { file: 'audiobooks/WasIstWas/Sonnensystem.m4b' },
    // Sampler: gleicher AlbumArtist, damit die alte Regel sie zusammenfasste.
    { file: 'music/Sampler/Kinderhits/01.mp3', AlbumArtist: 'Diverse', Album: 'Kinderhits' },
    { file: 'music/Sampler/Kinderhits/02.mp3', AlbumArtist: 'Diverse', Album: 'Kinderhits' },
    { file: 'music/Sampler/Kinderhits/03.mp3', AlbumArtist: 'Diverse', Album: 'Kinderhits' },
    // Ohne Tags — alte Regel machte jede Datei zur eigenen Kachel.
    { file: 'music/Ohne Tags/track-a.mp3' },
  ];
});

describe('reconcileUnitPaths — Hoerbuecher bleiben unberuehrt', () => {
  it('keeps an audiobook path that is still a valid unit', async () => {
    seedPosition('audiobooks/WasIstWas/Dinosaurier', { track: 1, pos: 123 });

    const bericht = await reconcileUnitPaths();

    expect(bericht?.kept).toBe(1);
    expect(bericht?.remapped).toEqual([]);
    expect(positionen()).toEqual([
      { media_path: 'audiobooks/WasIstWas/Dinosaurier', track_index: 1, position_seconds: 123 },
    ]);
  });
});

describe('reconcileUnitPaths — virtuelle Musikpfade', () => {
  it('maps a virtual album path to the real folder', async () => {
    // Genau der MIG-01-Fall: der Pfad existierte nie im Dateisystem.
    seedPosition('music/Diverse/Kinderhits', { track: 2, pos: 30 });

    const bericht = await reconcileUnitPaths();

    expect(bericht?.remapped).toEqual([
      { from: 'music/Diverse/Kinderhits', to: 'music/Sampler/Kinderhits' },
    ]);
    expect(positionen()).toEqual([
      { media_path: 'music/Sampler/Kinderhits', track_index: 2, position_seconds: 30 },
    ]);
  });

  it('resolves via the Artist tag when AlbumArtist is absent', async () => {
    // Die alte Regel fiel auf `Artist` zurueck — der virtuelle Pfad sah entsprechend aus.
    mpdEntries = [
      { file: 'music/Sampler/Kinderhits/01.mp3', Artist: 'Anna', Album: 'Kinderhits' },
      { file: 'music/Sampler/Kinderhits/02.mp3', Artist: 'Anna', Album: 'Kinderhits' },
    ];
    seedPosition('music/Anna/Kinderhits', { pos: 11 });

    const bericht = await reconcileUnitPaths();

    expect(bericht?.remapped).toEqual([
      { from: 'music/Anna/Kinderhits', to: 'music/Sampler/Kinderhits' },
    ]);
  });

  it('picks the folder holding most files when an album was spread out', async () => {
    mpdDirs.push('music/Woanders');
    mpdEntries.push({
      file: 'music/Woanders/99.mp3',
      AlbumArtist: 'Diverse',
      Album: 'Kinderhits',
    });
    seedPosition('music/Diverse/Kinderhits');

    const bericht = await reconcileUnitPaths();

    // 3 Dateien in Sampler/Kinderhits gegen 1 in Woanders.
    expect(bericht?.remapped[0]?.to).toBe('music/Sampler/Kinderhits');
  });

  it('prefers the folder named like the album when a copy causes a tie', async () => {
    // Realer Fall aus dem Testbestand: dieselbe Datei liegt zusaetzlich als Kopie in
    // einer selbst zusammengestellten Playlist (Entscheidung E4). Damit steht es 1:1,
    // und rein alphabetisch gewaenne "Kinderlieder/Lieblingslieder" — falsch.
    mpdDirs = ['music', 'music/Sampler', 'music/Sampler/Kinderhits', 'music/Kinderlieder', 'music/Kinderlieder/Lieblingslieder'];
    mpdEntries = [
      { file: 'music/Sampler/Kinderhits/01.mp3', Artist: 'Anna', Album: 'Kinderhits' },
      { file: 'music/Kinderlieder/Lieblingslieder/01 Lied A.mp3', Artist: 'Anna', Album: 'Kinderhits' },
    ];
    seedPosition('music/Anna/Kinderhits');

    const bericht = await reconcileUnitPaths();

    expect(bericht?.remapped).toEqual([
      { from: 'music/Anna/Kinderhits', to: 'music/Sampler/Kinderhits' },
    ]);
  });

  it('leaves a row untouched when nothing resolves', async () => {
    seedPosition('music/Verschwunden/Album');

    const bericht = await reconcileUnitPaths();

    expect(bericht?.unresolved).toEqual(['music/Verschwunden/Album']);
    expect(positionen()).toEqual([
      { media_path: 'music/Verschwunden/Album', track_index: 0, position_seconds: 42 },
    ]);
  });
});

describe('reconcileUnitPaths — alte Einzeldatei- und Sammelkacheln', () => {
  it('maps a former single-file unit onto its folder', async () => {
    seedPosition('music/Ohne Tags/track-a.mp3', { pos: 7 });

    const bericht = await reconcileUnitPaths();

    expect(bericht?.remapped).toEqual([
      { from: 'music/Ohne Tags/track-a.mp3', to: 'music/Ohne Tags' },
    ]);
    expect(positionen()).toEqual([
      { media_path: 'music/Ohne Tags', track_index: 0, position_seconds: 7 },
    ]);
  });

  it('maps the old catch-all tile onto the loose file only — not the subfolders', async () => {
    // Der Fall, an dem ein Praefix-Vergleich scheitern wuerde: unterhalb von
    // audiobooks/WasIstWas liegen auch die Dinosaurier-Dateien, die aber schon
    // damals eine eigene Kachel waren. Nur die lose .m4b gehoerte zur Sammelkachel.
    seedPosition('audiobooks/WasIstWas', { pos: 55 });

    const bericht = await reconcileUnitPaths();

    expect(bericht?.remapped).toEqual([
      { from: 'audiobooks/WasIstWas', to: 'audiobooks/WasIstWas/Sonnensystem.m4b' },
    ]);
    expect(positionen()).toEqual([
      {
        media_path: 'audiobooks/WasIstWas/Sonnensystem.m4b',
        track_index: 0,
        position_seconds: 55,
      },
    ]);
  });
});

describe('reconcileUnitPaths — Kollisionen und Randfaelle', () => {
  it('keeps the more recently played row when two collapse into one', async () => {
    mpdEntries = [
      { file: 'music/Sampler/Kinderhits/01.mp3', Artist: 'Anna', Album: 'Kinderhits' },
      { file: 'music/Sampler/Kinderhits/02.mp3', Artist: 'Bernd', Album: 'Kinderhits' },
    ];
    // Der zerfallene Sampler: zwei alte Kacheln, eine neue Einheit.
    seedPosition('music/Anna/Kinderhits', { pos: 10, ts: '2026-01-01T00:00:00Z' });
    seedPosition('music/Bernd/Kinderhits', { pos: 20, ts: '2026-06-01T00:00:00Z' });

    const bericht = await reconcileUnitPaths();

    expect(positionen()).toEqual([
      { media_path: 'music/Sampler/Kinderhits', track_index: 0, position_seconds: 20 },
    ]);
    expect((bericht?.remapped.length ?? 0) + (bericht?.dropped.length ?? 0)).toBe(2);
  });

  it('resets track_index and position when the new unit has fewer tracks', async () => {
    // Der alte Index zeigte in eine Wiedergabeliste, die es so nicht mehr gibt.
    seedPosition('music/Ohne Tags/track-a.mp3', { track: 5, pos: 99 });

    await reconcileUnitPaths();

    expect(positionen()).toEqual([
      { media_path: 'music/Ohne Tags', track_index: 0, position_seconds: 0 },
    ]);
  });

  it('preserves last_status across the remap', async () => {
    seedPosition('music/Diverse/Kinderhits', { status: 'stopped' });

    await reconcileUnitPaths();

    const row = testDb
      .prepare(`SELECT last_status FROM playback_position WHERE media_path = ?`)
      .get('music/Sampler/Kinderhits') as { last_status: string };
    expect(row.last_status).toBe('stopped');
  });

  it('creates the media row required by the foreign key', async () => {
    seedPosition('music/Diverse/Kinderhits');

    await reconcileUnitPaths();

    const media = testDb
      .prepare(`SELECT path, type, title FROM media WHERE path = ?`)
      .get('music/Sampler/Kinderhits') as { path: string; type: string; title: string };
    expect(media).toEqual({
      path: 'music/Sampler/Kinderhits',
      type: 'music',
      title: 'Kinderhits',
    });
  });

  it('runs only once and records a marker', async () => {
    seedPosition('audiobooks/WasIstWas/Dinosaurier');

    expect(await reconcileUnitPaths()).not.toBeNull();
    expect(getSetting(testDb, RECONCILE_SETTING_KEY)).toBeTruthy();
    expect(await reconcileUnitPaths()).toBeNull();
  });

  it('re-runs when forced', async () => {
    seedPosition('audiobooks/WasIstWas/Dinosaurier');
    await reconcileUnitPaths();
    expect(await reconcileUnitPaths(true)).not.toBeNull();
  });

  it('sets the marker even with an empty position table', async () => {
    expect(await reconcileUnitPaths()).toBeNull();
    expect(getSetting(testDb, RECONCILE_SETTING_KEY)).toBeTruthy();
  });

  it('does not set the marker when MPD is unreachable', async () => {
    const { getMpd } = await import('../mpd');
    vi.mocked(getMpd).mockRejectedValueOnce(new Error('MPD weg'));
    seedPosition('music/Diverse/Kinderhits');

    await expect(reconcileUnitPaths()).rejects.toThrow();
    // Nicht gesetzt -> beim naechsten Start wird es erneut versucht.
    expect(getSetting(testDb, RECONCILE_SETTING_KEY)).toBeUndefined();
  });
});
