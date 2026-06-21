import { ipcMain, app, type BrowserWindow } from 'electron';
import type Database from 'better-sqlite3';
import { play, pause, stop, seek, seekRelative, setVolume, getState } from '../mpd/control';
import { chapterNext, chapterPrev, chapterGoto } from '../mpd/chapters';
import { listLibrary, resetCoverFetchState } from '../library/list';
import { getMpd } from '../mpd';
import { getDb } from '../db';
import { getOnboardingSeen, setOnboardingSeen, upsertPosition, getLatestPosition, setLastStatus, getMaxVolume, setMaxVolume, getPinHash, setPinHash } from '../db/dao';
import { saveNow } from '../player/persist';
import { hashPin, verifyPin, isValidPinFormat } from '../security/pin';
import { getBtAdapter } from '../bt/adapter';
import type { SleepMode } from '@shared/ipc-contract';
import { startSleep, cancelSleep, getSleep } from '../sleep/timer';
import { getSyncState, getSyncLog } from '../sync/state';

/**
 * Check if a PIN matches the stored PIN (with fallback to default '0000').
 * @param db database instance
 * @param pin plaintext PIN to check
 * @returns true if PIN is correct, false otherwise
 */
function checkPin(db: Database.Database, pin: string): boolean {
  const stored = getPinHash(db);
  if (!stored) return pin === '0000'; // Default PIN until one is set
  return verifyPin(pin, stored);
}

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
  // Includes fast-path cover resolution (local + cache); background fetches for missing covers
  ipcMain.handle('library:list', () => listLibrary(getWindow));

  // library:rescan — trigger MPD database update
  ipcMain.handle('library:rescan', async () => {
    resetCoverFetchState();
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

  // settings:verifyPin — check if a PIN is correct against stored hash or default
  ipcMain.handle('settings:verifyPin', (_e, p: { pin: string }) => {
    return { ok: checkPin(getDb(), p.pin) };
  });

  // settings:changePin — verify current PIN and set a new one
  ipcMain.handle('settings:changePin', (_e, p: { currentPin: string; newPin: string }) => {
    const db = getDb();
    if (!checkPin(db, p.currentPin)) {
      return { ok: false, reason: 'wrong_current' as const };
    }
    if (!isValidPinFormat(p.newPin)) {
      return { ok: false, reason: 'invalid_format' as const };
    }
    setPinHash(db, hashPin(p.newPin));
    return { ok: true };
  });

  // settings:getMaxVolume — retrieve the current max volume limit
  ipcMain.handle('settings:getMaxVolume', () => {
    return { maxVolume: getMaxVolume(getDb()) };
  });

  // settings:setMaxVolume — set the max volume limit
  ipcMain.handle('settings:setMaxVolume', (_e, p: { maxVolume: number }) => {
    setMaxVolume(getDb(), p.maxVolume);
    return { ok: true };
  });

  // bt:getStatus — get current Bluetooth adapter status
  ipcMain.handle('bt:getStatus', () => getBtAdapter().getStatus());

  // bt:listPaired — list all paired Bluetooth devices
  ipcMain.handle('bt:listPaired', async () => ({
    devices: await getBtAdapter().listPaired(),
  }));

  // bt:scan — scan for available Bluetooth devices (30s by default)
  ipcMain.handle('bt:scan', async (_e, p?: { durationMs?: number }) => ({
    devices: await getBtAdapter().scan(p?.durationMs ?? 30000),
  }));

  // bt:pair — pair and trust a Bluetooth device
  ipcMain.handle('bt:pair', (_e, p: { mac: string }) => getBtAdapter().pair(p.mac));

  // bt:connect — connect to a paired Bluetooth device
  ipcMain.handle('bt:connect', async (_e, p: { mac: string }) => {
    const result = await getBtAdapter().connect(p.mac);
    if (result.ok) {
      const status = await getBtAdapter().getStatus();
      getWindow()?.webContents.send('bt:connection', {
        device: status.connected ?? null,
        event: 'connected',
      });
    }
    return result;
  });

  // bt:disconnect — disconnect from a Bluetooth device
  ipcMain.handle('bt:disconnect', async (_e, p: { mac: string }) => {
    const result = await getBtAdapter().disconnect(p.mac);
    if (result.ok) {
      getWindow()?.webContents.send('bt:connection', {
        device: null,
        event: 'disconnected',
      });
    }
    return result;
  });

  // bt:removeDevice — unpair a Bluetooth device
  ipcMain.handle('bt:removeDevice', (_e, p: { mac: string }) => getBtAdapter().remove(p.mac));

  // sleep:start — start the sleep timer
  ipcMain.handle('sleep:start', (_e, p: { mode: SleepMode }) => startSleep(p.mode));

  // sleep:cancel — cancel the running sleep timer
  ipcMain.handle('sleep:cancel', () => cancelSleep());

  // sleep:get — get current sleep timer state
  ipcMain.handle('sleep:get', () => getSleep());

  // sync:getState — get current aggregated sync state (idle/running/error)
  ipcMain.handle('sync:getState', () => ({ state: getSyncState() }));

  // sync:getLog — get the last (up to 10) sync log entries
  ipcMain.handle('sync:getLog', () => ({ entries: getSyncLog() }));
}
