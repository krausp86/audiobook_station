import { app, BrowserWindow, ipcMain } from 'electron';
import { join } from 'path';
import { is } from '@electron-toolkit/utils';
import type { IpcCommands } from '@shared/ipc-contract';
import { openDatabase } from './db';

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
      sandbox: false, // required on Pi for native modules (ADR-3)
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
  });

  return win;
}

ipcMain.handle('app:getVersion', (): IpcCommands['app:getVersion']['response'] => {
  return { version: app.getVersion() };
});

app.whenReady().then(() => {
  let dbError: string | undefined;
  try {
    openDatabase();
  } catch (err) {
    dbError = err instanceof Error ? err.message : String(err);
    console.error('[db] Failed to open database:', err);
  }

  createWindow(dbError);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(dbError);
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
