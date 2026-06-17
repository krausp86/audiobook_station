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
  onPointerMove: (e: PointerEvent) => void;
  onPointerUp: (e: PointerEvent) => void;
  onPointerLeave: (e: PointerEvent) => void;
  /** 0..1 from 300ms; 0 outside hold phase. For visual ring feedback. */
  holdRatio: number;
}

const MOVE_THRESHOLD_PX = 14; // Increased for better capacitive touch scrolling detection

export function useLongPress({ onLongPress, onTap }: UseLongPressOptions): UseLongPressResult {
  const [holdRatio, setHoldRatio] = useState(0);
  const startRef = useRef<number>(0);
  const startPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const movedRef = useRef(false);
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
    (e: PointerEvent) => {
      firedRef.current = false;
      movedRef.current = false;
      startRef.current = Date.now();
      startPosRef.current = { x: e.clientX, y: e.clientY };
      setHoldRatio(0);
      rafRef.current = requestAnimationFrame(tick);
      timerRef.current = setTimeout(() => {
        if (movedRef.current) return; // scroll in progress — ignore
        firedRef.current = true;
        cleanup();
        onLongPress();
      }, LONG_PRESS_MS);
    },
    [tick, cleanup, onLongPress],
  );

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      if (movedRef.current) return;
      const dx = e.clientX - startPosRef.current.x;
      const dy = e.clientY - startPosRef.current.y;
      if (dx * dx + dy * dy > MOVE_THRESHOLD_PX * MOVE_THRESHOLD_PX) {
        movedRef.current = true;
        firedRef.current = true; // cancel tap + long-press
        cleanup();
      }
    },
    [cleanup],
  );

  const onPointerUp = useCallback(
    (_e: PointerEvent) => {
      const wasLong = firedRef.current;
      cleanup();
      if (!wasLong) onTap();
    },
    [cleanup, onTap],
  );

  const onPointerLeave = useCallback(
    (_e: PointerEvent) => {
      firedRef.current = true;
      cleanup();
    },
    [cleanup],
  );

  return { onPointerDown, onPointerMove, onPointerUp, onPointerLeave, holdRatio };
}
