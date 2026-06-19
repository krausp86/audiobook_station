import Database from 'better-sqlite3';
import { migrations } from './migrations';

const DB_PATH = process.env['HOERMOND_DB_PATH'] ?? '/var/lib/mediaplayer/state.db';

export function openDatabase(): Database.Database {
  const db = new Database(DB_PATH);
  // DELETE mode instead of WAL: with overlayfs, the WAL file lives on the
  // volatile overlay and is lost on power loss. DELETE writes directly to the
  // main DB file which is on the persistent bind-mount.
  db.pragma('journal_mode = DELETE');
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  return db;
}

function runMigrations(db: Database.Database): void {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL
  );`);
  const row = db.prepare('SELECT MAX(version) AS v FROM schema_version').get() as {
    v: number | null;
  };
  const current = row.v ?? 0;
  const tx = db.transaction((from: number) => {
    for (const m of migrations
      .filter((x) => x.version > from)
      .sort((a, b) => a.version - b.version)) {
      m.up(db);
      db.prepare('INSERT INTO schema_version (version, applied_at) VALUES (?, ?)').run(
        m.version,
        new Date().toISOString(),
      );
    }
  });
  tx(current);
}

/**
 * Database singleton instance. Lazily initialized on first call to getDb().
 */
let dbSingleton: Database.Database | null = null;

/**
 * Get the singleton database instance.
 * Initializes on first call; subsequent calls return cached instance.
 * @returns connected Database instance with all migrations applied
 */
export function getDb(): Database.Database {
  if (!dbSingleton) dbSingleton = openDatabase();
  return dbSingleton;
}
