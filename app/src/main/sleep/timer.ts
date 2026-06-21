import type { BrowserWindow } from 'electron';
import type { SleepMode } from '@shared/ipc-contract';
import { getState, setVolume, pause } from '../mpd/control';
import { getDb } from '../db';
import { getLatestPosition, setLastStatus } from '../db/dao';
import { saveNow } from '../player/persist';

/**
 * Sleep timer constants.
 */
const DURATIONS_MS: Record<Exclude<SleepMode, 'chapterEnd'>, number> = {
  min15: 15 * 60 * 1000,
  min30: 30 * 60 * 1000,
  min60: 60 * 60 * 1000,
};

const FADE_OUT_DURATION_MS = 60 * 1000; // 60 seconds
const TICK_INTERVAL_MS = 1000; // 1 second

/**
 * Internal state for the sleep timer service.
 */
interface SleepState {
  active: boolean;
  mode: SleepMode | null;
  deadline: number | null; // absolute timestamp (Date.now() + remaining), or null for chapterEnd
  remainingMs: number; // for chapterEnd mode, track the dynamic remaining time
  intervalId: ReturnType<typeof setInterval> | null;
  fadeStartVolume: number | null;
}

let state: SleepState = {
  active: false,
  mode: null,
  deadline: null,
  remainingMs: 0,
  intervalId: null,
  fadeStartVolume: null,
};

let getWindow: (() => BrowserWindow | null) | null = null;

/**
 * Initialize the sleep timer service.
 * Must be called exactly once during app startup, before any sleep:* commands.
 * @param windowGetter callback to get the current BrowserWindow
 */
export function initSleepTimer(windowGetter: () => BrowserWindow | null): void {
  getWindow = windowGetter;
}

/**
 * Start a sleep timer with the given mode.
 * @param mode sleep timer mode: 'min15', 'min30', 'min60', or 'chapterEnd'
 * @returns { ok: boolean; endsAt: number | null } — endsAt is absolute timestamp or null for chapterEnd
 */
export async function startSleep(mode: SleepMode): Promise<{ ok: boolean; endsAt: number | null }> {
  try {
    // Cancel any existing timer
    if (state.intervalId) {
      clearInterval(state.intervalId);
      state.intervalId = null;
    }

    // Get current playback state
    const playerState = await getState();

    // Calculate duration and deadline
    let durationMs: number | null = null;
    let endsAt: number | null = null;

    if (mode === 'chapterEnd') {
      // Calculate time until end of current chapter or track
      if (
        playerState.chapters.length > 0 &&
        playerState.currentChapterIndex !== null
      ) {
        // Has chapters: calculate time until end of current chapter
        const chapter = playerState.chapters[playerState.currentChapterIndex];
        const chapterEndSeconds = chapter.startSeconds + chapter.durationSeconds;
        durationMs = Math.max(0, (chapterEndSeconds - playerState.position) * 1000);
      } else if (playerState.duration !== null) {
        // No chapters: calculate time until end of track
        durationMs = Math.max(0, (playerState.duration - playerState.position) * 1000);
      } else {
        // Can't determine duration, fail gracefully
        return { ok: false, endsAt: null };
      }
      // For chapterEnd, endsAt is null (variabler Endpunkt)
      endsAt = null;
    } else {
      // Fixed duration mode
      durationMs = DURATIONS_MS[mode];
      endsAt = Date.now() + durationMs;
    }

    // Clamp duration to at least 1 second
    if (durationMs < 1000) {
      durationMs = 1000;
      if (endsAt !== null) {
        endsAt = Date.now() + durationMs;
      }
    }

    // Initialize state
    state.active = true;
    state.mode = mode;
    state.deadline = endsAt !== null ? endsAt : Date.now() + durationMs;
    state.remainingMs = durationMs;
    state.fadeStartVolume = playerState.volume;

    // Start the tick loop
    startTickLoop();

    return { ok: true, endsAt };
  } catch (err) {
    console.error('[sleep] startSleep failed:', err);
    return { ok: false, endsAt: null };
  }
}

/**
 * Cancel the active sleep timer.
 * @returns { ok: boolean }
 */
export function cancelSleep(): { ok: boolean } {
  if (!state.active) {
    return { ok: false };
  }

  try {
    // Stop the interval
    if (state.intervalId) {
      clearInterval(state.intervalId);
      state.intervalId = null;
    }

    // Restore volume if fade had started
    if (state.fadeStartVolume !== null) {
      void setVolume(state.fadeStartVolume);
    }

    // Reset state
    state.active = false;
    state.mode = null;
    state.deadline = null;
    state.remainingMs = 0;
    state.fadeStartVolume = null;

    // Send cancellation event
    const win = getWindow?.();
    if (win) {
      win.webContents.send('sleep:ended', { reason: 'cancelled' });
    }

    return { ok: true };
  } catch (err) {
    console.error('[sleep] cancelSleep failed:', err);
    return { ok: false };
  }
}

