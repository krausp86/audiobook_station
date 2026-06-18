import { useEffect, useState, useRef, type PointerEvent } from 'react';
import { useT } from '../i18n/I18nContext';
import ProgressBar from '../components/ProgressBar';
import PlayerControls from '../components/PlayerControls';
import BackButton from '../components/BackButton';
import S6Chapters from './S6Chapters';
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
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);

  // Load initial player state and subscribe to updates
  useEffect(() => {
    void window.hoermond.invoke('player:getState', undefined).then(setPlayerState);
    const off = window.hoermond.on('player:state', setPlayerState);
    return () => off();
  }, []);

  // Auto-play on mount if not already playing this item.
  // Uses a ref to prevent re-triggering during transient null states
  // (play() does clear → add → play, and the clear triggers an idle push with currentPath=null).
  const playRequestedRef = useRef(false);
  useEffect(() => {
    if (!playerState) return;
    if (playerState.currentPath === item.path) {
      playRequestedRef.current = false;
      return;
    }
    if (playRequestedRef.current) return;
    playRequestedRef.current = true;
    void window.hoermond.invoke('player:play', { path: item.path });
  }, [item.path, playerState?.currentPath]);

  // Client-side position interpolation: MPD idle only fires on state changes,
  // not during continuous playback, so we increment locally every second.
  const [localPosition, setLocalPosition] = useState(0);
  const serverPositionRef = useRef(0);
  const serverSyncRef = useRef(Date.now());

  useEffect(() => {
    if (!playerState) return;
    serverPositionRef.current = playerState.position;
    serverSyncRef.current = Date.now();
    setLocalPosition(playerState.position);
  }, [playerState]);

  useEffect(() => {
    if (playerState?.status !== 'playing') return;
    const id = setInterval(() => {
      const elapsed = (Date.now() - serverSyncRef.current) / 1000;
      setLocalPosition(serverPositionRef.current + elapsed);
    }, 1000);
    return () => clearInterval(id);
  }, [playerState?.status]);

  const isPlaying = playerState?.status === 'playing';

  const handlePlayPause = (): void => {
    if (isPlaying) {
      void window.hoermond.invoke('player:pause', undefined);
    } else {
      void window.hoermond.invoke('player:play', { path: item.path });
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
    const newVol = Math.max(0, playerState.volume - 10);
    void window.hoermond.invoke('player:setVolume', { volume: newVol });
  };

  const handleVolumeUp = (): void => {
    if (playerState?.volume == null) return;
    const newVol = Math.min(100, (playerState?.volume ?? 0) + 10);
    void window.hoermond.invoke('player:setVolume', { volume: newVol });
  };

  const handleSeekCommit = (seconds: number): void => {
    void window.hoermond.invoke('player:seek', { position: seconds });
  };

  const currentChapter =
    playerState?.chapters && playerState.currentChapterIndex !== null
      ? playerState.chapters[playerState.currentChapterIndex]
      : null;

  const hasChapters = playerState?.chapters && playerState.chapters.length > 0;

  // Swipe-up gesture detection (on background, not on controls)
  const handlePointerDown = (e: PointerEvent<HTMLDivElement>): void => {
    pointerStartRef.current = { x: e.clientX, y: e.clientY };
  };

  const handlePointerUp = (e: PointerEvent<HTMLDivElement>): void => {
    if (!pointerStartRef.current || !hasChapters || chaptersOpen) return;
    const deltaX = e.clientX - pointerStartRef.current.x;
    const deltaY = e.clientY - pointerStartRef.current.y;
    pointerStartRef.current = null;

    // Swipe-up: deltaY < -60px and |dy| > |dx|
    if (deltaY < -60 && Math.abs(deltaY) > Math.abs(deltaX)) {
      setChaptersOpen(true);
    }
  };

  const handleChapterGoto = (index: number): void => {
    void window.hoermond.invoke('player:chapterGoto', { index });
  };

  return (
    <div
      className="s5-player"
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
    >
      {/* Titlebar */}
      <div className="s5-titlebar">
        <div className="s5-titlebar-left">
          <BackButton onBack={onBack} ariaLabel={t('nav.back')} />
          <h1 className="t-heading" style={{ margin: 0, flex: 1 }}>
            {item.title}
          </h1>
        </div>

        {/* Placeholder icons (M6, M7) */}
        <div className="s5-titlebar-icons">
          {/* Bluetooth icon (placeholder, no function) */}
          <svg
            className="s5-titlebar-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <polyline points="17 16 12 20 7 16" />
            <polyline points="17 8 12 4 7 8" />
            <line x1="12" y1="20" x2="12" y2="4" />
          </svg>

          {/* Moon icon (placeholder, no function) */}
          <svg
            className="s5-titlebar-icon"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
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
                src={`file://${item.coverPath}`}
                alt={item.title}
              />
            )}
          </div>
        </div>

        {/* Right: Metadata + Progress + Controls */}
        <div className="s5-controls-column">
          <div className="s5-metadata">
            <h2 className="s5-title">{item.title}</h2>
            {currentChapter && (
              <p className="s5-chapter-label">
                {currentChapter.title}
              </p>
            )}
            {!currentChapter && playerState?.chapters && playerState.chapters.length > 0 && (
              <p className="s5-chapter-label">{t('player.noChapters')}</p>
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
              onPlayPause={handlePlayPause}
              onPrevChapter={handlePrevChapter}
              onNextChapter={handleNextChapter}
              onBack15={handleBack15}
              onForward30={handleForward30}
              onVolumeDown={handleVolumeDown}
              onVolumeUp={handleVolumeUp}
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
    </div>
  );
}
