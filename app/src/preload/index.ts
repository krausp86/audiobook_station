import { contextBridge, ipcRenderer } from 'electron';
import {
  ALLOWED_COMMANDS,
  ALLOWED_EVENTS,
  REPLAYABLE_EVENTS,
  type HoermondBridge,
  type IpcCommandChannel,
  type IpcEventChannel,
  type IpcEvents,
} from '@shared/ipc-contract';

// Cache for one-shot lifecycle events so late subscribers still receive them.
const eventCache = new Map<IpcEventChannel, IpcEvents[IpcEventChannel]>();

// ARCHITECT NOTE: Each replayable channel gets TWO ipcRenderer listeners —
// this module-load cache-writer plus the per-subscription `wrapped` listener
// added in on() below. This is intentional and safe: the cache-writer only
// populates eventCache, it never calls user callbacks. The wrapped listener
// dispatches to the user callback. There is no double-delivery to callers.
// Do NOT collapse these into one listener; the cache must be populated even
// when no renderer component has called on() yet (that is the whole point).
for (const ch of REPLAYABLE_EVENTS) {
  ipcRenderer.on(ch as string, (_e, payload) => {
    eventCache.set(ch, payload as IpcEvents[typeof ch]);
  });
}

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
    // Replay cached payload to subscribers that arrive after the event fired.
    if (eventCache.has(channel as IpcEventChannel)) {
      listener(eventCache.get(channel as IpcEventChannel) as never);
    }
    const wrapped = (_e: unknown, payload: unknown) => listener(payload as never);
    ipcRenderer.on(channel as string, wrapped);
    return () => ipcRenderer.removeListener(channel as string, wrapped);
  },
};

contextBridge.exposeInMainWorld('hoermond', bridge);
