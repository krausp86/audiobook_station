import { useEffect, useRef, useState } from 'react';

/**
 * WakeGuard: Handles touch-wake behavior for the display.
 *
 * Responsibilities:
 * 1. Report every touch to Main via `display:touch` (for inactivity timer reset)
 * 2. Suppress the first touch after display wake (prevents accidental Play/Pause)
 * 3. Apply a 300ms fade-in overlay when display wakes
 *
 * Expected behavior:
 * - Touch at pointerdown → display:touch sent to Main (fire-and-forget)
 * - Display was off, now on (display:state event) → set wake flag
 * - Next pointerdown while wake flag set → stop propagation & prevent default, then clear flag
 * - Overlay fades in 300ms (respects prefers-reduced-motion)
 *
 * Implementation notes:
 * - Two separate listeners ensure correct event order (display:touch fires regardless of suppression)
 * - Renderer sends touch to Main immediately; Main resets its inactivity timer
 * - First touch is only suppressed at the React/UI layer (stopPropagation/preventDefault)
 * - Display state tracking via display:state event (sent by Main when bl_power changes)
 */
export function WakeGuard({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [displayOff, setDisplayOff] = useState(false);
  const [waking, setWaking] = useState(false);
  const wokeRef = useRef(false);

  // 1. Listener 1: Suppress first touch after wake
  // This runs FIRST (registered first), in capture phase, before the touch reporter
  useEffect(() => {
    const suppressHandler = (e: PointerEvent) => {
      if (wokeRef.current) {
        e.stopPropagation();
        e.preventDefault();
        wokeRef.current = false;
      }
    };

    // Register in capture phase (third parameter = true)
    // This will run before the touch reporter listener
    document.addEventListener('pointerdown', suppressHandler, true);
    return () => document.removeEventListener('pointerdown', suppressHandler, true);
  }, []);

  // 2. Listener 2: Report every touch to Main
  // This runs SECOND (registered second), also in capture phase
  // By the time this fires, the suppress listener has already decided whether to suppress
  useEffect(() => {
    const reportHandler = () => {
      window.hoermond.invoke('display:touch', undefined);
    };

    // Register in capture phase
    // Even if the suppress listener called preventDefault(), we still report the touch
    // so Main's inactivity timer gets reset
    document.addEventListener('pointerdown', reportHandler, true);
    return () => document.removeEventListener('pointerdown', reportHandler, true);
  }, []);

  // 3. Listen for display:state events
  // When display turns on after being off → set wake flag and trigger fade-in
  useEffect(() => {
    const off = window.hoermond.on('display:state', (e) => {
      if (e.on && displayOff) {
        // Transitioned from off to on → set wake flag
        wokeRef.current = true;

        // Trigger fade-in animation via double rAF
        // First rAF to set initial state, second to trigger transition
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            setWaking(false); // This triggers opacity fade (CSS transition)
          });
        });

        setWaking(true); // Initially visible (opaque)
      }
      setDisplayOff(!e.on);
    });

    return () => off();
  }, [displayOff]);

  return (
    <>
      {/* Wake fade-in overlay: black overlay that fades to transparent when display wakes */}
      {displayOff && (
        <div className={`wake-fade ${!waking ? 'wake-fade--visible' : ''}`} />
      )}
      {children}
    </>
  );
}
