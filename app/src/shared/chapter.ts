/**
 * Chapter interface representing a navigable section within a media file.
 *
 * Spike findings (MPD-based, validated on Pi with real files in T4.16):
 * - MP3-Ordner: MPD resolves each file as a separate playlist entry
 *   → navKind='playlistPos', playlistPos contains the song index
 * - M4B/M4A: MPD treats .m4b/.m4a as a single song without native chapter support
 *   → navKind='seekOffset', ffprobe extracts chapters from file metadata
 * - CUE-Sheet: MPD can optionally resolve CUE sheets; fallback to seekOffset with ffprobe/CUE parser
 * - Kapitellos (no chapters): empty Chapter array (E12)
 *
 * startSeconds is relative to the ENTIRE medium (cumulative for multi-track media).
 * For MP3-Ordner, each file's startSeconds reflects its position in the playlist timeline.
 */
export interface Chapter {
  /** 0-based chapter index */
  index: number;

  /** Display name of the chapter */
  title: string;

  /** Start time relative to the entire medium (cumulative). Units: seconds. */
  startSeconds: number;

  /** Chapter duration. Units: seconds. */
  durationSeconds: number;

  /**
   * Navigation strategy for this chapter:
   * - 'playlistPos': chapter is a separate playlist entry (MP3-Ordner); use playlistPos to jump
   * - 'seekOffset': chapter is within a single file (M4B, CUE-Sheet); use seekFile + fileOffsetSeconds
   */
  navKind: 'playlistPos' | 'seekOffset';

  /** For navKind='playlistPos': index in MPD playlist to seek to */
  playlistPos?: number;

  /** For navKind='seekOffset': absolute file path to seek within */
  seekFile?: string;

  /** For navKind='seekOffset': seek position within the file (seconds) */
  fileOffsetSeconds?: number;
}
