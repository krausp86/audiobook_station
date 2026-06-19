import type Database from 'better-sqlite3';

/**
 * A single playback position record from the database.
 * Tracks where the user stopped listening to a media item.
 */
export interface PositionRow {
  media_path: string;
  track_index: number;
  position_seconds: number;
  last_played: string; // ISO-8601 timestamp
  last_status: 'playing' | 'paused' | 'stopped'; // last known playback state (for resume logic)
}

/** Keys for accessing settings stored in the `settings` table. */
export const SETTING_KEYS = {
  MAX_VOLUME: 'max_volume',
  PIN_HASH: 'pin_hash',
} as const;

/**
 * Insert or update playback position for a media item.
 * Uses INSERT ... ON CONFLICT to atomically create or update.
 * @param db database instance
 * @param mediaPath relative path to media file
 * @param trackIndex index of current track (for multi-track items)
 * @param positionSeconds current playback position in seconds
 * @param status current playback status ('playing', 'paused', or 'stopped'). Defaults to 'paused'.
 */
export function upsertPosition(
  db: Database.Database,
  mediaPath: string,
  trackIndex: number,
  positionSeconds: number,
  status: 'playing' | 'paused' | 'stopped' = 'paused',
): void {
  db.prepare(
    `INSERT INTO playback_position (media_path, track_index, position_seconds, last_played, last_status)
     VALUES (@p, @t, @s, @ts, @st)
     ON CONFLICT(media_path) DO UPDATE SET
       track_index = @t, position_seconds = @s, last_played = @ts, last_status = @st`,
  ).run({ p: mediaPath, t: trackIndex, s: positionSeconds, ts: new Date().toISOString(), st: status });
}

/**
 * Retrieve all playback positions, ordered by most recently played first.
 * @param db database instance
 * @returns array of PositionRow records, newest first
 */
export function getAllPositions(db: Database.Database): PositionRow[] {
  return db
    .prepare(`SELECT * FROM playback_position ORDER BY last_played DESC`)
    .all() as PositionRow[];
}

/**
 * Retrieve the most recently played media item.
 * @param db database instance
 * @returns PositionRow for the latest item, or undefined if no positions exist
 */
export function getLatestPosition(db: Database.Database): PositionRow | undefined {
  return db
    .prepare(`SELECT * FROM playback_position ORDER BY last_played DESC LIMIT 1`)
    .get() as PositionRow | undefined;
}

/**
 * Check if onboarding has been seen by the user.
 * @param db database instance
 * @returns true if onboarding was marked as seen, false otherwise
 */
export function getOnboardingSeen(db: Database.Database): boolean {
  const row = db.prepare(`SELECT seen FROM onboarding_seen WHERE id = 1`).get() as
    | { seen: number }
    | undefined;
  return (row?.seen ?? 0) === 1;
}

/**
 * Update only the last_status of a playback position record.
 * Called explicitly after pause/stop operations.
 * @param db database instance
 * @param mediaPath relative path to media file
 * @param status the new status to record
 */
export function setLastStatus(
  db: Database.Database,
  mediaPath: string,
  status: 'playing' | 'paused' | 'stopped',
): void {
  db.prepare(`UPDATE playback_position SET last_status = @st WHERE media_path = @p`).run({
    p: mediaPath,
    st: status,
  });
}

/**
 * Mark onboarding as seen or unseen.
 * Updates the seen flag and optionally records the timestamp.
 * @param db database instance
 * @param seen true to mark as seen (with timestamp), false to mark unseen (null timestamp)
 */
export function setOnboardingSeen(db: Database.Database, seen: boolean): void {
  db.prepare(`UPDATE onboarding_seen SET seen = @s, seen_at = @ts WHERE id = 1`).run({
    s: seen ? 1 : 0,
    ts: seen ? new Date().toISOString() : null,
  });
}

/**
 * Read a raw setting value by key, or undefined if not set.
 * @param db database instance
 * @param key setting key
 * @returns setting value as string, or undefined if not found
 */
export function getSetting(db: Database.Database, key: string): string | undefined {
  const row = db.prepare(`SELECT value FROM settings WHERE key = @k`).get({ k: key }) as
    | { value: string }
    | undefined;
  return row?.value;
}

/**
 * Insert or update a setting value (upsert by key).
 * @param db database instance
 * @param key setting key
 * @param value setting value as string
 */
export function setSetting(db: Database.Database, key: string, value: string): void {
  db.prepare(
    `INSERT INTO settings (key, value) VALUES (@k, @v)
     ON CONFLICT(key) DO UPDATE SET value = @v`,
  ).run({ k: key, v: value });
}

/**
 * Get the maximum child volume limit (0–100).
 * Default 85 if not set.
 * @param db database instance
 * @returns max volume as number, clamped to [0, 100]
 */
export function getMaxVolume(db: Database.Database): number {
  const raw = getSetting(db, SETTING_KEYS.MAX_VOLUME);
  const n = raw != null ? parseInt(raw, 10) : NaN;
  return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 85;
}

/**
 * Set the maximum child volume limit (0–100).
 * Value is automatically clamped and floored.
 * @param db database instance
 * @param value target max volume (0–100)
 */
export function setMaxVolume(db: Database.Database, value: number): void {
  const clamped = Math.max(0, Math.min(100, Math.floor(value)));
  setSetting(db, SETTING_KEYS.MAX_VOLUME, String(clamped));
}

/**
 * Get the stored PIN hash string (scrypt format).
 * Returns undefined if no PIN was ever set (default PIN `0000` applies).
 * @param db database instance
 * @returns PIN hash string or undefined
 */
export function getPinHash(db: Database.Database): string | undefined {
  return getSetting(db, SETTING_KEYS.PIN_HASH);
}

/**
 * Set the stored PIN hash string.
 * @param db database instance
 * @param hash PIN hash in scrypt format
 */
export function setPinHash(db: Database.Database, hash: string): void {
  setSetting(db, SETTING_KEYS.PIN_HASH, hash);
}
