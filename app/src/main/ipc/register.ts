import { ipcMain, app, type BrowserWindow } from 'electron';
import { play, pause, stop, seek, getState } from '../mpd/control';
import { listLibrary } from '../library/list';
import { getMpd } from '../mpd';
import { getDb } from '../db';
import { getOnboardingSeen, setOnboardingSeen } from '../db/dao';
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

  // player:pause — pause playback and save position
  ipcMain.handle('player:pause', async () => {
    await saveNow();
    await pause();
    return { ok: true };
  });

  // player:stop — stop playback and save position
  ipcMain.handle('player:stop', async () => {
    await saveNow();
    await stop();
    return { ok: true };
  });

  // player:seek — seek to position
  ipcMain.handle('player:seek', async (_e, p: { position: number }) => {
    await seek(p.position);
    return { ok: true };
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

  // unused: suppress warning
  void getWindow;
}
