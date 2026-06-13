import { contextBridge, ipcRenderer } from 'electron';
import {
  ALLOWED_COMMANDS,
  ALLOWED_EVENTS,
  type HoermondBridge,
  type IpcCommandChannel,
  type IpcEventChannel,
} from '@shared/ipc-contract';

const bridge: HoermondBridge = {
  invoke: (channel, payload) => {
    if (!ALLOWED_COMMANDS.includes(channel as IpcCommandChannel)) {
      throw new Error(`IPC command not allowed: ${String(channel)}`);
    }
    return ipcRenderer.invoke(channel as string, payload);
  },
  on: (channel, listener) => {
    if (!ALLOWED_EVENTS.includes(channel as IpcEventChannel)) {
      throw new Error(`IPC event not allowed: ${String(channel)}`);
    }
    const wrapped = (_e: unknown, payload: unknown) => listener(payload as never);
    ipcRenderer.on(channel as string, wrapped);
    return () => ipcRenderer.removeListener(channel as string, wrapped);
  },
};

contextBridge.exposeInMainWorld('hoermond', bridge);
