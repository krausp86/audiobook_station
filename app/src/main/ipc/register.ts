import { ipcMain, app, type BrowserWindow } from 'electron';
import { play, pause, stop, seek, seekRelative, setVolume, getState } from '../mpd/control';
import { chapterNext, chapterPrev, chapterGoto } from '../mpd/chapters';
import { listLibrary } from '../library/list';
import { getMpd } from '../mpd';
import { getDb } from '../db';
import { getOnboardingSeen, setOnboardingSeen, upsertPosition, getLatestPosition, setLastStatus } from '../db/dao';
import { saveNow } from '../player/persist';

/**
 * Register all IPC handlers for the Electron main process.
 * Each handler corresponds to one key in IpcCommands (ipc-contract.ts).
 *
 * @param getWindow callback to get the current BrowserWindow (for cleanup)
 */
export function registerIpcHandlers(getWindow: () => BrowserWindow | null): void {
  // app:getVersion — return the app version
  ipcMain.handle('app:getVersion', () => ({ version: app.getVersion() }));

  // player:play — start playing a file
  ipcMain.handle('player:play', async (_e, p: { path: string; position?: number }) => {
    await play(p.path, p.position);
    return { ok: true };
  });

  // player:pause — toggle pause: if playing → pause + save, if paused → unpause
  ipcMain.handle('player:pause', async () => {
    const mpd = await getMpd();
    const [st] = await mpd.send('status');
    if (st?.['state'] === 'pause') {
      await mpd.send('pause 0');
    } else {
      await saveNow();
      await pause();
      const db = getDb();
      const latest = getLatestPosition(db);
      if (latest) setLastStatus(db, latest.media_path, 'paused');
    }
    return { ok: true };
  });

  // player:stop — stop playback and save position with 'stopped' status
  ipcMain.handle('player:stop', async () => {
    // Get the current media path BEFORE stopping (stop clears MPD state)
    const state = await getState();
    await saveNow();
    await stop();
    const db = getDb();
    // Mark as stopped: try current media first, fallback to latest DB record
    if (state.currentUnitPath) {
      setLastStatus(db, state.currentUnitPath, 'stopped');
    } else {
      const latest = getLatestPosition(db);
      if (latest) setLastStatus(db, latest.media_path, 'stopped');
    }
    return { ok: true };
  });

  // player:seek — seek to position
  ipcMain.handle('player:seek', async (_e, p: { position: number }) => {
    await seek(p.position);
    return { ok: true };
  });

  // player:seekRelative — seek by delta (positive or negative)
  ipcMain.handle('player:seekRelative', async (_e, p: { deltaSeconds: number }) => {
    await seekRelative(p.deltaSeconds);
    return { ok: true };
  });

  // player:setVolume — set mixer volume (0–100)
  ipcMain.handle('player:setVolume', async (_e, p: { volume: number }) => {
    await setVolume(p.volume);
    return { ok: true };
  });

  // player:chapterNext — jump to next chapter
  ipcMain.handle('player:chapterNext', async () => {
    const state = await getState();
    if (state.chapters.length === 0) return { ok: false };
    const mpd = await getMpd();
    const ok = await chapterNext(state.chapters, state.currentChapterIndex, mpd);
    return { ok };
  });

  // player:chapterPrev — jump to chapter start (if >3s in) or previous chapter
  ipcMain.handle('player:chapterPrev', async () => {
    const state = await getState();
    const mpd = await getMpd();
    // Calculate elapsed time within current chapter
    let elapsedInChapter = 0;
    if (state.currentChapterIndex !== null && state.chapters.length > 0) {
      const ch = state.chapters[state.currentChapterIndex];
      elapsedInChapter = state.position - ch.startSeconds;
    } else {
      // No chapters: use raw position
      const [st] = await mpd.send('status');
      elapsedInChapter = st?.['elapsed'] ? parseFloat(st['elapsed']) : 0;
    }
    const ok = await chapterPrev(state.chapters, state.currentChapterIndex, elapsedInChapter, mpd);
    return { ok };
  });

  // player:chapterGoto — jump to specific chapter
  ipcMain.handle('player:chapterGoto', async (_e, p: { index: number }) => {
    const state = await getState();
    if (state.chapters.length === 0) return { ok: false };
    const mpd = await getMpd();
    const ok = await chapterGoto(state.chapters, p.index, mpd);
    return { ok };
  });

  // player:getState — get current player state
  ipcMain.handle('player:getState', () => getState());

  // library:list — get organized library (recentlyPlayed + all)
  ipcMain.handle('library:list', () => listLibrary());

  // library:rescan — trigger MPD database update
  ipcMain.handle('library:rescan', async () => {
    const mpd = await getMpd();
    await mpd.send('update');
    // library:updated will be pushed by idle-Loop when database update completes
    return { triggered: true };
  });

  // onboarding:getSeen — check if onboarding has been seen
  ipcMain.handle('onboarding:getSeen', () => ({ seen: getOnboardingSeen(getDb()) }));

  // onboarding:setSeen — mark onboarding as seen/unseen
  ipcMain.handle('onboarding:setSeen', (_e, p: { seen: boolean }) => {
    setOnboardingSeen(getDb(), p.seen);
    return { ok: true };
  });

  // library:restartFromBeginning — reset position to 0 and play from beginning
  ipcMain.handle('library:restartFromBeginning', async (_e, p: { path: string }) => {
    upsertPosition(getDb(), p.path, 0, 0);
    await play(p.path);
    return { ok: true };
  });

  // unused: suppress warning
  void getWindow;
}
