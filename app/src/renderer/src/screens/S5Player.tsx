import { useEffect, useState, useRef } from 'react';
import { useT } from '../i18n/I18nContext';
import ProgressBar from '../components/ProgressBar';
import PlayerControls from '../components/PlayerControls';
import BackButton from '../components/BackButton';
import Pressable from '../components/Pressable';
import S6Chapters from './S6Chapters';
import S7Bluetooth from './S7Bluetooth';
import S8SleepTimer from './S8SleepTimer';
import type { MediaItem, PlayerState } from '@shared/ipc-contract';

/**
 * S5 Player Screen: full-screen playback interface.
 *
 * Layout (800×480, no scroll):
 * - Titlebar (44px): BackButton + Title + Placeholder Icons (BT, Moon)
 * - Content (436px):
 *   - Left: Cover (~300×300px), vertically centered
 *   - Right: Metadata (title, chapter) + ProgressBar + PlayerControls
 *
 * Auto-plays on mount if currentPath !== item.path.
 * Subscribes to player:state for live updates.
 * Chapter navigation and volume controls dispatched via IPC.
 */
interface S5PlayerProps {
  /** Media item currently being played */
  item: MediaItem;

  /** Callback to return to grid (or library screen) */
  onBack: () => void;
}

export default function S5Player({ item, onBack }: S5PlayerProps): React.JSX.Element {
  const t = useT();
  const [playerState, setPlayerState] = useState<PlayerState | null>(null);
  const [chaptersOpen, setChaptersOpen] = useState(false);
  const [btOpen, setBtOpen] = useState(false);
  const [btConnected, setBtConnected] = useState(false);
  const [atMaxVolume, setAtMaxVolume] = useState(false);
  const [sleepOpen, setSleepOpen] = useState(false);
  const [sleepRemainingMs, setSleepRemainingMs] = useState<number | null>(null);
  const sleepActive = sleepRemainingMs !== null;
  const lastRequestedVolumeRef = useRef<number | null>(null);

  // Load initial player state and subscribe to updates
  useEffect(() => {
    void window.hoermond.invoke('player:getState', undefined).then(setPlayerState);
    const off = window.hoermond.on('player:state', setPlayerState);
    return () => off();
  }, []);

  // Load BT status and subscribe to connection events
  useEffect(() => {
    const loadBt = (): void => {
      void window.hoermond
        .invoke('bt:getStatus', undefined)
        .then((s) => setBtConnected(s.connected !== null));
    };
    loadBt();
    // Retry once after 2s — at boot, BT may still be connecting
    const retry = setTimeout(loadBt, 2000);
    const off = window.hoermond.on('bt:connection', (e) =>
      setBtConnected(e.device !== null),
    );
    return () => { clearTimeout(retry); off(); };
  }, []);

  // Load sleep timer state and subscribe to countdown updates
  useEffect(() => {
    void window.hoermond.invoke('sleep:get', undefined).then((s) => {
      setSleepRemainingMs(s.active && s.endsAt ? s.endsAt - Date.now() : s.active ? 1 : null);
    });
    const offTick = window.hoermond.on('sleep:tick', (e) => setSleepRemainingMs(e.remainingMs));
    const offEnd = window.hoermond.on('sleep:ended', () => setSleepRemainingMs(null));
    return () => { offTick(); offEnd(); };
  }, []);

  // Auto-play ONCE on mount if not already playing this item.
  // hasPlayedRef tracks whether this item has been successfully loaded — once true,
  // the effect will never restart playback (prevents loop when track naturally ends
  // and currentUnitPath becomes null).
  const hasPlayedRef = useRef(false);
  const playRequestedRef = useRef(false);
  useEffect(() => {
    if (!playerState) return;
    if (playerState.currentUnitPath === item.path) {
      hasPlayedRef.current = true;
      playRequestedRef.current = false;
      return;
    }
    if (hasPlayedRef.current) return;
    if (playRequestedRef.current) return;
    playRequestedRef.current = true;
    void window.hoermond.invoke('player:play', { path: item.path });
  }, [item.path, playerState?.currentUnitPath]);

  // Client-side position tick: MPD idle only fires on state changes, not during
  // continuous playback. We increment +1s locally every second. Any server push
  // (seek, pause, track change) resets to the authoritative value.
  const [localPosition, setLocalPosition] = useState(0);

  useEffect(() => {
    if (!playerState) return undefined;
    setLocalPosition(playerState.position);

    // E14 feedback: check if volume didn't increase (hit parent limit)
    if (lastRequestedVolumeRef.current !== null && playerState.volume !== null) {
      const hitLimit = playerState.volume < lastRequestedVolumeRef.current;
      lastRequestedVolumeRef.current = null;
      if (hitLimit) {
        setAtMaxVolume(true);
        const timer = setTimeout(() => setAtMaxVolume(false), 200);
        return () => clearTimeout(timer);
      }
    }
    return undefined;
  }, [playerState]);

  // Client-side countdown tick: decrement sleep remaining time locally every second.
  // `sleep:tick` from server acts as authoritative correction.
  useEffect(() => {
    if (sleepRemainingMs === null) return;
    const id = setInterval(() => {
      setSleepRemainingMs((prev) => (prev !== null ? Math.max(0, prev - 1000) : null));
    }, 1000);
    return () => clearInterval(id);
  }, [sleepRemainingMs !== null]);

  // Player position tick: increment locally during playback.
  useEffect(() => {
    if (playerState?.status !== 'playing') return;
    const id = setInterval(() => {
      setLocalPosition((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(id);
  }, [playerState?.status]);

  const handlePlayPause = (): void => {
    if (playerState?.status === 'stopped' || !playerState?.currentUnitPath) {
      void window.hoermond.invoke('player:play', { path: item.path });
    } else {
      // Toggle: playing → pause, paused → unpause
      void window.hoermond.invoke('player:pause', undefined);
    }
  };

  const handlePrevChapter = (): void => {
    void window.hoermond.invoke('player:chapterPrev', undefined);
  };

  const handleNextChapter = (): void => {
    void window.hoermond.invoke('player:chapterNext', undefined);
  };

  const handleBack15 = (): void => {
    void window.hoermond.invoke('player:seekRelative', { deltaSeconds: -15 });
  };

  const handleForward30 = (): void => {
    void window.hoermond.invoke('player:seekRelative', { deltaSeconds: 30 });
  };

  const handleVolumeDown = (): void => {
    if (playerState?.volume == null) return;
    lastRequestedVolumeRef.current = null;
    const newVol = Math.max(0, playerState.volume - 10);
    void window.hoermond.invoke('player:setVolume', { volume: newVol });
  };

  const handleVolumeUp = (): void => {
    if (playerState?.volume == null) return;
    const newVol = Math.min(100, (playerState?.volume ?? 0) + 10);
    lastRequestedVolumeRef.current = newVol;
    void window.hoermond.invoke('player:setVolume', { volume: newVol });
  };

  const handleSeekCommit = (seconds: number): void => {
    void window.hoermond.invoke('player:seek', { position: seconds });
  };

  const currentChapter =
    playerState?.chapters && playerState.currentChapterIndex !== null
      ? playerState.chapters[playerState.currentChapterIndex]
      : null;

  const hasChapters = playerState?.chapters && playerState.chapters.length > 1;

  const handleChapterGoto = (index: number): void => {
    void window.hoermond.invoke('player:chapterGoto', { index });
  };

  return (
    <div className="s5-player">
      {/* Titlebar */}
      <div className="s5-titlebar">
        <div className="s5-titlebar-left">
          <BackButton onBack={onBack} ariaLabel={t('nav.back')} />
          <h1 className="t-heading" style={{ margin: 0, flex: 1 }}>
            {item.title}
          </h1>
        </div>

        {/* Icons */}
        <div className="s5-titlebar-icons">
          {/* Bluetooth icon — connected or disconnected */}
          <Pressable
            className={`s5-bt-icon${btConnected ? ' s5-bt-icon--connected' : ' s5-bt-icon--disconnected'}`}
            onTap={() => setBtOpen(true)}
            ariaLabel={
              btConnected
                ? t('bt.icon.connected')
                : t('bt.icon.disconnected')
            }
          >
            {btConnected ? (
              <svg
                className="s5-titlebar-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <polyline points="6.5 6.5 12 12 17.5 6.5" />
                <polyline points="6.5 17.5 12 12 17.5 17.5" />
                <line x1="12" y1="2" x2="12" y2="22" />
              </svg>
            ) : (
              <svg
                className="s5-titlebar-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M12 2v6.5L16 5" />
                <path d="M12 22v-6.5L16 19" />
                <line x1="12" y1="8.5" x2="12" y2="15.5" />
                <line x1="3" y1="21" x2="21" y2="3" strokeWidth="2.5" />
              </svg>
            )}
          </Pressable>

          {/* Moon icon — opens S8 Sleep Timer */}
          <Pressable
            className="s5-bt-icon"
            onTap={() => setSleepOpen(true)}
            ariaLabel={t('sleep.icon')}
          >
            <svg
              className={`s5-titlebar-icon${sleepActive ? ' s5-moon-icon--active' : ''}`}
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          </Pressable>
        </div>
      </div>

      {/* Content: Cover + Controls */}
      <div className="s5-content">
        {/* Left: Cover */}
        <div className="s5-cover-column">
          <div className="s5-cover">
            {item.coverPath && (
              <img
                className="s5-cover-image"
                src={item.coverPath.startsWith('file://') ? item.coverPath : `file://${item.coverPath}`}
                alt={item.title}
              />
            )}
          </div>
        </div>

        {/* Right: Metadata + Progress + Controls */}
        <div className="s5-controls-column">
          <div className="s5-metadata">
            <h2 className="s5-title">{item.title}</h2>
            {item.artist && (
              <p className="s5-artist">{item.artist}</p>
            )}
            {currentChapter && (
              <p className="s5-chapter-label">
                {currentChapter.title}
              </p>
            )}
          </div>

          {/* Progress bar */}
          <div className="s5-progress">
            <ProgressBar
              position={localPosition}
              duration={playerState?.duration ?? null}
              chapters={playerState?.chapters ?? []}
              onSeekCommit={handleSeekCommit}
            />
          </div>

          {/* Controls */}
          <div className="s5-controls">
            <PlayerControls
              status={playerState?.status ?? 'stopped'}
              volume={playerState?.volume ?? null}
              hasChapters={!!hasChapters}
              atMaxVolume={atMaxVolume}
              onPlayPause={handlePlayPause}
              onPrevChapter={handlePrevChapter}
              onNextChapter={handleNextChapter}
              onBack15={handleBack15}
              onForward30={handleForward30}
              onVolumeDown={handleVolumeDown}
              onVolumeUp={handleVolumeUp}
              onOpenChapters={() => setChaptersOpen(true)}
            />
          </div>
        </div>
      </div>

      {/* S6 Chapters overlay */}
      {chaptersOpen && hasChapters && playerState?.chapters && (
        <S6Chapters
          chapters={playerState.chapters}
          currentChapterIndex={playerState.currentChapterIndex}
          onGoto={handleChapterGoto}
          onClose={() => setChaptersOpen(false)}
        />
      )}

      {/* S7 Bluetooth overlay */}
      {btOpen && (
        <S7Bluetooth
          onClose={() => setBtOpen(false)}
        />
      )}

      {/* S8 Sleep Timer overlay */}
      {sleepOpen && (
        <S8SleepTimer onClose={() => setSleepOpen(false)} />
      )}

      {/* Sleep Countdown Display (always visible when timer active) */}
      {sleepRemainingMs !== null && (
        <div className="s5-sleep-countdown-container">
          <Pressable
            className="s5-sleep-countdown"
            onTap={() => { void window.hoermond.invoke('sleep:cancel', undefined); }}
            ariaLabel={t('sleep.countdown.tapToCancel')}
          >
            <div className="s5-sleep-countdown-time">
              {formatCountdown(sleepRemainingMs)}
            </div>
            <div className="s5-sleep-countdown-label">
              {t('sleep.countdown.label')}
            </div>
          </Pressable>
        </div>
      )}
    </div>
  );
}

/**
 * Format milliseconds as mm:ss countdown display.
 * Example: 65500ms → "01:05"
 */
function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}
