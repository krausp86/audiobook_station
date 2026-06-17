import { useT } from '../i18n/I18nContext';
import Pressable from './Pressable';

/**
 * PlayerControls component: buttons for playback control.
 *
 * Layout (centered, min 16px gap):
 * - Top row: Play/Pause (84×84, centered)
 * - Middle rows: ⏮ ⏭ (64×64) | ⏪ ⏩ (64×64)
 * - Bottom row: − (60×60) | + (60×60)
 *
 * All buttons use inline SVG with visually-hidden labels (a11y).
 * Press feedback from <Pressable>.
 */
interface PlayerControlsProps {
  /** Current playback status (determines play/pause icon) */
  status: 'playing' | 'paused' | 'stopped';

  /** Current volume level (0–100), or null if unavailable */
  volume: number | null;

  /** Called when play/pause button is tapped */
  onPlayPause: () => void;

  /** Called when previous-chapter button is tapped */
  onPrevChapter: () => void;

  /** Called when next-chapter button is tapped */
  onNextChapter: () => void;

  /** Called when back-15s button is tapped */
  onBack15: () => void;

  /** Called when forward-30s button is tapped */
  onForward30: () => void;

  /** Called when volume-down button is tapped */
  onVolumeDown: () => void;

  /** Called when volume-up button is tapped */
  onVolumeUp: () => void;
}

/**
 * Play/Pause icon: toggles between play (▶) and pause (║ ║) symbols.
 */
function PlayPauseIcon({ isPlaying }: { isPlaying: boolean }): React.JSX.Element {
  if (isPlaying) {
    // Pause icon (two vertical bars)
    return (
      <svg viewBox="0 0 24 24" width="40" height="40" fill="currentColor">
        <rect x="6" y="4" width="3" height="16" />
        <rect x="15" y="4" width="3" height="16" />
      </svg>
    );
  }
  // Play icon (right-pointing triangle)
  return (
    <svg viewBox="0 0 24 24" width="40" height="40" fill="currentColor">
      <polygon points="5,4 5,20 19,12" />
    </svg>
  );
}

/**
 * Minimal SVG icons for chapter and seek buttons.
 */
function SkipPrevIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor">
      {/* Backward arrow symbol */}
      <polygon points="8,12 12,8 12,11 18,11 18,13 12,13 12,16" />
    </svg>
  );
}

function SkipNextIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor">
      {/* Forward arrow symbol */}
      <polygon points="16,12 12,8 12,11 6,11 6,13 12,13 12,16" />
    </svg>
  );
}

function SeekBackIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor">
      {/* Rewind / -15s indicator */}
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle" fontSize="14" fontWeight="bold">
        15
      </text>
    </svg>
  );
}

function SeekForwardIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor">
      {/* Forward / +30s indicator */}
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle" fontSize="14" fontWeight="bold">
        30
      </text>
    </svg>
  );
}

function VolumeDownIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
      {/* Speaker symbol with minus */}
      <path d="M3,9v6h4l5,5V4l-5,5H3z M15,12c0-1.66-1.34-3-3-3v2c.55,0,1,.45,1,1s-.45,1-1,1v2c1.66,0,3-1.34,3-3z" />
      <line x1="22" y1="12" x2="16" y2="12" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function VolumeUpIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
      {/* Speaker symbol with plus */}
      <path d="M3,9v6h4l5,5V4l-5,5H3z M15,12c0-1.66-1.34-3-3-3v2c.55,0,1,.45,1,1s-.45,1-1,1v2c1.66,0,3-1.34,3-3z" />
      <line x1="22" y1="12" x2="16" y2="12" stroke="currentColor" strokeWidth="2" />
      <line x1="19" y1="9" x2="19" y2="15" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

export default function PlayerControls({
  status,
  volume,
  onPlayPause,
  onPrevChapter,
  onNextChapter,
  onBack15,
  onForward30,
  onVolumeDown,
  onVolumeUp,
}: PlayerControlsProps): React.JSX.Element {
  const t = useT();
  const isPlaying = status === 'playing';

  return (
    <div className="player-controls">
      {/* Play/Pause button — large, centered */}
      <div className="player-controls-row player-controls-row-play">
        <Pressable
          className="player-btn player-btn-play-pause"
          onTap={onPlayPause}
          aria-label={isPlaying ? t('player.pauseAction') : t('player.play')}
        >
          <PlayPauseIcon isPlaying={isPlaying} />
        </Pressable>
      </div>

      {/* Chapter navigation buttons */}
      <div className="player-controls-row player-controls-row-chapters">
        <Pressable
          className="player-btn player-btn-prev-chapter"
          onTap={onPrevChapter}
          aria-label={t('player.prevChapter')}
        >
          <SkipPrevIcon />
        </Pressable>
        <Pressable
          className="player-btn player-btn-next-chapter"
          onTap={onNextChapter}
          aria-label={t('player.nextChapter')}
        >
          <SkipNextIcon />
        </Pressable>
      </div>

      {/* Seek buttons */}
      <div className="player-controls-row player-controls-row-seek">
        <Pressable
          className="player-btn player-btn-back15"
          onTap={onBack15}
          aria-label={t('player.back15')}
        >
          <SeekBackIcon />
        </Pressable>
        <Pressable
          className="player-btn player-btn-forward30"
          onTap={onForward30}
          aria-label={t('player.forward30')}
        >
          <SeekForwardIcon />
        </Pressable>
      </div>

      {/* Volume buttons */}
      <div className="player-controls-row player-controls-row-volume">
        <Pressable
          className="player-btn player-btn-volume-down"
          onTap={onVolumeDown}
          disabled={volume === null}
          aria-label={t('player.volumeDown')}
        >
          <VolumeDownIcon />
        </Pressable>
        <Pressable
          className="player-btn player-btn-volume-up"
          onTap={onVolumeUp}
          disabled={volume === null}
          aria-label={t('player.volumeUp')}
        >
          <VolumeUpIcon />
        </Pressable>
      </div>
    </div>
  );
}
