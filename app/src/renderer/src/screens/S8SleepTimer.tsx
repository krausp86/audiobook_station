import { useEffect, useState } from 'react';
import { useT } from '../i18n/I18nContext';
import Pressable from '../components/Pressable';
import type { SleepMode } from '@shared/ipc-contract';

/**
 * S8 Sleep Timer Dialog: modal overlay for sleep timer configuration.
 *
 * Features:
 * - Display four sleep modes: 15/30/60 min + until chapter end
 * - Load and highlight the currently active timer mode on mount
 * - Tap a mode button to start the sleep timer
 * - If timer is active, show an additional "Cancel" button to abort
 * - Modal pattern: scrim, enter 220ms (fade + scale 0.96→1.0), exit 160ms, tap outside closes
 * - Touch-targets: min 44px, spacing ≥ 16px
 */
interface S8Props {
  /** Callback when dialog should close (after action or tap outside) */
  onClose: () => void;
}

export default function S8SleepTimer({ onClose }: S8Props): React.JSX.Element {
  const t = useT();
  const [entered, setEntered] = useState(false);
  const [closing, setClosing] = useState(false);
  const [activeMode, setActiveMode] = useState<SleepMode | null>(null);
  const [timerActive, setTimerActive] = useState(false);

  // Entry animation (requestAnimationFrame ensures CSS transition is set before class applies)
  useEffect(() => {
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, []);

  // Load initial sleep state on mount
  useEffect(() => {
    const loadSleep = async (): Promise<void> => {
      try {
        const sleep = await window.hoermond.invoke('sleep:get', undefined);
        if (sleep.active && sleep.mode) {
          setActiveMode(sleep.mode);
          setTimerActive(true);
        }
      } catch (err) {
        console.error('[S8] loadSleep failed:', err);
      }
    };
    void loadSleep();

    // Subscribe to sleep state changes
    const offTick = window.hoermond.on('sleep:tick', () => setTimerActive(true));
    const offEnd = window.hoermond.on('sleep:ended', () => {
      setTimerActive(false);
      setActiveMode(null);
    });
    return () => {
      offTick();
      offEnd();
    };
  }, []);

  /**
   * Close dialog with 160ms exit animation.
   */
  const close = (): void => {
    if (closing) return;
    setClosing(true);
    setTimeout(onClose, 160);
  };

  /**
   * Start sleep timer with selected mode.
   */
  const handleSelectMode = async (mode: SleepMode): Promise<void> => {
    try {
      const result = await window.hoermond.invoke('sleep:start', { mode });
      if (result.ok) {
        setActiveMode(mode);
        setTimerActive(true);
        close();
      }
    } catch (err) {
      console.error('[S8] sleep:start failed:', err);
    }
  };

  /**
   * Cancel active sleep timer.
   */
  const handleCancel = async (): Promise<void> => {
    try {
      const result = await window.hoermond.invoke('sleep:cancel', undefined);
      if (result.ok) {
        setTimerActive(false);
        setActiveMode(null);
        close();
      }
    } catch (err) {
      console.error('[S8] sleep:cancel failed:', err);
    }
  };

  /**
   * Close on tap outside scrim.
   */
  const handleScrimTap = (e: React.MouseEvent): void => {
    if (e.target === e.currentTarget) {
      close();
    }
  };

  const modes: SleepMode[] = ['min15', 'min30', 'min60', 'chapterEnd'];

  return (
    <div
      className={`s8-scrim${entered ? ' is-entered' : ''}${closing ? ' is-closing' : ''}`}
      onClick={handleScrimTap}
      role="presentation"
    >
      <div className="s8-card">
        <h2 className="s8-title">{t('sleep.title')}</h2>

        {/* Mode Selection */}
        <div className="s8-modes">
          {modes.map((mode) => (
            <div
              key={mode}
              role="button"
              aria-label={t(`sleep.mode.${mode}`)}
              aria-pressed={activeMode === mode}
              tabIndex={0}
            >
              <Pressable
                className={`s8-mode-button${activeMode === mode ? ' s8-mode-button--active' : ''}`}
                onTap={() => handleSelectMode(mode)}
              >
                {t(`sleep.mode.${mode}`)}
              </Pressable>
            </div>
          ))}
        </div>

        {/* Cancel button (only if timer is active) */}
        {timerActive && (
          <Pressable
            className="s8-cancel-button"
            onTap={handleCancel}
            ariaLabel={t('sleep.cancel')}
          >
            {t('sleep.cancel')}
          </Pressable>
        )}

        {/* Close hint when no timer active */}
        {!timerActive && (
          <p className="s8-hint">{t('sleep.close')}</p>
        )}
      </div>
    </div>
  );
}
