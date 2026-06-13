/** Commands: Renderer -> Main (Request/Response, via ipcRenderer.invoke). */
export interface IpcCommands {
  'app:getVersion': {
    request: void;
    response: { version: string };
  };
  // Future commands (player:play, db:getProgress, ...) go here.
}

/** Events: Main -> Renderer (push, via webContents.send). */
export interface IpcEvents {
  'app:ready': { ts: number };
  'app:dbError': { message: string };
  // Future events (player:stateChanged, display:dimmed, ...) go here.
}

export type IpcCommandChannel = keyof IpcCommands;
export type IpcEventChannel = keyof IpcEvents;

/** The API shape exposed via contextBridge (Preload implements it, Renderer consumes it). */
export interface HoermondBridge {
  invoke<C extends IpcCommandChannel>(
    channel: C,
    payload: IpcCommands[C]['request'],
  ): Promise<IpcCommands[C]['response']>;
  on<E extends IpcEventChannel>(
    channel: E,
    listener: (payload: IpcEvents[E]) => void,
  ): () => void; // returns unsubscribe function
}

/** Whitelist of allowed channels — Preload validates against these (security). */
export const ALLOWED_COMMANDS: IpcCommandChannel[] = ['app:getVersion'];
export const ALLOWED_EVENTS: IpcEventChannel[] = ['app:ready', 'app:dbError'];

/**
 * Events that are replayed to late subscribers (one-shot lifecycle events).
 *
 * ARCHITECT NOTE: Keep this list restricted to true one-shot lifecycle events
 * (fired exactly once per app session, e.g. app:ready, app:dbError). The
 * preload caches the last payload per channel and overwrites on every fire —
 * adding a high-frequency event here (player:stateChanged etc.) would cause
 * every new subscriber to immediately receive a stale snapshot, which is
 * almost certainly not what you want. Use pull-style commands (invoke) for
 * state that needs to be queried on mount.
 */
export const REPLAYABLE_EVENTS: IpcEventChannel[] = ['app:ready', 'app:dbError'];
