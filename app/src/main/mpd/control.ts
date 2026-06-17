import { getMpd } from './index';
import { getChapters, chapterIndexForPosition } from './chapters';
import type { PlayerState } from '@shared/ipc-contract';

/**
 * Start playing a file from the media library.
 * Clears the current playlist, adds the file, and starts playback.
 * @param path relative path to file in /media (e.g. "audiobooks/Author/Title")
 * @param position optional seek position in seconds
 * @throws Error if MPD command fails
 */
export async function play(path: string, position?: number): Promise<void> {
  const mpd = await getMpd();
  await mpd.send('clear');

  const segments = path.split('/');
  if (segments[0] === 'music' && segments.length >= 3) {
    // Virtual music path — group by AlbumArtist+Album tags (flat file structure)
    const albumArtist = segments[1];
    const album = segments.slice(2).join('/');
    const escArtist = albumArtist.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const escAlbum = album.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    await mpd.send(`findadd albumartist "${escArtist}" album "${escAlbum}"`);
    // If AlbumArtist tag is absent on the files, fall back to Artist tag
    const [statusCheck] = await mpd.send('status');
    if (!statusCheck || parseInt(statusCheck['playlistlength'] ?? '0', 10) === 0) {
      await mpd.send(`findadd artist "${escArtist}" album "${escAlbum}"`);
    }
  } else {
    const esc = path.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    await mpd.send(`add "${esc}"`);
  }

  await mpd.send('play');
  if (position && position > 0) {
    await mpd.send(`seekcur ${Math.floor(position)}`);
  }
}

/**
 * Pause playback. If already paused, no change.
 * @throws Error if MPD command fails
 */
export async function pause(): Promise<void> {
  const mpd = await getMpd();
  await mpd.send('pause 1');
}

/**
 * Stop playback and clear the playlist.
 * @throws Error if MPD command fails
 */
export async function stop(): Promise<void> {
  const mpd = await getMpd();
  await mpd.send('stop');
}

/**
 * Seek to a position in the current track (absolute, in seconds).
 * If position is negative, clamps to 0.
 * @param position seek position in seconds
 * @throws Error if MPD command fails
 */
export async function seek(position: number): Promise<void> {
  const mpd = await getMpd();
  await mpd.send(`seekcur ${Math.max(0, Math.floor(position))}`);
}

/**
 * Seek relative to the current position (delta in seconds).
 * Positive delta = forward, negative = backward. Clamped to [0, duration].
 * @param deltaSeconds amount to seek (positive or negative)
 * @throws Error if MPD command fails
 */
export async function seekRelative(deltaSeconds: number): Promise<void> {
  const mpd = await getMpd();
  const [status] = await mpd.send('status');
  const st = status ?? {};
  const elapsed = st['elapsed'] ? parseFloat(st['elapsed']) : 0;
  const durRaw = st['duration'];
  const duration = durRaw ? parseFloat(durRaw) : elapsed + deltaSeconds; // fallback if no duration
  const target = Math.max(0, Math.min(elapsed + deltaSeconds, duration));
  await mpd.send(`seekcur ${Math.floor(target)}`);
}

/**
 * Set the MPD mixer volume (0–100).
 * Clamps to valid range. If mixer is unavailable, silently returns.
 * @param volume target volume (0–100)
 * @throws Error if MPD command fails unexpectedly
 */
export async function setVolume(volume: number): Promise<void> {
  const mpd = await getMpd();
  const clamped = Math.max(0, Math.min(100, Math.floor(volume)));
  try {
    await mpd.send(`setvol ${clamped}`);
  } catch (err) {
    // Mixer may not be available on some systems; gracefully degrade
    console.warn('[control] setVolume failed (mixer unavailable?):', err);
  }
}

/**
 * Get the current player state (playing/paused/stopped, current file, position, duration, volume, chapters).
 * Queries 'status', 'currentsong', and chapter metadata from MPD and file.
 * @returns PlayerState snapshot including volume and chapters
 * @throws Error if MPD query fails
 */
export async function getState(): Promise<PlayerState> {
  const mpd = await getMpd();
  const [status] = await mpd.send('status');
  const [song] = (await mpd.send('currentsong')) ?? [];
  const st = status ?? {};
  const mpdState = st['state'] ?? 'stop';
  const statusMap = { play: 'playing', pause: 'paused', stop: 'stopped' } as const;
  const elapsed = st['elapsed'] ? parseFloat(st['elapsed']) : 0;
  const durRaw = song?.['Time'] ?? st['duration'];
  const duration = durRaw ? Math.round(parseFloat(durRaw)) : null;
  const currentPath = song?.['file'] ?? null;

  // Extract volume: MPD returns volume as string, -1 means unavailable
  let volume: number | null = null;
  const volumeRaw = st['volume'];
  if (volumeRaw && volumeRaw !== '-1') {
    const vol = parseInt(volumeRaw, 10);
    volume = !isNaN(vol) ? Math.max(0, Math.min(100, vol)) : null;
  }

  // Extract chapters (from cache if available, else from file/playlist)
  const chapters = await getChapters(currentPath, mpd);
  const currentChapterIndex = chapterIndexForPosition(chapters, Math.round(elapsed));

  return {
    status: statusMap[mpdState as keyof typeof statusMap] ?? 'stopped',
    currentPath,
    position: Math.round(elapsed),
    duration,
    volume,
    chapters,
    currentChapterIndex,
  };
}
