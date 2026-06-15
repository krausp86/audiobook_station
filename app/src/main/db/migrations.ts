import type Database from 'better-sqlite3';

export interface Migration {
  version: number;
  up: (db: Database.Database) => void;
}

export const migrations: Migration[] = [
  {
    version: 1,
    up: (db) => {
      db.exec(`CREATE TABLE settings (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );`);
    },
  },
  {
    version: 2,
    up: (db) => {
      // Media library catalog — one row per audiobook/album unit
      db.exec(`CREATE TABLE media (
        path        TEXT PRIMARY KEY,
        type        TEXT NOT NULL CHECK (type IN ('audiobook','music')),
        title       TEXT NOT NULL,
        artist      TEXT,
        duration    INTEGER,
        cover_path  TEXT,
        added_at    TEXT NOT NULL
      );`);

      // Playback position tracking — one row per media item being listened to
      db.exec(`CREATE TABLE playback_position (
        media_path       TEXT PRIMARY KEY
                         REFERENCES media(path) ON DELETE CASCADE,
        track_index      INTEGER NOT NULL DEFAULT 0,
        position_seconds INTEGER NOT NULL DEFAULT 0,
        last_played      TEXT NOT NULL
      );`);

      db.exec(`CREATE INDEX idx_playback_last_played
               ON playback_position(last_played DESC);`);

      // Onboarding flag — single row with id=1
      db.exec(`CREATE TABLE onboarding_seen (
        id        INTEGER PRIMARY KEY CHECK (id = 1),
        seen      INTEGER NOT NULL DEFAULT 0,
        seen_at   TEXT
      );`);
      db.exec(`INSERT INTO onboarding_seen (id, seen) VALUES (1, 0);`);
    },
  },
];
