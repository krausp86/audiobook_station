import { useRef, useState, useCallback, type PointerEvent } from 'react';

const GATE_MS = 2000; // Threshold for opening parent gate
const RING_START_MS = 400; // Ring becomes visible after this (no flicker on normal tap)
const RING_SPAN_MS = GATE_MS - RING_START_MS; // Duration of ring fill (1600 ms)
const MOVE_THRESHOLD_PX = 14; // Tolerance for small touch drift

/**
 * Options for useParentGate hook.
 */
interface UseParentGateOptions {
  /** Callback fired when the 2-second hold is completed without movement. */
  onTrigger: () => void;
}

/**
 * Result from useParentGate hook.
 * Includes pointer event handlers and ring fill ratio (0..1).
 */
interface UseParentGateResult {
  /** Pointer down handler: start tracking hold. */
  onPointerDown: (e: PointerEvent) => void;
  /** Pointer move handler: detect movement and cancel if threshold exceeded. */
  onPointerMove: (e: PointerEvent) => void;
  /** Pointer up handler: cancel tracking (no action). */
  onPointerUp: (e: PointerEvent) => void;
  /** Pointer leave handler: cancel tracking (no action). */
  onPointerLeave: (e: PointerEvent) => void;
  /** Ring fill ratio (0..1), 0 before 400ms and after release. Used for visual progress. */
  ringRatio: number;
}

/**
 * Hook for detecting a long (2-second) parent gate gesture on a Logo or similar element.
 * Provides a progress ring that starts filling at 400ms and completes at 2000ms.
 * If the user moves more than 14px or releases before 2000ms, the gesture is cancelled.
 *
 * This hook is distinct from useLongPress (which is 600ms for S4 detail) — do not modify
 * useLongPress, as that would break S4 behavior.
 *
 * @param options hook configuration
 * @returns pointer handlers and ringRatio for rendering
 */
export function useParentGate({ onTrigger }: UseParentGateOptions): UseParentGateResult {
  const [ringRatio, setRingRatio] = useState(0);
  const startRef = useRef(0);
  const startPosRef = useRef({ x: 0, y: 0 });
  const movedRef = useRef(false);
  const firedRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cleanup = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    rafRef.current = null;
    timerRef.current = null;
    setRingRatio(0);
  }, []);

  const tick = useCallback(() => {
    const elapsed = Date.now() - startRef.current;
    // Ring ratio is 0 until RING_START_MS, then grows linearly to 1 at GATE_MS
    const ratio = Math.min(1, Math.max(0, (elapsed - RING_START_MS) / RING_SPAN_MS));
    setRingRatio(ratio);
    if (elapsed < GATE_MS) {
      rafRef.current = requestAnimationFrame(tick);
    }
  }, []);

  const onPointerDown = useCallback(
    (e: PointerEvent) => {
      firedRef.current = false;
      movedRef.current = false;
      startRef.current = Date.now();
      startPosRef.current = { x: e.clientX, y: e.clientY };
      setRingRatio(0);

      // Capture pointer so touch events stay on this element even if finger drifts
      (e.target as Element).setPointerCapture(e.pointerId);

      rafRef.current = requestAnimationFrame(tick);

      timerRef.current = setTimeout(() => {
        if (movedRef.current) return; // Already cancelled by movement
        firedRef.current = true;
        cleanup();
        onTrigger();
      }, GATE_MS);
    },
    [tick, cleanup, onTrigger],
  );

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      if (movedRef.current) return; // Already detected movement
      const dx = e.clientX - startPosRef.current.x;
      const dy = e.clientY - startPosRef.current.y;
      if (dx * dx + dy * dy > MOVE_THRESHOLD_PX * MOVE_THRESHOLD_PX) {
        movedRef.current = true;
        firedRef.current = true;
        cleanup();
      }
    },
    [cleanup],
  );

  const onPointerUp = useCallback(() => {
    cleanup();
  }, [cleanup]);

  const onPointerLeave = useCallback(() => {
    firedRef.current = true;
    cleanup();
  }, [cleanup]);

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerLeave,
    ringRatio,
  };
}
