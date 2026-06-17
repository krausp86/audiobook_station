import { getMpd } from './index';
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
 * Get the current player state (playing/paused/stopped, current file, position, duration).
 * Queries both 'status' and 'currentsong' from MPD.
 * @returns PlayerState snapshot
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
  return {
    status: statusMap[mpdState as keyof typeof statusMap] ?? 'stopped',
    currentPath: song?.['file'] ?? null,
    position: Math.round(elapsed),
    duration,
  };
}
