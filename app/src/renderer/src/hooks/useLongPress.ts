import { useRef, useState, useCallback, type PointerEvent } from 'react';

const LONG_PRESS_MS = 600; // Schwelle für S4
const HOLD_START_MS = 300; // ab hier wächst der Ring
const HOLD_SPAN_MS = LONG_PRESS_MS - HOLD_START_MS; // 300ms Wachstum

/**
 * useLongPress: distinguish between tap and long-press (600ms threshold).
 * Provides holdRatio (0..1) for visual feedback starting at 300ms.
 * Prevents accidental tap when long-pressing by using a fired flag.
 */
interface UseLongPressOptions {
  onLongPress: () => void;
  onTap: () => void;
}

interface UseLongPressResult {
  onPointerDown: (e: PointerEvent) => void;
  onPointerUp: (e: PointerEvent) => void;
  onPointerLeave: (e: PointerEvent) => void;
  /** 0..1 from 300ms; 0 outside hold phase. For visual ring feedback. */
  holdRatio: number;
}

export function useLongPress({ onLongPress, onTap }: UseLongPressOptions): UseLongPressResult {
  const [holdRatio, setHoldRatio] = useState(0);
  const startRef = useRef<number>(0);
  const firedRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cleanup = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    rafRef.current = null;
    timerRef.current = null;
    setHoldRatio(0);
  }, []);

  const tick = useCallback(() => {
    const elapsed = Date.now() - startRef.current;
    const ratio = Math.min(1, Math.max(0, (elapsed - HOLD_START_MS) / HOLD_SPAN_MS));
    setHoldRatio(ratio);
    if (elapsed < LONG_PRESS_MS) {
      rafRef.current = requestAnimationFrame(tick);
    }
  }, []);

  const onPointerDown = useCallback(
    (_e: PointerEvent) => {
      firedRef.current = false;
      startRef.current = Date.now();
      setHoldRatio(0);
      rafRef.current = requestAnimationFrame(tick);
      timerRef.current = setTimeout(() => {
        firedRef.current = true; // long-press detected
        cleanup();
        onLongPress();
      }, LONG_PRESS_MS);
    },
    [tick, cleanup, onLongPress],
  );

  const onPointerUp = useCallback(
    (_e: PointerEvent) => {
      const wasLong = firedRef.current;
      cleanup();
      if (!wasLong) onTap(); // released before 600ms => short tap
    },
    [cleanup, onTap],
  );

  const onPointerLeave = useCallback(
    (_e: PointerEvent) => {
      // Finger slides away: cancel both tap and long-press
      firedRef.current = true;
      cleanup();
    },
    [cleanup],
  );

  return { onPointerDown, onPointerUp, onPointerLeave, holdRatio };
}
