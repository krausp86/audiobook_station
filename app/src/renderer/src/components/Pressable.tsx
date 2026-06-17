import { useState, useRef, type ReactNode, type PointerEvent } from 'react';

/**
 * Pressable component: interactive element with tap feedback.
 * Renders press-feedback (scale 0.96, brightness change) on pointer down.
 * Hooks allow long-press detection and other pointer-based interactions.
 * Tap is only fired if pointer movement is < 14px (prevents accidental taps during scrolling).
 */
interface PressableProps {
  onTap?: () => void;
  /** zusätzliche Klassen (z. B. Layout der Kachel/des Buttons). */
  className?: string;
  children: ReactNode;
  /** optionale Pointer-Hooks (z. B. für Long-Press-Hook T3.13b). */
  onPointerDown?: (e: PointerEvent) => void;
  onPointerMove?: (e: PointerEvent) => void;
  onPointerUp?: (e: PointerEvent) => void;
  onPointerLeave?: (e: PointerEvent) => void;
  disabled?: boolean;
}

const MOVE_THRESHOLD_PX = 14; // Matches useLongPress threshold

export default function Pressable({
  onTap,
  className,
  children,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerLeave,
  disabled,
}: PressableProps): React.JSX.Element {
  const [pressed, setPressed] = useState(false);
  const startPosRef = useRef<{ x: number; y: number } | null>(null);

  const handlePointerDown = (e: PointerEvent): void => {
    if (!disabled) {
      setPressed(true);
      startPosRef.current = { x: e.clientX, y: e.clientY };
      onPointerDown?.(e);
    }
  };

  const handlePointerMove = (e: PointerEvent): void => {
    onPointerMove?.(e);
  };

  const handlePointerUp = (e: PointerEvent): void => {
    if (disabled) return;
    setPressed(false);
    onPointerUp?.(e);

    // Only fire onTap if movement was below threshold
    const start = startPosRef.current;
    const moved =
      start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > MOVE_THRESHOLD_PX;
    if (!moved) {
      onTap?.();
    }
    startPosRef.current = null;
  };

  const handlePointerLeave = (e: PointerEvent): void => {
    setPressed(false);
    startPosRef.current = null;
    onPointerLeave?.(e);
  };

  const handlePointerCancel = (): void => {
    setPressed(false);
    startPosRef.current = null;
  };

  return (
    <div
      className={`pressable${pressed ? ' is-pressed' : ''}${className ? ' ' + className : ''}`}
      role="button"
      aria-disabled={disabled}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerLeave}
      onPointerCancel={handlePointerCancel}
    >
      {children}
    </div>
  );
}
