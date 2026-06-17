import { describe, it, expect, beforeEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { resumeLast } from './resume';

// Mock the getDb function to use an in-memory SQLite database
vi.mock('../db', () => ({
  getDb: () => testDb,
}));

// Mock the play function and getMpd
let mockPlayCalls: Array<{ path: string; position?: number }> = [];
let mockMpdSendCalls: string[] = [];

vi.mock('../mpd/control', () => ({
  play: vi.fn(async (path: string, position?: number) => {
    mockPlayCalls.push({ path, position });
  }),
}));

vi.mock('../mpd/index', () => ({
  getMpd: vi.fn(async () => ({
    send: vi.fn(async (cmd: string) => {
      mockMpdSendCalls.push(cmd);
      return undefined;
    }),
  })),
}));

// In-memory SQLite for tests
let testDb: Database.Database;

// Initialize test database with the schema
function initTestDb(): Database.Database {
  const db = new Database(':memory:');

  // Create the schema (matching the actual app schema)
  db.exec(`
    CREATE TABLE IF NOT EXISTS playback_position (
      media_path TEXT PRIMARY KEY,
      track_index INTEGER DEFAULT 0,
      position_seconds INTEGER DEFAULT 0,
      last_played TEXT NOT NULL,
      last_status TEXT NOT NULL CHECK(last_status IN ('playing', 'paused', 'stopped'))
    );
  `);

  return db;
}

describe('resumeLast', () => {
  beforeEach(() => {
    testDb = initTestDb();
    mockPlayCalls = [];
    mockMpdSendCalls = [];
  });

  it('should silently return if no position exists in database', async () => {
    // No data in DB, resumeLast should be a no-op
    await resumeLast();
    expect(mockPlayCalls).toHaveLength(0);
    expect(mockMpdSendCalls).toHaveLength(0);
  });

  it('should not resume if last status was "stopped"', async () => {
    // Insert a position with last_status='stopped'
    testDb
      .prepare(
        'INSERT INTO playback_position (media_path, track_index, position_seconds, last_played, last_status) VALUES (?, ?, ?, ?, ?)',
      )
      .run('audiobooks/Author/Book', 0, 123, new Date().toISOString(), 'stopped');

    await resumeLast();
    expect(mockPlayCalls).toHaveLength(0);
    expect(mockMpdSendCalls).toHaveLength(0);
  });

  it('should resume if last status was "paused"', async () => {
    testDb
      .prepare(
        'INSERT INTO playback_position (media_path, track_index, position_seconds, last_played, last_status) VALUES (?, ?, ?, ?, ?)',
      )
      .run('audiobooks/Author/Book', 0, 150, new Date().toISOString(), 'paused');

    await resumeLast();

    // Should call play with the media path and position
    expect(mockPlayCalls).toHaveLength(1);
    expect(mockPlayCalls[0]).toEqual({ path: 'audiobooks/Author/Book', position: 150 });
  });

  it('should resume if last status was "playing"', async () => {
    testDb
      .prepare(
        'INSERT INTO playback_position (media_path, track_index, position_seconds, last_played, last_status) VALUES (?, ?, ?, ?, ?)',
      )
      .run('audiobooks/Author/Book2', 0, 200, new Date().toISOString(), 'playing');

    await resumeLast();

    expect(mockPlayCalls).toHaveLength(1);
    expect(mockPlayCalls[0]).toEqual({ path: 'audiobooks/Author/Book2', position: 200 });
  });

  it('should handle multi-track media (track_index > 0)', async () => {
    // Simulate MP3-Ordner: at track 5, position 120 seconds into that track
    testDb
      .prepare(
        'INSERT INTO playback_position (media_path, track_index, position_seconds, last_played, last_status) VALUES (?, ?, ?, ?, ?)',
      )
      .run('audiobooks/Author/MultiTrack', 5, 120, new Date().toISOString(), 'paused');

    await resumeLast();

    // Should call play with path and position
    expect(mockPlayCalls).toHaveLength(1);
    expect(mockPlayCalls[0]).toEqual({
      path: 'audiobooks/Author/MultiTrack',
      position: 120,
    });

    // Should also send MPD commands to jump to track and seek
    expect(mockMpdSendCalls).toContain('play 5');
    expect(mockMpdSendCalls).toContain('seekcur 120');
  });

  it('should handle zero position correctly', async () => {
    testDb
      .prepare(
        'INSERT INTO playback_position (media_path, track_index, position_seconds, last_played, last_status) VALUES (?, ?, ?, ?, ?)',
      )
      .run('music/Artist/Album', 0, 0, new Date().toISOString(), 'paused');

    await resumeLast();

    expect(mockPlayCalls).toHaveLength(1);
    expect(mockPlayCalls[0]).toEqual({ path: 'music/Artist/Album', position: 0 });
  });
});
