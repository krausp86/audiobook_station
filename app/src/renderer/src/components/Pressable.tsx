import { useState, type ReactNode, type PointerEvent } from 'react';

/**
 * Pressable component: interactive element with tap feedback.
 * Renders press-feedback (scale 0.96, brightness change) on pointer down.
 * Hooks allow long-press detection and other pointer-based interactions.
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

  return (
    <div
      className={`pressable${pressed ? ' is-pressed' : ''}${className ? ' ' + className : ''}`}
      role="button"
      aria-disabled={disabled}
      onPointerDown={(e) => {
        if (!disabled) {
          setPressed(true);
          onPointerDown?.(e);
        }
      }}
      onPointerMove={(e) => {
        onPointerMove?.(e);
      }}
      onPointerUp={(e) => {
        if (disabled) return;
        setPressed(false);
        onPointerUp?.(e);
        onTap?.();
      }}
      onPointerLeave={(e) => {
        setPressed(false);
        onPointerLeave?.(e);
      }}
      onPointerCancel={() => setPressed(false)}
    >
      {children}
    </div>
  );
}
