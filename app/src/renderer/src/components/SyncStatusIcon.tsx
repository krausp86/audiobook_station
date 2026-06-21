import { useEffect, useState } from 'react';
import { useT } from '../i18n/I18nContext';
import Pressable from './Pressable';
import type { SyncState, SyncLogEntry } from '@shared/ipc-contract';

/**
 * SyncStatusIcon: displays sync status (idle/running/error) in titlebar.
 *
 * Features:
 * - ✅ idle: green checkmark (--success #2E7D52)
 * - 🔄 running: blue refresh icon, rotating 360°/1.4s linear (--info #2563B0)
 * - ⚠️ error: amber warning triangle (--warning #A85F0C), tappable → detail overlay
 *
 * SVG icons are inline, viewBox="0 0 24 24".
 * Respects prefers-reduced-motion: disables rotation animation.
 */
export default function SyncStatusIcon(): React.JSX.Element {
  const t = useT();
  const [state, setState] = useState<SyncState>('idle');
  const [showDetails, setShowDetails] = useState(false);
  const [lastError, setLastError] = useState<SyncLogEntry | null>(null);

  // Load initial sync state and subscribe to updates
  useEffect(() => {
    void window.hoermond.invoke('sync:getState', undefined).then((res) => {
      setState(res.state);
      // Load error details if state is error
      if (res.state === 'error') {
        void window.hoermond.invoke('sync:getLog', undefined).then((log) => {
          if (log.entries.length > 0) {
            setLastError(log.entries[0]);
          }
        });
      }
    });

    const off = window.hoermond.on('sync:state', (e) => {
      setState(e.state);
      // Refetch error details when state changes to error
      if (e.state === 'error') {
        void window.hoermond.invoke('sync:getLog', undefined).then((log) => {
          if (log.entries.length > 0) {
            setLastError(log.entries[0]);
          }
        });
      }
    });

    return () => off();
  }, []);

  const handleOpenDetails = (): void => {
    if (state === 'error') {
      setShowDetails(true);
    }
  };

  return (
    <>
      <Pressable
        className={`sync-status-icon sync-status-icon--${state}`}
        onTap={handleOpenDetails}
        ariaLabel={t(`sync.icon.${state}`)}
      >
        {state === 'idle' && (
          <svg
            className="sync-status-icon-svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            {/* Checkmark */}
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}

        {state === 'running' && (
          <svg
            className="sync-status-icon-svg sync-status-icon-svg--spinning"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            {/* Refresh/Sync icon */}
            <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
            <path d="M21 3v5h-5" />
            <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
            <path d="M3 21v-5h5" />
          </svg>
        )}

        {state === 'error' && (
          <svg
            className="sync-status-icon-svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            {/* Warning triangle */}
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3.05h16.94a2 2 0 0 0 1.71-3.05l-8.47-14.14a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        )}
      </Pressable>

      {/* Detail Overlay (error only) */}
      {showDetails && state === 'error' && (
        <SyncDetailsOverlay
          lastError={lastError}
          onClose={() => setShowDetails(false)}
        />
      )}
    </>
  );
}

/**
 * SyncDetailsOverlay: shows the last error entry from sync log.
 *
 * Modal pattern: scrim + card, enter 220ms (fade+scale), exit 160ms.
 * Tap outside or close button closes overlay.
 */
interface SyncDetailsOverlayProps {
  lastError: SyncLogEntry | null;
  onClose: () => void;
}

function SyncDetailsOverlay({
  lastError,
  onClose,
}: SyncDetailsOverlayProps): React.JSX.Element {
  const t = useT();
  const [entered, setEntered] = useState(false);
  const [closing, setClosing] = useState(false);

  // Entry animation
  useEffect(() => {
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const handleClose = (): void => {
    if (closing) return;
    setClosing(true);
    setTimeout(onClose, 160); // Exit: 160ms fade
  };

  return (
    <div
      className={`sync-details-scrim${entered && !closing ? ' is-entered' : ''}${closing ? ' is-closing' : ''}`}
      onClick={handleClose}
      role="presentation"
    >
      <div
        className="sync-details-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={t('sync.details.title')}
      >
        <h2 className="sync-details-title t-heading">
          {t('sync.details.title')}
        </h2>

        {lastError ? (
          <div className="sync-details-content">
            <div className="sync-details-row">
              <span className="sync-details-label">
                {t(`sync.log.${lastError.phase}`)}
              </span>
              <span className="sync-details-value">
                {formatTimestamp(lastError.ts)}
              </span>
            </div>
            {lastError.message && (
              <div className="sync-details-message">
                {lastError.message}
              </div>
            )}
          </div>
        ) : (
          <p className="sync-details-empty">
            {t('sync.log.empty')}
          </p>
        )}

        <Pressable
          className="sync-details-close-button"
          onTap={handleClose}
          ariaLabel={t('sync.details.close')}
        >
          {t('sync.details.close')}
        </Pressable>
      </div>
    </div>
  );
}

/**
 * Format ISO-8601 timestamp as readable string (DD.MM. HH:mm).
 */
function formatTimestamp(iso: string): string {
  try {
    const date = new Date(iso);
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${day}.${month}. ${hours}:${minutes}`;
  } catch {
    return iso;
  }
}
