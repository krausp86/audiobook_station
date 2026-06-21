import type { BrowserWindow } from 'electron';
import type { SyncState, SyncLogEntry, SyncStatus } from '@shared/ipc-contract';
import { getDb } from '../db';
import { getSetting, setSetting } from '../db/dao';

/**
 * Sync-Status-Aggregation im Main-Prozess.
 *
 * Dieser Dienst aggregiert die Roh-Events von startSyncLogBridge (`sync:status`) zu einem
 * Gesamtstatus (idle/running/error) und hält ein Ringpuffer-Log der letzten 10 Vorgänge.
 *
 * Zustandsübergänge:
 * - 'started' → state = 'running'
 * - 'completed' → state = 'idle'
 * - 'error' → state = 'error' (bleibt bis zum nächsten started/completed)
 *
 * Persistenz: state + log werden in der settings-Tabelle (als JSON) gespeichert,
 * damit sie über App-Neustarts erhalten bleiben.
 */

const SETTING_KEY_SYNC_STATE = 'sync_state';
const SETTING_KEY_SYNC_LOG = 'sync_log';
const LOG_MAX_ENTRIES = 10;

/** Internal state holder */
let currentState: SyncState = 'idle';
let logEntries: SyncLogEntry[] = [];
let getWindowRef: (() => BrowserWindow | null) | null = null;

/**
 * Initialize the sync state aggregator.
 * Loads persisted state and log from settings, sets up the state holder.
 *
 * @param getWindow callback to get the current BrowserWindow
 * @returns cleanup function to unsubscribe
 */
export function initSyncState(getWindow: () => BrowserWindow | null): () => void {
  getWindowRef = getWindow;

  // Load persisted state and log from settings
  const db = getDb();
  const persistedState = getSetting(db, SETTING_KEY_SYNC_STATE);
  const persistedLog = getSetting(db, SETTING_KEY_SYNC_LOG);

  if (persistedState && ['idle', 'running', 'error'].includes(persistedState)) {
    currentState = persistedState as SyncState;
  }

  if (persistedLog) {
    try {
      const parsed = JSON.parse(persistedLog);
      if (Array.isArray(parsed)) {
        logEntries = parsed.slice(0, LOG_MAX_ENTRIES);
      }
    } catch {
      // Fallback to empty log on parse error
    }
  }

  // Return a cleanup function (no active subscriptions to unwind here,
  // since the bridge itself manages its lifecycle)
  return () => {
    getWindowRef = null;
  };
}

/**
 * Handle a raw SyncStatus event from the log bridge.
 * Updates the aggregated state, maintains the ringbuffer log, and sends
 * sync:state events to the renderer when the state changes.
 *
 * Called by watch-log.ts via the onEvent callback.
 *
 * @param ev the raw SyncStatus event
 */
export function handleSyncEvent(ev: SyncStatus): void {
  const prevState = currentState;

  // Update the state based on the event phase
  if (ev.phase === 'started') {
    currentState = 'running';
  } else if (ev.phase === 'completed') {
    currentState = 'idle';
  } else if (ev.phase === 'error') {
    currentState = 'error';
  }

  // Add to ringbuffer (newest first)
  const logEntry: SyncLogEntry = {
    phase: ev.phase,
    ts: ev.ts,
    message: ev.message,
  };
  logEntries.unshift(logEntry);
  if (logEntries.length > LOG_MAX_ENTRIES) {
    logEntries = logEntries.slice(0, LOG_MAX_ENTRIES);
  }

  // Persist state and log to settings
  persistState();

  // Send sync:state event to renderer only if the state actually changed
  if (currentState !== prevState) {
    getWindowRef?.()?.webContents.send('sync:state', { state: currentState });
  }
}

/**
 * Get the current aggregated sync state.
 * @returns the current state: 'idle', 'running', or 'error'
 */
export function getSyncState(): SyncState {
  return currentState;
}

/**
 * Get the log of the last (up to 10) sync operations.
 * @returns array of SyncLogEntry, newest first
 */
export function getSyncLog(): SyncLogEntry[] {
  return logEntries;
}

/**
 * Stop the sync state service and clean up.
 * Persists final state to settings.
 */
export function stopSyncService(): void {
  persistState();
  getWindowRef = null;
}

/**
 * Persist the current state and log to the settings table.
 */
function persistState(): void {
  const db = getDb();
  setSetting(db, SETTING_KEY_SYNC_STATE, currentState);
  setSetting(db, SETTING_KEY_SYNC_LOG, JSON.stringify(logEntries));
}
