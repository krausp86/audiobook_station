import type { Chapter } from './chapter';
import type { BtDevice, BtStatus } from './bt';

/** Represents a playable audio/video item (audiobook or music track). */
export interface MediaItem {
  path: string;         // relativer Pfad in /media, z.B. "audiobooks/Autor/Titel"
  type: 'audiobook' | 'music';
  title: string;
  artist?: string;
  duration?: number;    // Sekunden gesamt
  coverPath?: string;   // lokaler Pfad oder undefined
  progressPercent: number; // 0–100
  lastPlayed?: string;  // ISO-8601
  status: 'new' | 'in_progress' | 'done';
}

/** Library contents, split into recently-played and all items. */
export interface LibraryListResponse {
  recentlyPlayed: MediaItem[];  // Fortschritt > 0% und < 100%, nach lastPlayed desc
  all: MediaItem[];             // Rest (neu + fertig), alphabetisch nach title
}

/** Current player state snapshot. */
export interface PlayerState {
  status: 'playing' | 'paused' | 'stopped';
  currentPath: string | null;      // relativer Dateipfad in MPD (z.B. audiobooks/Author/Title/01.mp3)
  currentUnitPath: string | null;  // gruppierter Unit-Pfad passend zu MediaItem.path
  position: number;                // Sekunden, relativ zum gesamten Medium
  duration: number | null;         // Sekunden oder null
  volume: number | null;           // 0–100, or null if no mixer available
  chapters: Chapter[];             // empty array if media has no chapters (E12)
  currentChapterIndex: number | null; // index into chapters array, or null if no chapters
}

/** Sync operation status event. */
export interface SyncStatus {
  phase: 'started' | 'completed' | 'error';
  ts: string;      // ISO-8601
  message?: string;
}

/** Commands: Renderer -> Main (Request/Response, via ipcRenderer.invoke). */
export interface IpcCommands {
  'app:getVersion': {
    request: void;
    response: { version: string };
  };
  'library:list': {
    request: void;
    response: LibraryListResponse;
  };
  'library:rescan': {
    request: void;
    response: { triggered: boolean };
  };
  'player:play': {
    request: { path: string; position?: number };
    response: { ok: boolean };
  };
  'player:pause': {
    request: void;
    response: { ok: boolean };
  };
  'player:stop': {
    request: void;
    response: { ok: boolean };
  };
  'player:seek': {
    request: { position: number };
    response: { ok: boolean };
  };
  'player:seekRelative': {
    request: { deltaSeconds: number };
    response: { ok: boolean };
  };
  'player:setVolume': {
    request: { volume: number };
    response: { ok: boolean };
  };
  'player:chapterNext': {
    request: void;
    response: { ok: boolean };
  };
  'player:chapterPrev': {
    request: void;
    response: { ok: boolean };
  };
  'player:chapterGoto': {
    request: { index: number };
    response: { ok: boolean };
  };
  'player:getState': {
    request: void;
    response: PlayerState;
  };
  'onboarding:getSeen': {
    request: void;
    response: { seen: boolean };
  };
  'onboarding:setSeen': {
    request: { seen: boolean };
    response: { ok: boolean };
  };
  'library:restartFromBeginning': {
    request: { path: string };
    response: { ok: boolean };
  };
  'settings:verifyPin': {
    request: { pin: string };
    response: { ok: boolean };
  };
  'settings:changePin': {
    request: { currentPin: string; newPin: string };
    response: { ok: boolean; reason?: 'wrong_current' | 'invalid_format' };
  };
  'settings:getMaxVolume': {
    request: void;
    response: { maxVolume: number };
  };
  'settings:setMaxVolume': {
    request: { maxVolume: number };
    response: { ok: boolean };
  };
  'bt:getStatus': {
    request: void;
    response: BtStatus;
  };
  'bt:listPaired': {
    request: void;
    response: { devices: BtDevice[] };
  };
  'bt:scan': {
    request: { durationMs?: number };
    response: { devices: BtDevice[] };
  };
  'bt:pair': {
    request: { mac: string };
    response: { ok: boolean };
  };
  'bt:connect': {
    request: { mac: string };
    response: { ok: boolean };
  };
  'bt:disconnect': {
    request: { mac: string };
    response: { ok: boolean };
  };
  'bt:removeDevice': {
    request: { mac: string };
    response: { ok: boolean };
  };
}

/** Events: Main -> Renderer (push, via webContents.send). */
export interface IpcEvents {
  'app:ready': { ts: number };
  'app:dbError': { message: string };
  'player:state': PlayerState;
  'library:updated': { ts: number };
  'sync:status': SyncStatus;
  'bt:connection': { device: BtDevice | null; event: 'connected' | 'disconnected' };
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
export const ALLOWED_COMMANDS: IpcCommandChannel[] = [
  'app:getVersion',
  'library:list',
  'library:rescan',
  'library:restartFromBeginning',
  'player:play',
  'player:pause',
  'player:stop',
  'player:seek',
  'player:seekRelative',
  'player:setVolume',
  'player:chapterNext',
  'player:chapterPrev',
  'player:chapterGoto',
  'player:getState',
  'onboarding:getSeen',
  'onboarding:setSeen',
  'settings:verifyPin',
  'settings:changePin',
  'settings:getMaxVolume',
  'settings:setMaxVolume',
  'bt:getStatus',
  'bt:listPaired',
  'bt:scan',
  'bt:pair',
  'bt:connect',
  'bt:disconnect',
  'bt:removeDevice',
];
export const ALLOWED_EVENTS: IpcEventChannel[] = [
  'app:ready',
  'app:dbError',
  'player:state',
  'library:updated',
  'sync:status',
  'bt:connection',
];

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
