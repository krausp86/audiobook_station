import type { BrowserWindow } from 'electron';
import { writeFile } from 'fs/promises';

/** Backlight path — controllable via `echo 0` (on) or `echo 1` (off). */
const BL_PATH = process.env['HOERMOND_BACKLIGHT_PATH'] ?? '/sys/class/backlight/10-0045/bl_power';

/** 5-minute inactivity timeout in milliseconds. Overridable via env for testing. */
const INACTIVITY_MS = Number(process.env['HOERMOND_DISPLAY_TIMEOUT'] ?? 300_000);

/** Internal state. */
let displayIsOn = true;
let inactivityTimer: ReturnType<typeof setTimeout> | null = null;
let getWindowRef: (() => BrowserWindow | null) | null = null;

/**
 * Turn the display on (backlight power = 0).
 * Sends a `display:state { on: true }` event to the renderer.
 * Catches errors gracefully for non-Pi development environments.
 */
async function displayOn(): Promise<void> {
  try {
    await writeFile(BL_PATH, '0');
  } catch (e) {
    console.warn('[display] displayOn failed:', e);
  }
  displayIsOn = true;
  getWindowRef?.()?.webContents.send('display:state', { on: true });
}

/**
 * Turn the display off (backlight power = 1).
 * Sends a `display:state { on: false }` event to the renderer.
 * Catches errors gracefully for non-Pi development environments.
 */
async function displayOff(): Promise<void> {
  try {
    await writeFile(BL_PATH, '1');
  } catch (e) {
    console.warn('[display] displayOff failed:', e);
  }
  displayIsOn = false;
  getWindowRef?.()?.webContents.send('display:state', { on: false });
}

/**
 * Reset the inactivity timer.
 * Clears any existing timer and starts a new one.
 * When the timer expires, the display turns off.
 */
function resetInactivityTimer(): void {
  if (inactivityTimer) clearTimeout(inactivityTimer);
  inactivityTimer = setTimeout(() => {
    void displayOff();
  }, INACTIVITY_MS);
}

/**
 * Clear the inactivity timer (e.g., when playback starts).
 */
function clearInactivityTimer(): void {
  if (inactivityTimer) {
    clearTimeout(inactivityTimer);
    inactivityTimer = null;
  }
}

/**
 * Initialize the display manager with a getWindow callback.
 * Must be called once at startup before any other display manager functions.
 *
 * @param getWindow callback to retrieve the current BrowserWindow
 */
export function initDisplayManager(getWindow: () => BrowserWindow | null): void {
  getWindowRef = getWindow;
  // Start with display on and inactivity timer disabled until playback stops
  displayIsOn = true;
}

/**
 * Respond to player state changes.
 * - Playing: keep display on, disable inactivity timer.
 * - Paused/Stopped: enable inactivity timer (5 min until display off).
 *
 * @param status current player status: 'playing', 'paused', or 'stopped'
 */
export function onPlayerStateChange(status: 'playing' | 'paused' | 'stopped'): void {
  if (status === 'playing') {
    // Playing: display must be on, timer disabled
    clearInactivityTimer();
    if (!displayIsOn) {
      void displayOn();
    }
  } else {
    // Paused or stopped: start the inactivity timer
    resetInactivityTimer();
  }
}

/**
 * Respond to a touch event from the renderer.
 * - If display is off: turn it on and reset the timer.
 * - If display is on: just reset the timer.
 *
 * The first touch after wake will be swallowed by the renderer (T7.C15),
 * so this function doesn't need to worry about phantom UI interactions.
 */
export function onTouch(): void {
  if (!displayIsOn) {
    // Display was off: wake it and reset timer
    void displayOn();
    resetInactivityTimer();
  } else {
    // Display is on: just reset the timer
    resetInactivityTimer();
  }
}

/**
 * Clean up the display manager before app quit.
 * Clears any pending timers.
 */
export function stopDisplayManager(): void {
  if (inactivityTimer) {
    clearTimeout(inactivityTimer);
    inactivityTimer = null;
  }
}
