import { app, BrowserWindow, ipcMain } from 'electron';
import { join } from 'path';
import { is } from '@electron-toolkit/utils';
import type { IpcCommands } from '@shared/ipc-contract';
import { openDatabase } from './db';

function createWindow(): void {
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
  });
}

ipcMain.handle('app:getVersion', (): IpcCommands['app:getVersion']['response'] => {
  return { version: app.getVersion() };
});

app.whenReady().then(() => {
  try {
    openDatabase();
  } catch (err) {
    console.error('[db] Failed to open database:', err);
  }

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
