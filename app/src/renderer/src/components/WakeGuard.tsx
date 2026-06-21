import { useEffect, useRef, useState } from 'react';

/**
 * WakeGuard: Handles touch-wake behavior for the display.
 *
 * Responsibilities:
 * 1. Report every touch to Main via `display:touch` (for inactivity timer reset)
 * 2. Suppress the first touch after display wake (prevents accidental Play/Pause)
 * 3. Apply a 300ms fade-in overlay when display wakes
 */
export function WakeGuard({ children }: { children: React.ReactNode }): React.JSX.Element {
  const displayOffRef = useRef(false);
  const wokeRef = useRef(false);
  const [wakeFadeActive, setWakeFadeActive] = useState(false);
  const [wakeFadeFading, setWakeFadeFading] = useState(false);

  // 1. Suppress first touch after wake (capture phase, registered first)
  useEffect(() => {
    const suppressHandler = (e: PointerEvent) => {
      if (wokeRef.current) {
        e.stopPropagation();
        e.preventDefault();
        wokeRef.current = false;
        window.hoermond.invoke('display:touch', undefined);
      }
    };
    document.addEventListener('pointerdown', suppressHandler, true);
    return () => document.removeEventListener('pointerdown', suppressHandler, true);
  }, []);

  // 2. Report every touch to Main (capture phase, registered second)
  useEffect(() => {
    const reportHandler = () => {
      window.hoermond.invoke('display:touch', undefined);
    };
    document.addEventListener('pointerdown', reportHandler, true);
    return () => document.removeEventListener('pointerdown', reportHandler, true);
  }, []);

  // 3. Listen for display:state events
  useEffect(() => {
    const off = window.hoermond.on('display:state', (e) => {
      if (e.on && displayOffRef.current) {
        wokeRef.current = true;

        // Start fade-in: overlay appears opaque, then fades to transparent
        setWakeFadeActive(true);
        setWakeFadeFading(false);

        // Next frame: trigger the CSS transition to transparent
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            setWakeFadeFading(true);
          });
        });

        // Remove overlay after transition completes
        setTimeout(() => {
          setWakeFadeActive(false);
          setWakeFadeFading(false);
        }, 320);
      }
      displayOffRef.current = !e.on;
    });

    return () => off();
  }, []);

  return (
    <>
      {wakeFadeActive && (
        <div className={`wake-fade${wakeFadeFading ? ' wake-fade--visible' : ''}`} />
      )}
      {children}
    </>
  );
}
