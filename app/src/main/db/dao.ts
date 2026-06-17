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
