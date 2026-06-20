import { createContext, useContext, useState, useCallback, useRef, ReactNode } from 'react';

/**
 * Toast context: provides a global `showToast` function to display brief notifications.
 *
 * The toast system displays a single notification at a time (multiple concurrent toasts
 * replace the previous one). Animation sequence:
 * - In: 200ms (slide + fade in)
 * - Visible: 3.5s (stable display)
 * - Out: 200ms (slide + fade out)
 * - Then removed from DOM
 *
 * Used across the app for status messages, connection notifications, and errors.
 */

type ToastPhase = 'in' | 'visible' | 'out';

interface Toast {
  id: number;
  text: string;
  phase: ToastPhase;
}

interface ToastContextType {
  showToast: (text: string) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

/**
 * Hook to use the toast context.
 * Must be called within a <ToastProvider>.
 *
 * @returns Object with `showToast(text: string)` function
 * @throws If called outside of ToastProvider
 */
export function useToast(): ToastContextType {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within <ToastProvider>');
  }
  return ctx;
}

/**
 * Provider component for the toast system.
 * Wraps the app and manages the global toast state.
 *
 * Example usage:
 * ```tsx
 * <ToastProvider>
 *   <App />
 * </ToastProvider>
 * ```
 *
 * Inside components, call:
 * ```tsx
 * const { showToast } = useToast();
 * showToast('Connection established');
 * ```
 */
export function ToastProvider({
  children,
}: {
  children: ReactNode;
}): React.JSX.Element {
  const [toast, setToast] = useState<Toast | null>(null);
  const toastIdRef = useRef(0);
  const timersRef = useRef<{
    phase?: NodeJS.Timeout;
    visible?: NodeJS.Timeout;
    out?: NodeJS.Timeout;
  }>({});

  const showToast = useCallback((text: string) => {
    // Clear any pending timers from previous toast
    if (timersRef.current.phase) clearTimeout(timersRef.current.phase);
    if (timersRef.current.visible) clearTimeout(timersRef.current.visible);
    if (timersRef.current.out) clearTimeout(timersRef.current.out);
    timersRef.current = {};

    const id = ++toastIdRef.current;

    // Create toast in 'in' phase (will animate in via CSS)
    setToast({ id, text, phase: 'in' });

    // Transition to 'visible' after 200ms (in animation completes)
    timersRef.current.phase = setTimeout(() => {
      setToast((prev) => (prev?.id === id ? { ...prev, phase: 'visible' } : null));
    }, 200);

    // Transition to 'out' after additional 3500ms (visible duration)
    timersRef.current.visible = setTimeout(() => {
      setToast((prev) => (prev?.id === id ? { ...prev, phase: 'out' } : null));
    }, 200 + 3500);

    // Remove from DOM after 200ms (out animation, spec: 200ms)
    timersRef.current.out = setTimeout(() => {
      setToast((prev) => (prev?.id === id ? null : prev));
    }, 200 + 3500 + 200);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {toast && (
        <div
          className={`toast toast--${toast.phase}`}
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          {toast.text}
        </div>
      )}
    </ToastContext.Provider>
  );
}