/**
 * Get the current sleep timer state.
 * @returns { active, endsAt, mode }
 */
export function getSleep(): { active: boolean; endsAt: number | null; mode: SleepMode | null } {
  return {
    active: state.active,
    endsAt: state.deadline,
    mode: state.mode,
  };
}

/**
 * Stop the sleep service (cleanup for before-quit).
 */
export function stopSleepService(): void {
  if (state.intervalId) {
    clearInterval(state.intervalId);
    state.intervalId = null;
  }
  state.active = false;
  state.mode = null;
  state.deadline = null;
  state.remainingMs = 0;
  state.fadeStartVolume = null;
}

/**
 * Internal: Start the tick loop that fires every second.
 */
function startTickLoop(): void {
  if (state.intervalId) {
    clearInterval(state.intervalId);
  }

  state.intervalId = setInterval(async () => {
    try {
      // Calculate remaining time
      if (state.deadline === null) {
        // Should not happen, but safeguard
        return;
      }

      const remainingMs = Math.max(0, state.deadline - Date.now());
      state.remainingMs = remainingMs;

      // Send tick event to renderer
      if (state.mode) {
        const win = getWindow?.();
        if (win) {
          win.webContents.send('sleep:tick', {
            remainingMs,
            mode: state.mode,
          });
        }
      }

      // Check if timer has expired
      if (remainingMs <= 0) {
        await handleTimerEnd();
        return;
      }

      // Check player status: only cancel on stop, keep running on pause
      const playerState = await getState();
      if (playerState.status === 'stopped') {
        await handleTimerCancellation();
        return;
      }

      // Fade-out only while actually playing (skip when paused)
      if (remainingMs <= FADE_OUT_DURATION_MS && playerState.status === 'playing') {
        handleFadeOut(remainingMs);
      }
    } catch (err) {
      console.error('[sleep] tick loop error:', err);
    }
  }, TICK_INTERVAL_MS);
}

/**
 * Internal: Handle the fade-out effect (linear volume decrease over 60 seconds).
 */
async function handleFadeOut(remainingMs: number): Promise<void> {
  if (state.fadeStartVolume === null) {
    return; // Fade not initialized
  }

  // Linear fade: volume = (remainingMs / 60_000) * fadeStartVolume, clamped to [0, fadeStartVolume]
  const progress = remainingMs / FADE_OUT_DURATION_MS;
  const targetVolume = Math.max(0, Math.round(state.fadeStartVolume * progress));

  try {
    await setVolume(targetVolume);
  } catch (err) {
    console.error('[sleep] setVolume during fade-out failed:', err);
  }
}

/**
 * Internal: Handle timer expiration — pause playback and persist state.
 */
async function handleTimerEnd(): Promise<void> {
  try {
    // Stop the interval immediately
    if (state.intervalId) {
      clearInterval(state.intervalId);
      state.intervalId = null;
    }

    // Get latest position before pausing
    const playerState = await getState();

    // Only pause and persist if actually playing
    if (playerState.status === 'playing') {
      // Save position immediately
      await saveNow();

      // Pause playback (no stop — E10 requires resume to be possible)
      await pause();

      // Update last_status in database
      const db = getDb();
      if (playerState.currentUnitPath) {
        setLastStatus(db, playerState.currentUnitPath, 'paused');
      } else {
        const latest = getLatestPosition(db);
        if (latest) {
          setLastStatus(db, latest.media_path, 'paused');
        }
      }
    }

    // Restore volume to original level
    if (state.fadeStartVolume !== null) {
      await setVolume(state.fadeStartVolume);
    }

    // Send completion event
    const win2 = getWindow?.();
    if (win2) {
      win2.webContents.send('sleep:ended', { reason: 'completed' });
    }

    // Reset state
    state.active = false;
    state.mode = null;
    state.deadline = null;
    state.remainingMs = 0;
    state.fadeStartVolume = null;
  } catch (err) {
    console.error('[sleep] handleTimerEnd failed:', err);
  }
}

/**
 * Internal: Handle timer cancellation when user manually pauses/stops playback.
 */
async function handleTimerCancellation(): Promise<void> {
  try {
    // Stop the interval
    if (state.intervalId) {
      clearInterval(state.intervalId);
      state.intervalId = null;
    }

    // Restore volume if fade had started
    if (state.fadeStartVolume !== null) {
      await setVolume(state.fadeStartVolume);
    }

    // Send cancellation event
    const win = getWindow?.();
    if (win) {
      win.webContents.send('sleep:ended', { reason: 'cancelled' });
    }

    // Reset state
    state.active = false;
    state.mode = null;
    state.deadline = null;
    state.remainingMs = 0;
    state.fadeStartVolume = null;
  } catch (err) {
    console.error('[sleep] handleTimerCancellation failed:', err);
  }
}
