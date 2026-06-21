import { app, BrowserWindow } from 'electron';
import { join } from 'path';
import { is } from '@electron-toolkit/utils';
import { getDb } from './db';
import { registerIpcHandlers } from './ipc/register';
import { startIdleLoop } from './mpd/idle';
import { startPositionPersistence } from './player/persist';
import { resumeLast } from './player/resume';
import { startSyncLogBridge } from './sync/watch-log';
import { startBtListener } from './bt/listen';
import { initSleepTimer, stopSleepService } from './sleep/timer';
import { initSyncState, handleSyncEvent, stopSyncService } from './sync/state';
import { initDisplayManager, stopDisplayManager, onPlayerStateChange } from './display/manager';

/**
 * Create the main application window.
 * @param dbError optional database initialization error to display
 * @returns the created BrowserWindow
 */
function createWindow(dbError?: string): BrowserWindow {
  const win = new BrowserWindow({
    width: 800,
    height: 480,
    fullscreen: !is.dev,
    kiosk: !is.dev,
    frame: false,
    autoHideMenuBar: true,
    backgroundColor: '#FBFAFE',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'));
  }

  win.webContents.on('did-finish-load', () => {
    win.webContents.send('app:ready', { ts: Date.now() });
    if (dbError) {
      win.webContents.send('app:dbError', { message: dbError });
    }
    // Resume only after the renderer is loaded — no audio before the UI is ready
    void resumeLast();
  });

  return win;
}

app.whenReady().then(() => {
  let dbError: string | undefined;
  try {
    getDb(); // initialize + run migrations
  } catch (err) {
    dbError = err instanceof Error ? err.message : String(err);
    console.error('[db] Failed to open database:', err);
  }

  // Register all IPC command handlers
  registerIpcHandlers(() => BrowserWindow.getAllWindows()[0] ?? null);

  const win = createWindow(dbError);

  // Initialize display manager before starting idle loop (which will call onPlayerStateChange)
  initDisplayManager(() => BrowserWindow.getAllWindows()[0] ?? null);

  // Start background services
  const stopIdle = startIdleLoop(
    () => BrowserWindow.getAllWindows()[0] ?? null,
    onPlayerStateChange,
  );
  const stopPersist = startPositionPersistence();
  if (!dbError) {
    initSyncState(() => BrowserWindow.getAllWindows()[0] ?? null);
    initSleepTimer(() => BrowserWindow.getAllWindows()[0] ?? null);
  }
  const stopSyncBridge = startSyncLogBridge(
    () => BrowserWindow.getAllWindows()[0] ?? null,
    !dbError ? handleSyncEvent : undefined,
  );
  const stopBtListener = startBtListener(() => BrowserWindow.getAllWindows()[0] ?? null);

  // Resume is triggered in did-finish-load (see createWindow) so no audio plays before the UI

  // Cleanup on app quit
  app.on('before-quit', () => {
    stopIdle();
    stopPersist();
    stopSyncBridge();
    stopBtListener();
    stopSleepService();
    stopSyncService();
    stopDisplayManager();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(dbError);
  });

  // suppress unused warning
  void win;
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
